"""Issue #57: disposable startup fixtures; never run the factory agent.

Execute exactly the early guard from agent.py in synthetic roots. The fixture
stops before any MES, SQLite, token, browser or scheduler import can happen.
"""
from __future__ import annotations

import ast
import os
from pathlib import Path
import subprocess
import sys
import tempfile


REPO = Path(__file__).resolve().parents[1]
source = (REPO / 'ames/agent/agent.py').read_text(encoding='utf-8')
cut = '\nfrom mes_scheduler import '
assert source.count(cut) == 1
prelude = source.split(cut, 1)[0]
ast.parse(prelude)
assert prelude.count('\n_issue57_refuse_pending_recovery()') == 1
assert 'UPDATE_PENDING_OR_UNVERIFIED' in prelude

# Every supported canonical entry imports agent.py, so a direct invocation of
# either Python entrypoint shares the same early recovery barrier.
entry = (REPO / 'ames/agent/agent_entry.py').read_text(encoding='utf-8')
hardened = (REPO / 'ames/agent/agent_hardened_entry.py').read_text(encoding='utf-8')
assert 'import agent as a' in entry
assert 'import agent_entry as entry' in hardened


def run_fixture(root: Path, *, expect_blocked: bool):
    agent = root / 'ames-agent'
    agent.mkdir(parents=True, exist_ok=True)
    fixture = agent / 'agent.py'
    fixture.write_text(prelude + '\nprint("FIXTURE_STARTED")\n', encoding='utf-8')
    completed = subprocess.run(
        [sys.executable, str(fixture)],
        cwd=root,
        capture_output=True,
        text=True,
        timeout=15,
        check=False,
    )
    output = completed.stdout + completed.stderr
    assert (completed.returncode != 0) == expect_blocked, (completed.returncode, output)
    assert ('FIXTURE_STARTED' not in output) == expect_blocked, output
    if expect_blocked:
        assert 'UPDATE_PENDING_OR_UNVERIFIED' in output, output
        assert str(root) not in output, 'A recovery failure must not leak a local path'


with tempfile.TemporaryDirectory(prefix='issue57_direct_python_') as temp:
    cases = Path(temp)

    run_fixture(cases / 'absent', expect_blocked=False)

    empty = cases / 'empty'
    (empty / '.ames-update').mkdir(parents=True)
    run_fixture(empty, expect_blocked=False)

    for case, file in [('claim', 'claim.lock'), ('journal', 'transaction.json'),
                       ('unknown', 'orphan.bin')]:
        root = cases / case
        meta = root / '.ames-update'
        meta.mkdir(parents=True)
        (meta / file).write_text('FIXTURE_ONLY', encoding='utf-8')
        run_fixture(root, expect_blocked=True)

    nested = cases / 'nested'
    (nested / '.ames-update' / 'unrecognized').mkdir(parents=True)
    run_fixture(nested, expect_blocked=True)

    not_directory = cases / 'file'
    not_directory.mkdir()
    (not_directory / '.ames-update').write_text('FIXTURE_ONLY', encoding='utf-8')
    run_fixture(not_directory, expect_blocked=True)

    # On Windows, creating symlinks may require Developer Mode. Exercise this
    # condition wherever the CI runner permits it, without using privileges.
    symlink_root = cases / 'symlink'
    symlink_root.mkdir()
    target = cases / 'outside'
    target.mkdir()
    try:
        os.symlink(target, symlink_root / '.ames-update', target_is_directory=True)
    except (OSError, NotImplementedError):
        pass
    else:
        run_fixture(symlink_root, expect_blocked=True)

print('Issue57 direct Python recovery pre-import fixtures: GREEN')
