"""Preservation gate for original R4/R5 3022 semantics from the operator handoff.

Run the existing historical fixtures rather than duplicating their test logic:
- A5700 reached vs completed and the genuine packing boundary
- multiple A5162 passes, Phone_Bat_Cover rework, historical defect windows
- camera manual A5162, provisional sensor A5100, functional/unmapped safeguards
No actual A-MES/browser requests are executed.
"""
import sys
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
ENGINE=ROOT/"ames"/"factory-engine"
sys.path.insert(0,str(ENGINE))

if __name__=="__main__":
    loader=unittest.TestLoader()
    suite=unittest.TestSuite()
    for basename in ("test_v017_3022_focus.py","test_v018_3022_origin_rules.py","test_v019_3022_midpoint_reference.py"):
        loaded=loader.discover(start_dir=str(ENGINE/"tests"),pattern=basename)
        if loaded.countTestCases()==0:
            raise AssertionError("Historical 3022 suite missing: "+basename)
        suite.addTests(loaded)
    n=suite.countTestCases()
    outcome=unittest.TextTestRunner(verbosity=1).run(suite)
    if not outcome.wasSuccessful():
        raise SystemExit(1)
    print(f"3022 canonical handoff guard: {n} historical scenarios GREEN")
