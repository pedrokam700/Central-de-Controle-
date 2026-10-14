from __future__ import annotations

import ast
import re
import sys
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


def test_active_agent_dependencies_are_packaged_everywhere():
    required_modules = dependency_closure("agent_hardened_entry") - FROZEN_INHERITED
    required_files = {f"{name}.py" for name in required_modules}

    updater = (AGENT / "update_candidate.py").read_text(encoding="utf-8")
    updater_files = quoted_python_names(updater, "FILES")
    missing_updater = sorted(required_files - updater_files)
    assert not missing_updater, f"update_candidate FILES missing active imports: {missing_updater}"

    migration = (ROOT / "scripts" / "build-r12-migration-bundle.py").read_text(encoding="utf-8")
    migration_files = quoted_python_names(migration, "FILES")
    assert migration_files == updater_files, (
        "R12 migration and updater contracts diverged: "
        f"missing={sorted(updater_files-migration_files)} extra={sorted(migration_files-updater_files)}"
    )

    candidate = (ROOT / "scripts" / "build-agent-candidate.py").read_text(encoding="utf-8")
    candidate_files = quoted_python_names(candidate, "FILES")
    missing_candidate = sorted(required_files - candidate_files)
    assert not missing_candidate, f"clean candidate FILES missing active imports: {missing_candidate}"

    fastlane = (ROOT / "scripts" / "build-ames-fastlane-test-overlay.py").read_text(encoding="utf-8")
    fastlane_files = quoted_python_names(fastlane, "AGENT_FILES")
    missing_fastlane = sorted((required_files | {f"{name}.py" for name in FROZEN_INHERITED}) - fastlane_files)
    assert not missing_fastlane, f"fastlane payload missing active imports: {missing_fastlane}"


def test_integrated_clean_builder_copies_all_agent_python_modules():
    source = (ROOT / "scripts" / "build-integrated-candidate.py").read_text(encoding="utf-8")
    assert "for p in (ROOT/'ames/agent').glob('*')" in source
    assert "p.suffix=='.py'" in source


if __name__ == "__main__":
    tests = [
        test_active_agent_dependencies_are_packaged_everywhere,
        test_integrated_clean_builder_copies_all_agent_python_modules,
    ]
    for fn in tests:
        fn()
        print("PASS", fn.__name__)
    print(f"PASS agent package contract ({len(tests)} tests)")
