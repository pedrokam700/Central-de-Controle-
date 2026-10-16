"""Deterministic test barrier before canonical imports; never shipped in CLEAN."""
import os
import sys
import time
from pathlib import Path
root=os.environ.get('AMES_RACE_TEST_ROOT')
barrier=os.environ.get('AMES_RACE_TEST_BARRIER')
if root and barrier and len(sys.argv)>0 and str(Path(sys.argv[0]).resolve()).casefold()==str((Path(root)/'ames-agent'/'agent_hardened_entry.py').resolve()).casefold():
    Path(barrier).write_text(str(os.getpid()),encoding='ascii')
    time.sleep(4)
