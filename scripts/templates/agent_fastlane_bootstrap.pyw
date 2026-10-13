from __future__ import annotations

import os
import runpy
import sys
import traceback
from datetime import datetime
from pathlib import Path

BASE = Path(__file__).resolve().parent
ROOT = BASE.parent
LOGS = ROOT / "logs"
LOGS.mkdir(parents=True, exist_ok=True)

sys.stdout = open(LOGS / "agent_fastlane_stdout.log", "a", encoding="utf-8", buffering=1)
sys.stderr = open(LOGS / "agent_fastlane_stderr.log", "a", encoding="utf-8", buffering=1)
print("\n=== FASTLANE AGENT", datetime.now().isoformat(timespec="seconds"), "===")

os.chdir(BASE)
if str(BASE) not in sys.path:
    sys.path.insert(0, str(BASE))

import fastlane_runtime_guard

fastlane_runtime_guard.install()

try:
    runpy.run_path(str(BASE / "agent_hardened_entry.py"), run_name="__main__")
except BaseException:
    traceback.print_exc()
    raise
