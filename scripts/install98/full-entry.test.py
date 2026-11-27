"""Entry-chain obligations before running the complete disposable installation."""
from pathlib import Path
import unittest
ROOT=Path(__file__).resolve().parents[2]
class Entry(unittest.TestCase):
 def test_both_batch_entries_forward_explicit_lab_scope(self):
  alias=(ROOT/'tools/ames-workstation/01_TROCAR.bat').read_text()
  wrapper=(ROOT/'tools/ames-workstation/01_TROCAR_PARA_PR69_NOVA.bat').read_text()
  self.assertTrue('%*' in alias,'01_TROCAR currently discards explicit local/LAB arguments')
  self.assertTrue('/lab' in wrapper and '-Laboratory -LocalOnly -NoBrowser' in wrapper,'no guarded LAB entry exists')
 def test_lab_authorization_is_distinct_from_operator_confirmation(self):
  source=(ROOT/'tools/ames-workstation/TROCAR_PARA_PR69_NOVA.ps1').read_text()
  for obligation in ('[switch]$Laboratory','Assert-InstallationLaboratory','LAB_AUTHORIZATION=EXPLICIT_SYNTHETIC_CI','LAB_WFP_DENIAL_UNVERIFIED'):
   self.assertTrue(obligation in source,obligation)
 def test_batch_failure_status_survives_display_and_pause(self):
  source=(ROOT/'tools/ames-workstation/01_TROCAR_PARA_PR69_NOVA.bat').read_text()
  self.assertTrue('exit /b %SWITCH_RESULT%' in source,'wrapper must propagate the real transaction result')
if __name__=='__main__':unittest.main()
