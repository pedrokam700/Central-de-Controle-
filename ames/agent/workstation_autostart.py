"""Opt-in, per-user Windows agent startup. No MES login, secrets or privilege escalation."""
from __future__ import annotations
import sys
from pathlib import Path

NAME = "CentralAMESOperatorAgent"
KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"

def _root():
    return Path(__file__).resolve().parent.parent

def _expected():
    root = _root()
    watcher = root / "suporte" / "ames-workstation" / "KEEP_AGENT_RUNNING.ps1"
    starter = root / "suporte" / "ames-workstation" / "START_AGENT_CANONICAL.ps1"
    python = root / ".venv" / "Scripts" / "python.exe"
    for item in (root, watcher, starter, python):
        if '"' in str(item) or any(ord(ch) < 32 for ch in str(item)):
            raise ValueError("Invalid workstation path")
    return ('powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass '
            f'-WindowStyle Hidden -File "{watcher}" -Root "{root}"'), (watcher, starter, python)

def _stored():
    import winreg
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, KEY, 0, winreg.KEY_READ) as key:
            return winreg.QueryValueEx(key, NAME)[0]
    except FileNotFoundError:
        return None

def status():
    if sys.platform != "win32":
        return {"ok": True, "supported": False, "enabled": False, "conflict": False}
    expected, dependencies = _expected()
    existing = _stored()
    return {"ok": True, "supported": True, "enabled": existing == expected,
            "conflict": existing is not None and existing != expected,
            "installed": all(p.is_file() for p in dependencies)}

def configure(enabled):
    if type(enabled) is not bool:
        raise ValueError("enabled must be a boolean")
    if sys.platform != "win32":
        raise OSError("Windows only")
    import winreg
    expected, dependencies = _expected()
    existing = _stored()
    if existing is not None and existing != expected:
        raise ValueError("Another Central startup registration exists; resolve manually")
    if enabled:
        if not all(p.is_file() for p in dependencies):
            raise ValueError("Install the current workstation package first")
        with winreg.CreateKeyEx(winreg.HKEY_CURRENT_USER, KEY, 0, winreg.KEY_SET_VALUE) as key:
            winreg.SetValueEx(key, NAME, 0, winreg.REG_SZ, expected)
    elif existing == expected:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, KEY, 0, winreg.KEY_SET_VALUE) as key:
            winreg.DeleteValue(key, NAME)
    return status()
