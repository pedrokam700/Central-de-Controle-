from __future__ import annotations

import json
import sqlite3
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AGENT = ROOT / "ames" / "agent"
sys.path.insert(0, str(AGENT))

from store import Store  # noqa: E402
import hardening  # noqa: E402
import local_security  # noqa: E402


def assert_true(value, message):
    if not value:
        raise AssertionError(message)


def test_snapshot_lifecycle_and_restart_recovery():
    with tempfile.TemporaryDirectory() as td:
        db = Path(td) / "ames.sqlite3"
        store = Store(db)
        store.initialize()

        result = hardening.install_store_guards(store)
        assert_true(result["schema_version"] == 1, "hardening schema v1 esperado")

        sid = store.create_snapshot(window_id=None, source_kind="test", source_name="crash")
        assert_true(store.snapshot_status(sid)["status"] == "collecting", "snapshot novo deve nascer collecting")
        assert_true(store.latest_snapshot_id() is None, "collecting não pode ser latest")

        recovered = hardening.recover_interrupted_snapshots(store)
        assert_true(recovered == 1, "restart deve recuperar exatamente um collecting")
        status = store.snapshot_status(sid)
        assert_true(status["status"] == "error", "snapshot interrompido deve virar error")
        assert_true("restarted" in status["error"].lower(), "motivo de interrupção deve ficar auditável")
        assert_true(store.latest_snapshot_id() is None, "error não pode ser latest")

        try:
            store.finalize_snapshot(sid)
        except RuntimeError:
            pass
        else:
            raise AssertionError("snapshot em error não pode voltar a complete")

        sid2 = store.create_snapshot(window_id=None, source_kind="test", source_name="ok")
        store.save_snapshot_payload(sid2, "test", {"ok": True})
        store.finalize_snapshot(sid2)
        status2 = store.snapshot_status(sid2)
        assert_true(status2["status"] == "complete", "snapshot com evidência deve completar")
        assert_true(status2["completed_at"], "snapshot complete deve registrar completed_at")
        assert_true(store.latest_snapshot_id() == sid2, "somente complete pode ser latest")

        # Idempotência: rodar migrations/recovery novamente não altera o banco.
        again = hardening.apply_migrations(store)
        assert_true(again["applied"] == [], "migration aplicada deve ser idempotente")
        assert_true(hardening.recover_interrupted_snapshots(store) == 0, "não deve inventar recovery")


def test_migration_checksum_fails_closed():
    with tempfile.TemporaryDirectory() as td:
        db = Path(td) / "ames.sqlite3"
        store = Store(db)
        store.initialize()
        hardening.apply_migrations(store)
        with store.connect() as con:
            con.execute(
                "UPDATE schema_migrations SET checksum='tampered' WHERE migration_id=?",
                (hardening.MIGRATION_ID,),
            )
        try:
            hardening.apply_migrations(store)
        except RuntimeError as exc:
            assert_true("checksum" in str(exc).lower(), "falha precisa indicar checksum")
        else:
            raise AssertionError("migration adulterada deve falhar fechado")


def test_atomic_config_refuses_corrupt_previous():
    with tempfile.TemporaryDirectory() as td:
        path = Path(td) / "config.json"
        hardening.atomic_write_json(path, {"configured_lines": ["TAN10101"]})
        assert_true(json.loads(path.read_text(encoding="utf-8"))["configured_lines"] == ["TAN10101"], "config válido deve persistir")
        path.write_text("{broken", encoding="utf-8")
        try:
            hardening.atomic_write_json(path, {"configured_lines": ["TAN10102"]})
        except RuntimeError:
            pass
        else:
            raise AssertionError("config corrompido não pode ser sobrescrito silenciosamente")


def test_local_agent_token_is_stable_and_exact():
    class Headers(dict):
        def get(self, key, default=None):
            return super().get(key, default)

    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        token1, path1 = local_security.ensure_token(root)
        token2, path2 = local_security.ensure_token(root)
        assert_true(token1 == token2, "token do posto deve ser estável entre reinícios")
        assert_true(path1 == path2 and path1.is_file(), "token deve existir apenas localmente")
        assert_true(len(token1) >= 32, "token precisa ter entropia suficiente")
        assert_true(local_security.authorized(Headers({local_security.TOKEN_HEADER: token1}), token1, 8765), "token exato deve autorizar")
        assert_true(not local_security.authorized(Headers({local_security.TOKEN_HEADER: token1 + "x"}), token1, 8765), "token divergente deve falhar")
        assert_true(local_security.authorized(Headers({"Origin": "http://127.0.0.1:8765"}), token1, 8765), "UI local same-origin deve continuar compatível")
        assert_true(not local_security.authorized(Headers({"Origin": "https://example.invalid"}), token1, 8765), "origem hospedada sem token não pode comandar o agente")


if __name__ == "__main__":
    tests = [
        test_snapshot_lifecycle_and_restart_recovery,
        test_migration_checksum_fails_closed,
        test_atomic_config_refuses_corrupt_previous,
        test_local_agent_token_is_stable_and_exact,
    ]
    for test in tests:
        test()
        print("PASS", test.__name__)
    print(f"PASS agent hardening ({len(tests)} tests)")
