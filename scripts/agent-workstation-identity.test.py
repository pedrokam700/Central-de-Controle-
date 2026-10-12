from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AGENT = ROOT / "ames" / "agent"
sys.path.insert(0, str(AGENT))

import workstation_identity  # noqa: E402


def check(condition, message):
    if not condition:
        raise AssertionError(message)


def test_identity_is_generated_once_and_stable():
    with tempfile.TemporaryDirectory() as td:
        data = Path(td)
        first = workstation_identity.ensure(data)
        second = workstation_identity.ensure(data)
        check(first["created"] is True, "first identity creation must be explicit")
        check(second["created"] is False, "existing identity must be reused")
        check(first["workstation_id"] == second["workstation_id"], "workstation identity must remain stable")
        check(workstation_identity.ID_RE.fullmatch(first["workstation_id"]) is not None, "workstation id format invalid")
        check((data / "workstation_identity.json").is_file(), "identity file missing")


def test_corrupt_existing_identity_fails_closed_instead_of_regenerating():
    with tempfile.TemporaryDirectory() as td:
        data = Path(td)
        path = data / "workstation_identity.json"
        path.write_text('{"schema":"broken"}', encoding="utf-8")
        try:
            workstation_identity.ensure(data)
        except RuntimeError:
            pass
        else:
            raise AssertionError("corrupt workstation identity must fail closed")
        check(json.loads(path.read_text(encoding="utf-8"))["schema"] == "broken", "corrupt file must not be silently replaced")


def test_public_status_contains_no_file_path_or_credentials():
    with tempfile.TemporaryDirectory() as td:
        identity = workstation_identity.ensure(Path(td))
        public = workstation_identity.public_status(identity)
        check(public["workstation_id"] == identity["workstation_id"], "public local status must expose stable id")
        check(public["stable"] is True, "public status must mark identity stable")
        check("path" not in public, "public identity status must not expose local file path")
        text = json.dumps(public).lower()
        for forbidden in ("password", "cookie", "token", "credential"):
            check(forbidden not in text, f"public workstation identity leaked {forbidden}")


def test_hardened_agent_activates_identity_without_changing_collector_authority():
    source = (AGENT / "agent_hardened_entry.py").read_text(encoding="utf-8")
    check("import workstation_identity" in source, "hardened agent must load workstation identity")
    check("WORKSTATION_IDENTITY = workstation_identity.ensure(entry.a.DATA_DIR)" in source, "stable identity must be created from durable data dir")
    check('entry.a.WORKSTATION_ID = WORKSTATION_IDENTITY["workstation_id"]' in source, "agent must expose stable workstation id")
    check("collector lease" not in source.lower(), "identity groundwork must not silently introduce collector authority")


if __name__ == "__main__":
    tests = [
        test_identity_is_generated_once_and_stable,
        test_corrupt_existing_identity_fails_closed_instead_of_regenerating,
        test_public_status_contains_no_file_path_or_credentials,
        test_hardened_agent_activates_identity_without_changing_collector_authority,
    ]
    for test in tests:
        test()
        print("PASS", test.__name__)
    print(f"PASS workstation identity ({len(tests)} tests)")
