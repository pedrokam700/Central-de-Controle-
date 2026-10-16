"""Read-only workstation checks. No MES automation, cookies or session capture."""
import importlib.util
from contextlib import closing
import sqlite3
import sys
from pathlib import Path


def check(db_path):
    available = {}
    for name in ('pandas', 'openpyxl', 'playwright', 'pyautogui', 'pyperclip'):
        try:
            available[name] = importlib.util.find_spec(name) is not None
        except (ImportError, ValueError):
            available[name] = False
    database = False
    try:
        # A missing database must never be created by a readiness check.
        with closing(sqlite3.connect(Path(db_path).resolve().as_uri() + '?mode=ro', uri=True, timeout=1)) as conn:
            database = conn.execute('PRAGMA quick_check(1)').fetchone()[0] == 'ok'
    except (sqlite3.Error, OSError):
        pass
    return {'python': sys.prefix != sys.base_prefix,
            'dependencies': all(available.values()), 'playwright': available['playwright'],
            'sqlite': database, 'session': None}
