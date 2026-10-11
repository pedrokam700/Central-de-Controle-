from __future__ import annotations

import json
import socket
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
AGENT = ROOT / "ames" / "agent"
sys.path.insert(0, str(AGENT))

from store import Store
import diagnostics
import hardening


def check(condition, message):
    if not condition:
        raise AssertionError(message)


class Scheduler:
    def snapshot(self):
        return {"busy": False, "queued": 0, "policy": "fifo-monitor-skip-v1"}


def probe(host, port, timeout=1.0):
    return False


def run():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        store = Store(root / "data" / "ames_local.sqlite3")
        store.initialize()
        hardening.install_store_guards(store)
        sid = store.create_snapshot(window_id=None, source_kind="test", source_name="fixture")
        with store.connect() as con:
            con.execute(
                "INSERT INTO line_metrics(snapshot_id,line,product_model,quantity,fpy,check_fpy) VALUES(?,?,?,?,?,?)",
                (sid, "TAN10101", "CPH0001", 10, 99.0, 99.5),
            )
        store.finalize_snapshot(sid)

        backup_dir = root / "data" / "backups"
        store.backup(backup_dir, keep=2, reason="test")
        agent = SimpleNamespace(
            DB_PATH=root / "data" / "ames_local.sqlite3",
            STORE=store,
            BACKUP_DIR=backup_dir,
            AGENT_VERSION="0.5.23",
            CANDIDATE_VERSION="0.5.25-rc1",
            WORKSTATION=socket.gethostname(),
            MES=Scheduler(),
            CONFIG={
                "configured_lines": ["TAN10101", "TAN10102", "TAN10103"],
                "performance": "balanced",
                "monitor_interval_minutes": 30,
                "auto_3028": {"ready": True},
                "ames_host": "172.29.185.215",
                "ames_port": 80,
                # These values must never leak merely because they exist in config.
                "password": "DO_NOT_LEAK",
                "cookie": "DO_NOT_LEAK",
                "local_agent_token": "DO_NOT_LEAK",
            },
            _tcp_probe=probe,
        )
        health = hardening.health(store)
        payload = diagnostics.build(agent, hardening_health=health, calendar={"timezone": "America/Sao_Paulo"})
        text = json.dumps(payload, ensure_ascii=False).lower()

        check(payload["schema"] == "central-workstation-diagnostics-v1", "diagnostic schema mismatch")
        check(payload["database"]["latest_complete_by_line"]["TAN10101"] == sid, "latest complete snapshot missing")
        check(payload["database"]["hardening"]["integrity"] == "ok", "SQLite integrity missing")
        check(payload["scheduler"]["policy"] == "fifo-monitor-skip-v1", "scheduler policy missing")
        check(payload["backup"]["bytes"] > 0, "backup metadata missing")
        for forbidden in ("do_not_leak", "password", "cookie", "local_agent_token", "authorization", "wifi"):
            check(forbidden not in text, f"diagnostics leaked forbidden content: {forbidden}")
        compact = diagnostics.public_summary(payload)
        check(compact["candidate_version"] == "0.5.25-rc1", "public summary version mismatch")
        print("agent diagnostics: OK")


if __name__ == "__main__":
    run()
