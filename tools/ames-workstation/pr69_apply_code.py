"""Exact-identity, code-only hotfix for the fresh PR69 workstation install.

The operator stops the agent and disables autostart first. This deliberately
does not touch SQLite, tokens, configuration, update transactions or the OS
guardian; it is NOT the general Issue57 transactional updater.
"""
from __future__ import annotations

import hashlib
from contextlib import contextmanager
import json
import os
from pathlib import Path, PurePosixPath
import socket
import sys
import tempfile

BASE_SHA = '7834ee65de26127f9b85bb05cca151eb07ba2793'
MANIFEST_NAME = 'PATCH_PR69_MANIFEST.json'
ALLOW_ROOTS = {'frontend', 'ames-agent', 'factory-engine'}
ALLOW_ROOT_FILES = {'CANDIDATE_MANIFEST.json', 'LOCAL_BUNDLE_MANIFEST.json', 'LEIA_PRIMEIRO.txt'}
DENY_PARTS = {'data', 'config.json', '.venv', 'tokens', 'secrets', 'cookies', 'session', '__pycache__'}


class PatchBlocked(RuntimeError):
    pass


@contextmanager
def hold_transaction_gate():
    """Hold the same Global mutex the running Windows guardian checks.

    Disabling HKCU autostart does not terminate an ALREADY running guardian.
    This mutex prevents that process from relaunching the agent mid-copy.
    An unavailable/abandoned mutex is never silently ignored.
    """
    if os.name != 'nt':
        yield
        return
    import ctypes
    from ctypes import wintypes
    kernel=ctypes.WinDLL('kernel32',use_last_error=True)
    create=kernel.CreateMutexW
    create.argtypes=(wintypes.LPVOID,wintypes.BOOL,wintypes.LPCWSTR)
    create.restype=wintypes.HANDLE
    wait=kernel.WaitForSingleObject
    wait.argtypes=(wintypes.HANDLE,wintypes.DWORD)
    wait.restype=wintypes.DWORD
    release=kernel.ReleaseMutex
    release.argtypes=(wintypes.HANDLE,)
    close=kernel.CloseHandle
    close.argtypes=(wintypes.HANDLE,)
    handle=create(None,False,r'Global\CentralAMES.UpdateTransaction.8765')
    if not handle:raise PatchBlocked('UPDATE_MUTEX_UNAVAILABLE')
    acquired=False
    try:
        outcome=wait(handle,0)
        if outcome!=0:raise PatchBlocked('UPDATE_MUTEX_BUSY_OR_ABANDONED')
        acquired=True
        yield
    finally:
        if acquired:release(handle)
        close(handle)


def digest(payload):
    return hashlib.sha256(payload).hexdigest()


def safe_relative(name):
    if not isinstance(name, str) or '\\' in name or name.startswith('/') or ':' in name:
        raise PatchBlocked('unsafe_patch_path')
    parts = PurePosixPath(name).parts
    if not parts or any(part in ('', '.', '..') for part in parts):
        raise PatchBlocked('unsafe_patch_path')
    if parts[0] not in ALLOW_ROOTS and name not in ALLOW_ROOT_FILES:
        raise PatchBlocked('unapproved_patch_target')
    if any(part.lower() in DENY_PARTS for part in parts):
        raise PatchBlocked('private_runtime_target_forbidden')
    return Path(*parts)


def _no_links(root, target):
    if root.is_symlink() or (hasattr(root, 'is_junction') and root.is_junction()):
        raise PatchBlocked('linked_install_root')
    relative=target.relative_to(root)
    cursor=root
    for part in relative.parts:
        cursor=cursor/part
        if cursor.is_symlink() or (hasattr(cursor, 'is_junction') and cursor.is_junction()):
            raise PatchBlocked('linked_patch_path')


def agent_is_listening():
    for host in ('127.0.0.1', '::1'):
        try:
            with socket.create_connection((host, 8765), timeout=.28):
                return True
        except OSError:
            pass
    return False


def guardian_is_enrolled():
    if os.name != 'nt':
        return False
    import winreg
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER,
                            r'Software\Microsoft\Windows\CurrentVersion\Run') as key:
            value, _ = winreg.QueryValueEx(key, 'CentralAMESOperatorAgent')
            return bool(str(value).strip())
    except FileNotFoundError:
        return False


def _atomic_write(target, contents):
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, temp = tempfile.mkstemp(prefix='.pr69-', suffix='.part', dir=target.parent)
    try:
        with os.fdopen(fd, 'wb') as f:
            f.write(contents)
            f.flush()
            os.fsync(f.fileno())
        os.replace(temp, target)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)


def _apply_checked(install_root: Path, patch_dir: Path, *, listener_check,
                   guardian_check):
    root=Path(install_root).resolve(strict=True)
    patch_dir=Path(patch_dir).resolve(strict=True)
    spec=json.loads((patch_dir/MANIFEST_NAME).read_text('utf-8'))
    if spec.get('base_sha')!=BASE_SHA or not isinstance(spec.get('files'), list):
        raise PatchBlocked('wrong_pr69_patch_manifest')
    target_sha=spec.get('target_sha')
    if not isinstance(target_sha,str) or len(target_sha)!=40:
        raise PatchBlocked('invalid_target_sha')
    base_manifest=root/'CANDIDATE_MANIFEST.json'
    if not base_manifest.is_file():
        raise PatchBlocked('not_a_fresh_pr69_install')
    installed=json.loads(base_manifest.read_text('utf-8'))
    if installed.get('sha') not in (BASE_SHA, target_sha):
        raise PatchBlocked('different_version_do_not_patch')
    if listener_check():
        raise PatchBlocked('PORT_8765_ACTIVE_STOP_AGENT_FIRST')
    if guardian_check():
        raise PatchBlocked('GUARDIAN_ENROLLED_DISABLE_AUTOSTART_FIRST')

    changes=[]
    names=set()
    for entry in spec['files']:
        name=entry.get('path');rel=safe_relative(name)
        if name in names:raise PatchBlocked('duplicate_patch_file')
        names.add(name)
        destination=root/rel
        _no_links(root,destination)
        source=patch_dir/'files'/rel
        _no_links(patch_dir,source)
        if not source.is_file():raise PatchBlocked('patch_file_missing:'+name)
        new=source.read_bytes()
        if digest(new)!=entry.get('new_sha256'):
            raise PatchBlocked('patch_file_integrity:'+name)
        existing=destination.read_bytes() if destination.is_file() else None
        current=digest(existing) if existing is not None else None
        if current not in (entry.get('old_sha256'), entry['new_sha256']):
            raise PatchBlocked('modified_install_file:'+name)
        changes.append((name,destination,existing,new))
    if not {'CANDIDATE_MANIFEST.json','LOCAL_BUNDLE_MANIFEST.json'} <= names:
        raise PatchBlocked('required_bundle_manifest_missing')
    # Identity files are published last, so a crashed/interrupted run is
    # resumable from verified OLD/NEW bytes without claiming the new build.
    changes.sort(key=lambda item:(item[0] in ('CANDIDATE_MANIFEST.json',
                                               'LOCAL_BUNDLE_MANIFEST.json'),item[0]))
    original=[]
    try:
        for name,target,old,new in changes:
            if old==new:continue
            if listener_check() or guardian_check():
                raise PatchBlocked('AGENT_OR_GUARDIAN_STARTED_DURING_PATCH')
            original.append((target,old))
            _atomic_write(target,new)
            if digest(target.read_bytes())!=digest(new):
                raise PatchBlocked('post_write_checksum_failed:'+name)
        if json.loads(base_manifest.read_text('utf-8')).get('sha')!=target_sha:
            raise PatchBlocked('final_candidate_identity_mismatch')
    except Exception:
        for target,old in reversed(original):
            if old is None:
                try: target.unlink(missing_ok=True)
                except OSError: pass
            else:
                _atomic_write(target,old)
        raise
    return {'sha':target_sha,'files_checked':len(changes),
            'files_changed':len(original),'sqlite_touched':False}


def apply(install_root: Path, patch_dir: Path, *, listener_check=agent_is_listening,
          guardian_check=guardian_is_enrolled):
    with hold_transaction_gate():
        return _apply_checked(install_root, patch_dir,
                              listener_check=listener_check,guardian_check=guardian_check)


if __name__ == '__main__':
    try:
        folder=Path(__file__).resolve().parent
        result=apply(folder.parent,folder)
        print('PR69 CORRECAO APLICADA:',json.dumps(result,ensure_ascii=False))
        print('Agora execute 00_INICIAR_AQUI.bat. Seus dados locais nao foram alterados.')
    except (PatchBlocked,OSError,ValueError) as error:
        print('BLOQUEADO - nada deve ser forçado:',str(error))
        sys.exit(2)
