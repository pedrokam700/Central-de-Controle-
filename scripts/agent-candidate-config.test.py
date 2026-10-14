from __future__ import annotations

import copy
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AGENT = ROOT / "ames" / "agent"
sys.path.insert(0, str(AGENT))

import candidate_config


class AuditStore:
    def __init__(self):
        self.events = []

    def record_audit(self, name, workstation=None, details=None):
        self.events.append((name, workstation, details or {}))


class FakeAgent:
    def __init__(self, path: Path):
        self.path = path
        self.WORKSTATION = "TEST-STATION"
        self.STORE = AuditStore()
        self.CONFIG = {
            "configured_lines": ["TAN10101"],
            "line_aliases": {"Linha 1": "TAN10101"},
            "day_start": "07:00",
            "production_day_start": "07:00",
            "timezone": "America/Sao_Paulo",
            "work_shifts": {
                "1": {"label": "1º Turno", "start": "07:30", "end": "17:30"},
                "2": {"label": "2º Turno", "start": "17:30", "end": "07:30"},
            },
            "monitor_interval_minutes": 30,
            "performance": "balanced",
            "ames_host": "172.29.185.215",
            "ames_port": 80,
            "ames_start_url": "http://172.29.185.215/asymes",
            "chrome_profile_dir": "",
            "setup_complete": False,
            "backup_retention": 10,
            "auto_backup_on_start": True,
            "allowed_origins": [],
            "ames_start_date": "2026-01-01",
        }
        self.fail_write = False

    def normalize_lines(self, values):
        out = []
        for value in values:
            line = self.normalize_line_id(value)
            if line and line not in out:
                out.append(line)
        return out

    def normalize_line_id(self, value):
        raw = str(value or "").strip().upper()
        if raw in {"TAN10101", "TAN10102", "TAN10103"}:
            return raw
        aliases = {"LINHA 1": "TAN10101", "LINHA 2": "TAN10102", "LINHA 3": "TAN10103"}
        return aliases.get(raw)

    def write_config(self, value):
        if self.fail_write:
            raise RuntimeError("synthetic write failure")
        self.path.write_text(repr(value), encoding="utf-8")


def assert_raises(fragment, fn):
    try:
        fn()
    except ValueError as exc:
        assert fragment.lower() in str(exc).lower(), (fragment, exc)
    else:
        raise AssertionError(f"expected ValueError containing {fragment!r}")


def test_origin_validation_and_normalization():
    assert candidate_config._origin("https://central-cora-v2.vercel.app/") == "https://central-cora-v2.vercel.app"
    assert candidate_config._origin("http://127.0.0.1:8765/") == "http://127.0.0.1:8765"
    assert candidate_config._origins(["https://central-cora-v2.vercel.app/", "https://central-cora-v2.vercel.app"]) == ["https://central-cora-v2.vercel.app"]
    for bad in (
        "http://example.com",
        "https://user:pass@example.com",
        "https://example.com/path",
        "https://example.com/?q=1",
        "javascript:alert(1)",
    ):
        assert_raises("orig", lambda bad=bad: candidate_config._origin(bad))


def test_host_and_start_url_must_match():
    assert candidate_config._host("172.29.185.215") == "172.29.185.215"
    assert candidate_config._start_url("http://172.29.185.215/asymes", "172.29.185.215") == "http://172.29.185.215/asymes"
    assert_raises("mesmo host", lambda: candidate_config._start_url("http://172.29.185.216/asymes", "172.29.185.215"))
    assert_raises("ames_host", lambda: candidate_config._host("http://172.29.185.215"))


def test_atomic_failure_keeps_in_memory_config_unchanged():
    with tempfile.TemporaryDirectory() as temp:
        agent = FakeAgent(Path(temp) / "config.txt")
        before = copy.deepcopy(agent.CONFIG)
        agent.fail_write = True
        try:
            candidate_config.apply(agent, {"performance": "fast", "monitor_interval_minutes": 5})
        except RuntimeError as exc:
            assert "write failure" in str(exc)
        else:
            raise AssertionError("write failure must propagate")
        assert agent.CONFIG == before
        assert agent.STORE.events == []


def test_successful_update_is_normalized_audited_and_reports_ignored_keys():
    with tempfile.TemporaryDirectory() as temp:
        agent = FakeAgent(Path(temp) / "config.txt")
        result = candidate_config.apply(agent, {
            "configured_lines": ["Linha 1", "TAN10102", "TAN10102"],
            "performance": "NORMAL",
            "production_day_start": "07:00",
            "allowed_origins": ["https://central-cora-v2.vercel.app/"],
            "ames_start_date": "2026-01-01",
            "unknown_field": "ignored",
        })
        assert result["ok"] is True
        assert result["config"]["configured_lines"] == ["TAN10101", "TAN10102"]
        assert result["config"]["performance"] == "balanced"
        assert result["config"]["day_start"] == result["config"]["production_day_start"] == "07:00"
        assert result["config"]["allowed_origins"] == ["https://central-cora-v2.vercel.app"]
        assert result["ignored_keys"] == ["unknown_field"]
        assert agent.STORE.events and agent.STORE.events[-1][0] == "CONFIG_UPDATE"
        assert agent.STORE.events[-1][2]["ignored_keys"] == ["unknown_field"]


def test_numeric_and_boolean_ranges_fail_closed():
    with tempfile.TemporaryDirectory() as temp:
        agent = FakeAgent(Path(temp) / "config.txt")
        bad = [
            ({"monitor_interval_minutes": 4}, "monitor_interval_minutes"),
            ({"backup_retention": 0}, "backup_retention"),
            ({"ames_port": 70000}, "ames_port"),
            ({"setup_complete": "yes"}, "setup_complete"),
            ({"auto_backup_on_start": 1}, "auto_backup_on_start"),
            ({"performance": "turbo"}, "performance"),
        ]
        for body, fragment in bad:
            before = copy.deepcopy(agent.CONFIG)
            assert_raises(fragment, lambda body=body: candidate_config.apply(agent, body))
            assert agent.CONFIG == before


if __name__ == "__main__":
    tests = [
        test_origin_validation_and_normalization,
        test_host_and_start_url_must_match,
        test_atomic_failure_keeps_in_memory_config_unchanged,
        test_successful_update_is_normalized_audited_and_reports_ignored_keys,
        test_numeric_and_boolean_ranges_fail_closed,
    ]
    for fn in tests:
        fn()
        print("PASS", fn.__name__)
    print(f"PASS candidate config security ({len(tests)} tests)")
