"""Live SN 3012 regression: retain saved repair evidence without false coverage."""

import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "ames" / "agent"))

import agent_3012_patch
import ames_3012_strategy
import production_shift
import repair_3012
from store import Store


class FakeAgent:
    def __init__(self, home):
        self.STORE = Store(home / "sn.db")
        self.STORE.initialize()
        self.ENGINE_DIR = home
        self.BASE_DIR = home
        self.DATA_DIR = home
        self.CONFIG = {}
        self.WORKSTATION = "TEST-OFFLINE"
        self.jobs = {}
        self.lookup_count = 0

    @staticmethod
    def utc_now():
        return "2026-11-10T08:00:00Z"

    @staticmethod
    def mes_call(collector):
        return collector

    def run_individual_lookup(self, engine, sn, *, include_3022, line_callback):
        self.lookup_count += 1
        line_callback("2114", 55, "Consultar falhas")
        return {
            "sn": sn,
            "detected_type": "PCBA",
            "trace_2114": {"status": "complete", "previous_failures": []},
            "trace_3022": {"status": "complete", "process_passages": [{"pcba_sn": sn}]},
            "trace_3074": {
                "status": "complete", "related_pcbas": ["PCB-OLD"],
                "reused_components": [{"item_sn": "MAT-1", "previous_pcba_evidence": [
                    {"pcba_sn": "PCB-OLD", "relation": "HISTORICO"},
                ]}],
            },
            "summary": {"3022_events": 1},
        }

    def _job_update(self, job_id, **change):
        return {**self.jobs.get(job_id, {"id": job_id}), **change}

    def _persist_job(self, data):
        self.jobs[data["id"]] = data

    def _launch_mes_job(self, kind, cfg, worker):
        assert kind == "sn_lookup"
        self.jobs["TEST-JOB"] = {"id": "TEST-JOB", "kind": kind, "config": cfg}
        worker("TEST-JOB", cfg)
        return self.jobs["TEST-JOB"]


class Saved3012FallbackTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.home = Path(self.temp.name)
        self.agent = FakeAgent(self.home)
        self.handler = agent_3012_patch.install(self.agent, object, None)
        self.rows = [
            {"row_key": "LOCAL-OLD", "pcba_sn": "PCB-OLD", "defect_code": "F1",
             "defect_time": "2026-09-12 10:00:00", "repair_time": "2026-09-12 12:00:00",
             "repair_user": "AT-1", "repair_comment": "Reparo antigo comprovado no posto"},
            {"row_key": "LOCAL-CURRENT", "pcba_sn": "PCB-CURRENT", "defect_code": "F2",
             "defect_time": "2026-09-13 10:00:00", "repair_comment": "Comentário da própria placa"},
            {"row_key": "UNRELATED", "pcba_sn": "PCB-UNRELATED", "defect_code": "F3",
             "defect_time": "2026-09-14 10:00:00", "repair_comment": "Não deve aparecer"},
        ]

    def tearDown(self):
        self.temp.cleanup()

    def seed(self):
        repair_3012.ingest(self.agent.STORE, {"source": "LEGACY_PRE_20261105", "rows": self.rows})

    def run_lookup(self, *, include_3012=None, response=None):
        fake = (lambda **kwargs: response) if response is not None else (
            lambda **kwargs: (_ for _ in ()).throw(RuntimeError("3012_QUERY_PERIOD_MISMATCH"))
        )
        with patch.object(ames_3012_strategy, "collect_exact_sn_cached", side_effect=fake), \
                patch.object(production_shift, "enrich_sn", return_value=None), \
                patch.object(production_shift, "correlate_sn", return_value=None):
            return self.agent._launch_mes_job(
                "sn_lookup", {"sn": "PCB-CURRENT", **({} if include_3012 is None else {"include_3012": include_3012})},
                self.run_worker,
            )

    def run_worker(self, job_id, cfg):
        # Exercise the installed HTTP route so its default include_3012=True
        # is tested, without opening a browser or contacting factory MES.
        handler = object.__new__(self.handler)
        handler.path = "/api/v1/sn-lookup"
        handler._body = lambda: cfg
        handler._send = lambda *args: None
        handler.do_POST()

    def test_live_failure_restores_saved_3012_rows_only_for_related_boards(self):
        self.seed()
        launched = []

        def capture(kind, cfg, worker):
            launched.append(cfg)
            self.agent.jobs["TEST-JOB"] = {"id": "TEST-JOB", "kind": kind}
            worker("TEST-JOB", cfg)
            return {"id": "TEST-JOB"}

        self.agent._launch_mes_job = capture
        job = self.run_lookup()
        self.assertEqual(launched[-1]["include_3012"], True)
        self.assertEqual(job["id"], "TEST-JOB")
        result = self.agent.jobs["TEST-JOB"]["result"]
        trace = result["trace_3012"]
        self.assertEqual(self.agent.jobs["TEST-JOB"]["status"], "done")
        self.assertIn("Consulta parcial", self.agent.jobs["TEST-JOB"]["message"])
        self.assertEqual(trace["status"], "partial")
        self.assertEqual(trace["error"], "3012_LIVE_QUERY_UNVERIFIED")
        self.assertEqual(trace["source"], "LOCAL_SQLITE_3012_UNVERIFIED")
        self.assertEqual({r["row_key"] for r in trace["rows"]}, {"LOCAL-CURRENT", "LOCAL-OLD"})
        self.assertNotIn("3012_cache_covered", result["summary"])
        self.assertIn("3012 ainda não", " ".join(result["warnings"]))
        self.assertTrue(any("NÃO está comprovada" in w for w in result["warnings"]))
        self.assertEqual(result["summary"]["3022_events"], 1)
        self.assertEqual(result["trace_2114"]["status"], "complete")
        evidence = result["trace_3074"]["reused_components"][0]["previous_pcba_evidence"][0]
        self.assertEqual(len(evidence["repair_evidence_3012"]), 1)
        self.assertEqual(evidence["repair_evidence_3012"][0]["association"], "same_pcba_candidate")
        self.assertEqual(len(repair_3012.history(self.agent.STORE, sn="PCB-UNRELATED")), 1)

    def test_failed_live_query_without_saved_rows_is_error_not_zero(self):
        self.agent._launch_mes_job = self._capture_real
        self.run_lookup()
        result = self.agent.jobs["TEST-JOB"]["result"]
        self.assertEqual(result["trace_3012"]["status"], "error")
        self.assertIsNone(result["trace_3012"]["records_count"])
        self.assertEqual(result["trace_3012"]["rows"], [])
        self.assertIn("Consulta parcial", self.agent.jobs["TEST-JOB"]["message"])

    def test_success_keeps_live_path_and_explicit_opt_out_does_not_query_3012(self):
        self.agent._launch_mes_job = self._capture_real
        row = self.rows[0]
        payload = {"source": "AWIP3012_DIRECT_EXTJS+CACHE", "rows": [row], "records_count": 1,
                   "cache": {"covered": 1, "queried": 0}, "ranges": []}
        self.run_lookup(response=payload)
        successful = self.agent.jobs["TEST-JOB"]
        self.assertEqual(successful["message"], "Consulta individual concluída · PCB-CURRENT")
        self.assertEqual(successful["result"]["summary"]["3012_rows"], 1)
        self.assertNotIn("error", successful["result"]["trace_3012"])
        with patch.object(ames_3012_strategy, "collect_exact_sn_cached", side_effect=AssertionError("unexpected MES query")):
            self.run_lookup(include_3012=False)
        self.assertNotIn("trace_3012", self.agent.jobs["TEST-JOB"]["result"])
        self.assertEqual(self.agent.jobs["TEST-JOB"]["result"]["trace_2114"]["status"], "complete")

    def _capture_real(self, kind, cfg, worker):
        self.agent.jobs["TEST-JOB"] = {"id": "TEST-JOB", "kind": kind}
        worker("TEST-JOB", cfg)
        return {"id": "TEST-JOB"}


if __name__ == "__main__":
    unittest.main()
