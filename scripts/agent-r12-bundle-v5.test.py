from __future__ import annotations

import ast
import hashlib
import importlib.util
import json
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUILDER_PATH = ROOT / "scripts" / "build-r12-migration-bundle-v5.py"
AGENT = ROOT / "ames" / "agent"

spec = importlib.util.spec_from_file_location("r12_bundle_v5", BUILDER_PATH)
assert spec and spec.loader
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


def check(condition, message):
    if not condition:
        raise AssertionError(message)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def assignment_tuple(path: Path, name: str) -> tuple[str, ...]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == name for t in node.targets):
            value = ast.literal_eval(node.value)
            if isinstance(value, tuple) and all(isinstance(item, str) for item in value):
                return value
    raise AssertionError(f"Could not read {name} from {path}")


def local_imports(path: Path, local_names: set[str]) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    result = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                root = alias.name.split(".", 1)[0]
                if root in local_names:
                    result.add(root)
        elif isinstance(node, ast.ImportFrom) and node.module:
            root = node.module.split(".", 1)[0]
            if root in local_names:
                result.add(root)
    return result


def test_builder_and_updater_runtime_contract_match_exactly():
    updater = assignment_tuple(AGENT / "update_candidate.py", "FILES")
    check(tuple(builder.RUNTIME_FILES) == updater, "builder/updater runtime files diverged")
    check(len(updater) == len(set(updater)), "runtime contract contains duplicate files")


def test_hardened_entrypoint_local_imports_are_closed_inside_bundle_contract():
    local_names = {Path(name).stem for name in builder.RUNTIME_FILES}
    required = local_imports(AGENT / "agent_hardened_entry.py", local_names)
    included = {Path(name).stem for name in builder.RUNTIME_FILES}
    check(not (required - included), f"missing hardened runtime imports: {sorted(required - included)}")
    expected = {
        "agent_entry", "diagnostics", "disaster_recovery", "hardening", "local_security",
        "migrations", "operational_calendar", "retention_policy", "support_diagnostics",
        "workstation_identity",
    }
    check(expected <= required, f"test fixture no longer sees expected hardening imports: {sorted(expected - required)}")


def test_v5_bundle_is_complete_private_data_free_and_deterministic():
    frontend_sha = "7" * 40
    with tempfile.TemporaryDirectory() as td:
        root = Path(td)
        first = root / "first.zip"
        second = root / "second.zip"
        builder.build(first, frontend_sha)
        builder.build(second, frontend_sha)
        check(first.read_bytes() == second.read_bytes(), "bundle must be byte-for-byte deterministic")

        with zipfile.ZipFile(first) as archive:
            names = set(archive.namelist())
            check(archive.testzip() is None, "bundle zip integrity failed")
            for name in builder.RUNTIME_FILES:
                check(f"ames-agent/{name}" in names, f"runtime file missing from bundle: {name}")
            check("ames-agent/update_candidate.py" in names, "updater missing from bundle")
            check("ames-agent/candidate-files.json" in names, "candidate hash manifest missing")
            check("FRONTEND_GATE.json" in names, "frontend gate missing")
            check("MIGRATION_MANIFEST.json" in names, "migration manifest missing")
            check("ATUALIZAR_R12_EXISTENTE.bat" in names, "update helper missing")
            check("ROLLBACK_R12_EXISTENTE.bat" in names, "rollback helper missing")

            forbidden = {
                "ames-agent/config.json",
                "ames-agent/data/ames_local.sqlite3",
                "ames-agent/data/local_agent_token",
                "ames-agent/data/workstation_identity.json",
            }
            check(not (forbidden & names), f"private/runtime files leaked into bundle: {sorted(forbidden & names)}")

            candidate = json.loads(archive.read("ames-agent/candidate-files.json"))
            check(tuple(candidate.keys()) == tuple(sorted(candidate.keys())), "candidate-files.json must be deterministic/sorted")
            check(set(candidate) == set(builder.RUNTIME_FILES), "candidate file hash contract differs from runtime files")
            for name, expected in candidate.items():
                check(sha256(archive.read(f"ames-agent/{name}")) == expected, f"candidate hash mismatch: {name}")

            gate = json.loads(archive.read("FRONTEND_GATE.json"))
            check(gate["schema"] == "central-frontend-gate-v1", "frontend gate schema mismatch")
            check(gate["expected_sha"] == frontend_sha, "frontend gate SHA mismatch")
            check(gate["factory_gate_required"] is True, "physical gate must remain mandatory")
            check(gate["release_build_path"] == "/release-build.json", "release-build path missing")
            check(gate["release_identity_path"] == "/release-identity.json", "release identity path missing")

            manifest = json.loads(archive.read("MIGRATION_MANIFEST.json"))
            check(manifest["schema"] == "central-r12-migration-bundle-v5", "bundle schema mismatch")
            check(manifest["frontend_sha"] == frontend_sha, "bundle manifest SHA mismatch")
            check(manifest["new_pc_supported"] is False, "migration bundle must never become new-PC installer silently")
            check(manifest["factory_gate_required"] is True, "factory physical gate missing")
            check(tuple(manifest["runtime_contract"]) == tuple(builder.RUNTIME_FILES), "manifest runtime contract mismatch")
            check(manifest["hardening"]["retention_mode"] == "observe_only", "retention mode must stay non-destructive")
            for name, expected in manifest["files"].items():
                check(name in names, f"manifest hashes missing archive member: {name}")
                check(sha256(archive.read(name)) == expected, f"manifest hash mismatch: {name}")

            all_text = "\n".join(
                archive.read(name).decode("utf-8", errors="ignore")
                for name in names
                if not name.endswith(".zip")
            ).lower()
            for marker in ("ames password", "mes password", "local_agent_token\":", "workstation_identity.json\":"):
                check(marker not in all_text, f"sensitive runtime material marker found in bundle: {marker}")


def test_bundle_does_not_modify_frozen_3028_hash_contract():
    updater = (AGENT / "update_candidate.py").read_text(encoding="utf-8")
    check("829da91ba7b685f4594bae2aad737f1eea64d7b1eaa8073e8bb263748fbe1ca1" in updater, "ames_3028 frozen hash changed/missing")
    check("b512d42ad39fad326252264ce57f98f3731db5161ab8625cf5b244dffffad0e2" in updater, "ames_3028_live frozen hash changed/missing")


if __name__ == "__main__":
    tests = [
        test_builder_and_updater_runtime_contract_match_exactly,
        test_hardened_entrypoint_local_imports_are_closed_inside_bundle_contract,
        test_v5_bundle_is_complete_private_data_free_and_deterministic,
        test_bundle_does_not_modify_frozen_3028_hash_contract,
    ]
    for test in tests:
        test()
        print("PASS", test.__name__)
    print(f"PASS R12 bundle V5 ({len(tests)} tests)")
