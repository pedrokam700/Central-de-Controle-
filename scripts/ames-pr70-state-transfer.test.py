"""Offline upgrade fixture: old runtime is never overwritten during staging."""

from contextlib import closing
from pathlib import Path
import hashlib
import json
import sqlite3
import sys
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools/ames-workstation"))
import SAFE_STATE_TRANSFER as transfer


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


class StateTransferTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        self.old, self.new = root / "OLD_AGENT", root / "NEW_CANDIDATE"
        old_agent, new_agent = self.old / "ames-agent", self.new / "ames-agent"
        data = old_agent / "data"
        data.mkdir(parents=True)
        new_agent.mkdir(parents=True)
        (new_agent / "agent_hardened_entry.py").write_text("# synthetic candidate\n")
        (self.new / "CANDIDATE_MANIFEST.json").write_text('{"sha":"test"}')
        (old_agent / "config.json").write_text(json.dumps({
            "configured_lines": ["TAN10102", "TAN10103"],
            "source_id": "fixture-source-preserve"}), encoding="utf-8")
        (data / "local_agent_token").write_text("fixture-token-" + "x" * 48)
        with closing(sqlite3.connect(data / "ames_local.sqlite3")) as db:
            db.execute("PRAGMA journal_mode=WAL")
            db.execute("CREATE TABLE schema_meta(key TEXT PRIMARY KEY, value TEXT)")
            db.execute("INSERT INTO schema_meta VALUES ('ames_source_id','fixture-persistent-source')")
            db.execute("CREATE TABLE jobs(id INTEGER PRIMARY KEY, status TEXT)")
            db.execute("INSERT INTO jobs(status) VALUES ('done')")
            db.commit()
        checkpoint = data / "checkpoints/2114/last.json"
        checkpoint.parent.mkdir(parents=True)
        checkpoint.write_text('{"last_pcba":"synthetic-only"}', encoding="utf-8")
        self.backup = root / "CENTRAL_AMES_BACKUP_PRIVATE_FIXTURE"

    def test_preserves_db_token_config_and_history_with_recovery_backup(self):
        before = {relative: digest(self.old / relative) for relative in (
            "ames-agent/config.json", "ames-agent/data/local_agent_token",
            "ames-agent/data/ames_local.sqlite3", "ames-agent/data/checkpoints/2114/last.json")}
        self.assertTrue(transfer.preflight(str(self.old), str(self.new))["candidate_pristine"])
        receipt = transfer.stage(str(self.old), str(self.new), str(self.backup))
        for item in ("backup_verified", "restore_rehearsed", "source_unchanged", "staged_identity_verified"):
            self.assertTrue(receipt[item], item)
        self.assertEqual(receipt["runtime_files"], 1)
        for relative, expected in before.items():
            self.assertEqual(digest(self.old / relative), expected, "old root modified: " + relative)
            if not relative.endswith("ames_local.sqlite3"):
                # SQLite online backup is page-consistent, not byte-identical
                # to the source file's historical WAL/allocator layout.
                self.assertEqual(digest(self.new / relative), expected, "new root lost: " + relative)
        with closing(sqlite3.connect(self.new / "ames-agent/data/ames_local.sqlite3")) as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM jobs").fetchone()[0], 1)
            self.assertEqual(db.execute("SELECT value FROM schema_meta WHERE key='ames_source_id'").fetchone()[0],
                             "fixture-persistent-source")
        self.assertTrue((self.backup / "runtime-backup-manifest.json").is_file())
        self.assertNotIn("fixture-token-", json.dumps(receipt))
        with self.assertRaisesRegex(ValueError, "candidate_already_has_operational_state"):
            transfer.preflight(str(self.old), str(self.new))

    def test_refuses_existing_backup_without_writing_candidate(self):
        self.backup.mkdir()
        with self.assertRaisesRegex(ValueError, "backup_target_already_exists"):
            transfer.stage(str(self.old), str(self.new), str(self.backup))
        self.assertFalse((self.new / "ames-agent/data").exists())

    def test_rejects_overlapping_installations(self):
        with self.assertRaisesRegex(ValueError, "installation_roots_overlap"):
            transfer.preflight(str(self.old), str(self.old))

    def test_rejects_preinitialized_candidate_without_altering_old_root(self):
        new_config = self.new / "ames-agent/config.json"
        new_config.write_text("do-not-replace")
        with self.assertRaisesRegex(ValueError, "candidate_already_has_operational_state"):
            transfer.preflight(str(self.old), str(self.new))
        self.assertEqual(new_config.read_text(), "do-not-replace")


if __name__ == "__main__":
    unittest.main()
