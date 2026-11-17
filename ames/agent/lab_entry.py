"""Explicit synthetic LAB kernel; never import operational agent/engine.
CPython -I -S -B, explicitly authorized empty AMES-LAB-* root, closed stdio.
Trusted-process policy, NOT an OS sandbox for running hostile Python.
"""
from __future__ import annotations

# Finish stdlib imports before the guard. No site, CWD or PYTHONPATH import.
import errno
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import stat
import sys

SCHEMA = 'central-synthetic-lab-v1'
FILES = frozenset({'lab.json', 'lab.sqlite3', 'session.claim'})
DB_SCHEMA = (
    'CREATE TABLE lab_meta (schema TEXT NOT NULL, lab_id TEXT NOT NULL)',
    'CREATE TABLE lab_evidence (seq INTEGER PRIMARY KEY, source_id TEXT NOT NULL, payload TEXT NOT NULL)',
)
PRODUCTIVE_IMPORTS = frozenset({'agent', 'agent_entry', 'agent_hardened_entry', 'engine_bridge',
                              'store', 'canonical', 'mes_scheduler', 'network_watch', 'local_security'})


class LabRefused(Exception):
    pass


def regular(path):
    info = path.lstat()
    if (not stat.S_ISREG(info.st_mode) or info.st_nlink != 1
            or getattr(info, 'st_file_attributes', 0) & 0x400):
        raise LabRefused('UNVERIFIED_MEMBER')
    return info


def plain_directory_chain(path):
    if not path.is_absolute() or str(path).startswith(('\\\\', '//')):
        raise LabRefused('EXPLICIT_LOCAL_ABSOLUTE_ROOT_REQUIRED')
    if '..' in path.parts or ':' in ''.join(path.parts[1:]):
        raise LabRefused('NON_CANONICAL_PATH')
    for parent in (path, *path.parents):
        info = parent.lstat()
        if not stat.S_ISDIR(info.st_mode) or getattr(info, 'st_file_attributes', 0) & 0x400:
            raise LabRefused('UNVERIFIED_DIRECTORY')
    if os.path.normcase(str(path.resolve())) != os.path.normcase(str(path)):
        raise LabRefused('ALIASED_DIRECTORY')


def refuse_pending_journal(root):
    # Metadata only; never parse/delete/recover journal or acquire updater claim.
    source = Path(__file__).absolute().parent
    candidates = set((root, *root.parents, source, source.parent, source.parent.parent))
    for parent in candidates:
        marker = parent / '.ames-update'
        try:
            info = marker.lstat()
        except FileNotFoundError:
            continue
        if not stat.S_ISDIR(info.st_mode) or getattr(info, 'st_file_attributes', 0) & 0x400:
            raise LabRefused('UPDATE_PENDING_OR_UNVERIFIED')
        with os.scandir(marker) as entries:
            if next(entries, None) is not None:
                raise LabRefused('UPDATE_PENDING_OR_UNVERIFIED')


def pipe_or_terminal(stream):
    try:
        mode = os.fstat(stream.fileno()).st_mode
        return stat.S_ISFIFO(mode) or (stat.S_ISCHR(mode) and stream.isatty())
    except (AttributeError, OSError, ValueError):
        return False


def refusal(code):
    # A caller may have pre-opened stderr outside LAB. Do not write even a
    # refusal there; return code 2 is the only safe signal in that case.
    if pipe_or_terminal(sys.stderr):
        print('LAB_REFUSED: ' + code, file=sys.stderr)
    return 2


def check_environment():
    if not all(pipe_or_terminal(stream) for stream in (sys.stdin, sys.stdout, sys.stderr)):
        raise LabRefused('PIPE_OR_TERMINAL_STDIO_REQUIRED')
    if (sys.implementation.name != 'cpython' or sys.version_info < (3, 11)
            or not sys.flags.isolated or not sys.flags.no_site or not sys.dont_write_bytecode
            or not hasattr(sys, 'addaudithook') or not hasattr(sys, 'audit')):
        raise LabRefused('ISOLATED_CPYTHON_I_S_B_REQUIRED')
    forbidden = ('AMES_', 'MES_', 'CENTRAL_', 'CHROME_', 'FIREBASE_', 'GOOGLE_APPLICATION_CREDENTIALS')
    if any(value and key.upper().startswith(forbidden) for key, value in os.environ.items()):
        raise LabRefused('OPERATIONAL_ENVIRONMENT')
    if PRODUCTIVE_IMPORTS.intersection(sys.modules):
        raise LabRefused('OPERATIONAL_IMPORT')


def install_guard(root):
    """Irremovable local hook for closed operations, no untrusted code/SQL input.

    Native SQLite sidecars do not emit Python open events: validate absence,
    fixed DB only, DELETE journal. External FS ownership/VM remains mandatory
    against hostile concurrent writers. This does not grant an operational lease.
    """
    root = Path(root).absolute()
    paths = {os.path.normcase(str(root / name)) for name in FILES}
    root_key = os.path.normcase(str(root))
    db = root / 'lab.sqlite3'
    db_options = {str(db), db.as_uri() + '?mode=ro&immutable=1'}

    def member(value):
        if not isinstance(value, (str, bytes, os.PathLike)):
            return False
        raw = os.fsdecode(value)
        if not os.path.isabs(raw) or '..' in Path(raw).parts:
            return False
        return os.path.normcase(os.path.abspath(raw)) in paths

    def deny():
        raise PermissionError('LAB_POLICY_DENIED')

    def hook(event, args):
        if (event == 'central.lab.guard.probe' or event.startswith(('socket.', 'subprocess.', 'ctypes.', 'winreg.'))
                or event in {'os.system', 'os.fork', 'os.forkpty', 'os.exec', 'os.posix_spawn',
                             'os.spawn', 'os.startfile', 'os.startfile/2', 'os.kill', 'os.killpg',
                             'os.putenv', 'os.unsetenv', 'os.chdir', 'os.fchdir',
                             'os.link', 'os.symlink', 'os.rename', 'os.rmdir', 'os.mkdir',
                             'os.chmod', 'os.chown', 'os.truncate', 'os.utime',
                             'sqlite3.enable_load_extension', 'sqlite3.load_extension'}):
            deny()
        if event == 'import':
            deny()  # All required code was imported before hook installation.
        if event == 'open' and not member(args[0]):
            deny()
        if event == 'os.remove' and (not member(args[0]) or Path(os.fsdecode(args[0])).name != 'session.claim'):
            deny()
        if event in {'os.scandir', 'os.listdir'}:
            if not args or not isinstance(args[0], (str, bytes, os.PathLike)) or os.path.normcase(os.fsdecode(args[0])) != root_key:
                deny()
        if event == 'sqlite3.connect' and str(args[0]) not in db_options:
            deny()

    sys.addaudithook(hook)
    # Verify dispatch before ANY writes. Synthetic audit events, never OS calls.
    probes = [('central.lab.guard.probe', ()), ('socket.connect', (None, ('denied.invalid', 443))),
              ('subprocess.Popen', ('SYNTHETIC', [], None, None)), ('open', ('LAB_FORBIDDEN', 'w', 0))]
    for event, args in probes:
        try:
            sys.audit(event, *args)
        except PermissionError:
            continue
        raise LabRefused('GUARD_NOT_ACTIVE')


def manifest(lab_id):
    return {'schema': SCHEMA, 'lab_id': lab_id, 'synthetic_only': True,
            'database': 'lab.sqlite3', 'transport': 'stdio', 'network': False,
            'engine': None, 'chrome': None, 'guardian': False, 'recover_jobs': False}


def fixture(seq):
    return json.dumps({'pcba': 'LAB-PCBA-0001', 'line': 'LAB-L1', 'snapshot': 'LAB-SNAPSHOT-1',
                       'revision': seq, 'origin': 'SYNTHETIC_INTERNAL_FIXTURE',
                       'physical_usage': None, 'production_time': None}, sort_keys=True, separators=(',', ':'))


def inventory(root, initialize):
    members = list(root.iterdir())
    if initialize:
        if members:
            raise LabRefused('EMPTY_NEW_LAB_REQUIRED')
        return
    if {p.name for p in members} != {'lab.json', 'lab.sqlite3'}:
        raise LabRefused('UNVERIFIED_INVENTORY_OR_PENDING_SESSION')
    for path in members:
        regular(path)


def read_manifest(root):
    path = root / 'lab.json'
    if regular(path).st_size > 2048:
        raise LabRefused('INVALID_MANIFEST')
    data = json.loads(path.read_text(encoding='utf-8'))
    lab_id = data.get('lab_id') if isinstance(data, dict) else None
    if not isinstance(lab_id, str) or not re.fullmatch(r'LAB-[0-9a-f]{32}', lab_id) or json.dumps(data, sort_keys=True) != json.dumps(manifest(lab_id), sort_keys=True):
        raise LabRefused('NON_SYNTHETIC_OR_EXTERNAL_CONFIG')
    return data


def verify_db(root, data):
    # No RW open or hot-journal recovery of an unverified database.
    db = root / 'lab.sqlite3'
    regular(db)
    with db.open('rb') as stream:
        if stream.read(16) != b'SQLite format 3\x00':
            raise LabRefused('INVALID_DATABASE')
    con = sqlite3.connect(db.as_uri() + '?mode=ro&immutable=1', uri=True, timeout=0)
    try:
        if con.execute('PRAGMA integrity_check').fetchall() != [('ok',)]:
            raise LabRefused('INVALID_DATABASE')
        ddl = con.execute("SELECT sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name").fetchall()
        if ddl != [(DB_SCHEMA[1],), (DB_SCHEMA[0],)]:
            raise LabRefused('NON_SYNTHETIC_SCHEMA')
        if con.execute('SELECT * FROM lab_meta').fetchall() != [(SCHEMA, data['lab_id'])]:
            raise LabRefused('NON_SYNTHETIC_DATABASE')
        for seq, source, payload in con.execute('SELECT seq,source_id,payload FROM lab_evidence ORDER BY seq'):
            if source != data['lab_id'] or seq < 1 or payload != fixture(seq):
                raise LabRefused('NON_SYNTHETIC_EVIDENCE')
    finally:
        con.close()


def connect(root):
    con = sqlite3.connect(str(root / 'lab.sqlite3'), timeout=0)

    def authorizer(action, first, second, database, trigger):
        if action in (sqlite3.SQLITE_ATTACH, sqlite3.SQLITE_DETACH):
            return sqlite3.SQLITE_DENY
        if action == sqlite3.SQLITE_FUNCTION and str(second).lower() in {'load_extension', 'readfile', 'writefile'}:
            return sqlite3.SQLITE_DENY
        if action == sqlite3.SQLITE_PRAGMA and str(first).lower() != 'integrity_check':
            return sqlite3.SQLITE_DENY
        return sqlite3.SQLITE_OK

    con.execute('PRAGMA journal_mode=DELETE')
    con.execute('PRAGMA temp_store=MEMORY')
    con.set_authorizer(authorizer)
    return con


def status(con):
    digest = hashlib.sha256()
    count = 0
    for row in con.execute('SELECT seq,source_id,payload FROM lab_evidence ORDER BY seq'):
        digest.update(json.dumps(row, separators=(',', ':')).encode('utf-8'))
        count += 1
    return {'records': count, 'evidence_sha256': digest.hexdigest(), 'jobs_recovered': 0,
            'services_started': [], 'operational_imports': sorted(PRODUCTIVE_IMPORTS.intersection(sys.modules))}


def emit(value):
    print(json.dumps(value, separators=(',', ':')), flush=True)


def run(root, initialize):
    check_environment()
    plain_directory_chain(root)
    if not re.fullmatch(r'AMES-LAB-[A-Za-z0-9_-]{1,80}', root.name):
        raise LabRefused('EXPLICIT_LAB_ROOT_NAME_REQUIRED')
    refuse_pending_journal(root)
    inventory(root, initialize)
    install_guard(root)
    data = None if initialize else read_manifest(root)
    if data is not None:
        verify_db(root, data)
    # Exclusive create; no automatic cleanup of previous/concurrent claim.
    fd = os.open(root / 'session.claim', os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        payload = json.dumps({'schema': SCHEMA, 'pid': os.getpid(), 'recovery': 'SUPERVISED_ONLY'}).encode('utf-8')
        while payload:
            written = os.write(fd, payload)
            if not written:
                raise LabRefused('CLAIM_WRITE_FAILED')
            payload = payload[written:]
        os.fsync(fd)
    finally:
        os.close(fd)
    con = None
    clean = False
    try:
        if initialize:
            data = manifest('LAB-' + os.urandom(16).hex())
            with (root / 'lab.json').open('x', encoding='utf-8') as stream:
                json.dump(data, stream, sort_keys=True)
                stream.flush()
                os.fsync(stream.fileno())
        con = connect(root)
        if initialize:
            with con:
                for sql in DB_SCHEMA:
                    con.execute(sql)
                con.execute('INSERT INTO lab_meta VALUES (?,?)', (SCHEMA, data['lab_id']))
        emit({'mode': 'SYNTHETIC_LAB_ONLY', 'schema': SCHEMA, 'network': False,
              'operational_agent': False, 'transport': 'stdio', 'physical': 'PENDING'})
        while True:
            line = sys.stdin.readline(4097)
            if not line:
                break
            if len(line) > 4096 or not line.endswith('\n'):
                raise LabRefused('INVALID_COMMAND')
            command = json.loads(line)
            if not isinstance(command, dict) or set(command) != {'command'}:
                raise LabRefused('CLOSED_COMMAND_PROTOCOL')
            name = command['command']
            if name == 'shutdown':
                emit({'shutdown': True})
                break
            if name == 'append_fixture':
                seq = con.execute('SELECT COALESCE(MAX(seq),0)+1 FROM lab_evidence').fetchone()[0]
                with con:
                    con.execute('INSERT INTO lab_evidence VALUES (?,?,?)', (seq, data['lab_id'], fixture(seq)))
            elif name != 'status':
                raise LabRefused('CLOSED_COMMAND_PROTOCOL')
            emit(status(con))
        clean = True
    finally:
        if con is not None:
            con.close()
        if clean:
            (root / 'session.claim').unlink()
        # Incomplete session preserves claim/data. No auto-resume/job recovery.


def main():
    try:
        args = sys.argv[1:]
        if len(args) not in (2, 3) or args[0] != '--lab-root' or (len(args) == 3 and args[2] != '--initialize-synthetic'):
            raise LabRefused('EXPLICIT_LAB_ARGUMENTS_REQUIRED')
        run(Path(args[1]), len(args) == 3)
    except LabRefused as error:
        return refusal(str(error))
    except (OSError, ValueError, TypeError, sqlite3.Error, RuntimeError):
        return refusal('UNVERIFIED_STATE_PRESERVE_FOR_SUPERVISION')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
