import importlib.util
from pathlib import Path
import sqlite3
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('preflight', Path(__file__).resolve().parents[1] / 'ames/agent/preflight.py')
preflight = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preflight)

class PreflightTests(unittest.TestCase):
    def test_missing_database_is_not_created_and_session_is_unknown(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'missing.sqlite'
            result = preflight.check(path)
            self.assertFalse(result['sqlite'])
            self.assertFalse(path.exists())
            self.assertIsNone(result['session'])

    def test_existing_database_is_checked_without_changes(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'existing.sqlite'
            with sqlite3.connect(path) as connection:
                connection.execute('CREATE TABLE evidence(value TEXT)')
                connection.execute("INSERT INTO evidence VALUES ('preserved')")
            connection.close()
            before = path.read_bytes()
            self.assertTrue(preflight.check(path)['sqlite'])
            self.assertEqual(path.read_bytes(), before)

if __name__ == '__main__':
    unittest.main()
