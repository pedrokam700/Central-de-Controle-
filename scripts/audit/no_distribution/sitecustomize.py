"""Test-only process guard. No ZIP files or distribution builders may run."""
import os
import re
import shutil
import subprocess
import zipfile

_popen = subprocess.Popen


def _guarded_popen(args, *pos, **kw):
    parts = args if isinstance(args, (list, tuple)) else [args]
    if any(re.search(r'(?:^|[\\/\s])(?:build-[\w-]+\.(?:py|mjs)|stage-vercel\.mjs|capture-r12-engine\.py|harden-[\w-]*package\.py)(?:$|\s)', str(p)) for p in parts):
        raise RuntimeError('NO_DISTRIBUTION: builder command refused')
    return _popen(args, *pos, **kw)


subprocess.Popen = _guarded_popen
_zip_init = zipfile.ZipFile.__init__


def _guarded_zip_init(self, file, mode='r', *pos, **kw):
    if mode in ('w', 'a', 'x') and isinstance(file, (str, bytes, os.PathLike)) and os.fsdecode(file).lower().endswith('.zip'):
        raise RuntimeError('NO_DISTRIBUTION: ZIP creation refused')
    return _zip_init(self, file, mode, *pos, **kw)


zipfile.ZipFile.__init__ = _guarded_zip_init
_make_archive = shutil.make_archive


def _guarded_archive(base_name, format, *pos, **kw):
    if format == 'zip':
        raise RuntimeError('NO_DISTRIBUTION: ZIP creation refused')
    return _make_archive(base_name, format, *pos, **kw)


shutil.make_archive = _guarded_archive
