"""CI-only guard compatibility; sentinel proves refusal before any launcher."""
import inspect
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch
import sitecustomize

class GuardCompatibility(unittest.TestCase):
    def test_popen_stays_a_class_for_Windows_asyncio_subclassing(self):
        self.assertTrue(inspect.isclass(subprocess.Popen))
        class AsyncioStylePopen(subprocess.Popen):pass
        self.assertTrue(issubclass(AsyncioStylePopen,sitecustomize._popen))
        import asyncio
        self.assertIsNotNone(asyncio)
    def test_nonexistent_builder_is_refused_before_original_constructor(self):
        fake='scripts/build-PR92-NEVER-EXISTS.py';self.assertFalse(Path(fake).exists())
        with patch.object(sitecustomize._popen,'__init__') as launcher:
            with self.assertRaisesRegex(RuntimeError,'NO_DISTRIBUTION'):
                subprocess.Popen(['python',fake])
            launcher.assert_not_called()

if __name__=='__main__':unittest.main()
