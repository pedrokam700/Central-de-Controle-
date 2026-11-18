"""Packaging counterproofs only: never run an agent, launcher or builder."""
from pathlib import Path
import runpy
import unittest

ROOT=Path(__file__).resolve().parents[1]
BUILD=runpy.run_path(str(ROOT/'scripts/build-integrated-candidate.py'))

class Packaging(unittest.TestCase):
    def test_safe_existing_names_remain_allowed(self):
        self.assertTrue(BUILD['assert_clean_payload']({'ames-agent/agent.py':b'x','frontend/Central-de-Controle-/index.html':b'x'}))
    def test_paths_cannot_escape_or_be_windows_aliases(self):
        for name in ('../escape.py','/absolute.py','x\\escape.py','C:/escape.py','x/a.py:stream','x/../a.py','x//a.py','x/CON.txt','x/a.py.','x/a.py '):
            with self.subTest(name=name),self.assertRaises(ValueError):BUILD['assert_clean_payload']({name:b'x'})
    def test_case_aliases_are_duplicates_on_windows(self):
        with self.assertRaises(ValueError):BUILD['assert_clean_payload']({'agent.py':b'a','AGENT.PY':b'b'})
    def test_WAL_SHM_and_case_variants_never_ship(self):
        for name in ('backup/capture-wal','backup/capture-shm','AMES-AGENT/DATA/new.json','x/.env.local'):
            with self.subTest(name=name),self.assertRaises(ValueError):BUILD['assert_clean_payload']({name:b'x'})
    def test_candidate_identity_is_required(self):
        self.assertIn('PACKAGE_IDENTITY.json',BUILD['REQUIRED_FILES'])
    def test_readme_does_not_instruct_automatic_return_to_0539(self):
        source=(ROOT/'scripts/build-integrated-candidate.py').read_text()
        self.assertNotIn('instalacao oficial anterior comprovada (0.5.39 neste baseline)',source)

if __name__=='__main__':unittest.main()
