from __future__ import annotations

import ast
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AGENT = ROOT / "ames" / "agent"

# These two collectors are deliberately inherited byte-for-byte by update/migration
# candidates and are separately pinned by SHA-256 gates.
FROZEN_INHERITED = {"ames_3028", "ames_3028_live"}


def local_imports(module: str) -> set[str]:
    path = AGENT / f"{module}.py"
    if not path.is_file():
        return set()
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    out: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for item in node.names:
                name = item.name.split(".", 1)[0]
                if (AGENT / f"{name}.py").is_file():
                    out.add(name)
        elif isinstance(node, ast.ImportFrom) and node.module:
            name = node.module.split(".", 1)[0]
            if (AGENT / f"{name}.py").is_file():
                out.add(name)
    return out


def dependency_closure(entry: str) -> set[str]:
    seen: set[str] = set()
    pending = [entry]
    while pending:
        name = pending.pop()
        if name in seen:
            continue
        seen.add(name)
        pending.extend(sorted(local_imports(name) - seen))
    return seen


def quoted_python_names(source: str, assignment: str) -> set[str]:
    match = re.search(rf"{assignment}\s*=\s*[\[(](.*?)[\])]\s*\n", source, re.S)
    if not match:
        raise AssertionError(f"Could not parse {assignment}")
    return set(re.findall(r"['\"]([^'\"]+\.py)['\"]", match.group(1)))


def test_updater_covers_active_hardened_agent_dependency_closure():
    required_modules = dependency_closure("agent_hardened_entry") - FROZEN_INHERITED
    required_files = {f"{name}.py" for name in required_modules}
    updater = (AGENT / "update_candidate.py").read_text(encoding="utf-8")
    updater_files = quoted_python_names(updater, "FILES")
    missing = sorted(required_files - updater_files)
    assert not missing, f"update_candidate FILES missing active imports: {missing}"
    assert "ames_3028.py" not in updater_files
    assert "ames_3028_live.py" not in updater_files


def test_active_package_builders_derive_from_single_updater_contract():
    for relative in (
        "scripts/build-r12-migration-bundle.py",
        "scripts/build-agent-candidate.py",
    ):
        source = (ROOT / relative).read_text(encoding="utf-8")
        assert "update_candidate.py" in source, f"{relative} no longer reads updater contract"
        assert "_updater_files" in source, f"{relative} no longer derives payload from updater contract"
    migration = (ROOT / "scripts" / "build-r12-migration-bundle.py").read_text(encoding="utf-8")
    assert "FILES=_updater_files()" in migration
    candidate = (ROOT / "scripts" / "build-agent-candidate.py").read_text(encoding="utf-8")
    assert "candidate_files=_updater_files(root)" in candidate


def test_integrated_clean_builder_copies_all_agent_python_modules():
    source = (ROOT / "scripts" / "build-integrated-candidate.py").read_text(encoding="utf-8")
    assert "for p in (ROOT/'ames/agent').glob('*')" in source
    assert "p.suffix=='.py'" in source


def test_legacy_fastlane_is_not_an_active_package_authority():
    source = (ROOT / "scripts" / "build-ames-fastlane-test-overlay.py").read_text(encoding="utf-8")
    # Fastlane is retained only as historical compatibility material. The active
    # CLEAN/update/R12 package contract above is authoritative for factory builds.
    assert "FASTLANE" in source
    assert "CLEAN V3" in source
    assert "build-agent-candidate.py" not in source


if __name__ == "__main__":
    tests = [
        test_updater_covers_active_hardened_agent_dependency_closure,
        test_active_package_builders_derive_from_single_updater_contract,
        test_integrated_clean_builder_copies_all_agent_python_modules,
        test_legacy_fastlane_is_not_an_active_package_authority,
    ]
    for fn in tests:
        fn()
        print("PASS", fn.__name__)
    print(f"PASS agent package contract ({len(tests)} tests)")
