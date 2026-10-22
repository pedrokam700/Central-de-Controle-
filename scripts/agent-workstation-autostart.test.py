"""Pure and mocked tests: never modify an actual Windows user's Run registry."""
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase, main, mock
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "ames" / "agent"))
import workstation_autostart as auto


class FakeKey:
    def __init__(self, registry):
        self.registry = registry
    def __enter__(self):
        return self
    def __exit__(self, *args):
        return False


class FakeRegistry:
    HKEY_CURRENT_USER = 1
    KEY_READ = 1
    KEY_SET_VALUE = 2
    REG_SZ = 1
    def __init__(self):
        self.value = None
    def OpenKey(self, *_args):
        if self.value is None:
            raise FileNotFoundError()
        return FakeKey(self)
    def CreateKeyEx(self, *_args):
        return FakeKey(self)
    def QueryValueEx(self, _key, _name):
        return self.value, self.REG_SZ
    def SetValueEx(self, _key, _name, _reserved, _type, value):
        self.value = value
    def DeleteValue(self, _key, _name):
        self.value = None


class AutoStartContract(TestCase):
    def test_non_windows_fails_closed(self):
        with mock.patch.object(auto.sys, "platform", "linux"):
            self.assertFalse(auto.status()["supported"])
            with self.assertRaises(OSError):
                auto.configure(True)

    def test_strict_boolean_and_no_registration_hijack(self):
        for value in (None, "true", 1, {}, []):
            with self.assertRaises(ValueError):
                auto.configure(value)
        reg = FakeRegistry()
        reg.value = "foreign-startup-command"
        with mock.patch.object(auto.sys, "platform", "win32"), mock.patch.dict(sys.modules, {"winreg": reg}), mock.patch.object(auto, "_expected", return_value=("safe", [])):
            self.assertTrue(auto.status()["conflict"])
            with self.assertRaises(ValueError):
                auto.configure(True)
            with self.assertRaises(ValueError):
                auto.configure(False)
            self.assertEqual(reg.value, "foreign-startup-command")

    def test_enable_disable_and_idempotency_without_real_registry(self):
        reg = FakeRegistry()
        with TemporaryDirectory() as tmp:
            p = Path(tmp)
            files = [p / x for x in ("watch.ps1", "starter.ps1", "python.exe")]
            for file in files:
                file.write_text("test", encoding="utf-8")
            with mock.patch.object(auto.sys, "platform", "win32"), mock.patch.dict(sys.modules, {"winreg": reg}), mock.patch.object(auto, "_expected", return_value=("verified-local-command", files)):
                self.assertFalse(auto.status()["enabled"])
                self.assertTrue(auto.configure(True)["enabled"])
                self.assertTrue(auto.configure(True)["enabled"])
                self.assertEqual(reg.value, "verified-local-command")
                self.assertFalse(auto.configure(False)["enabled"])
                self.assertIsNone(reg.value)
                self.assertFalse(auto.configure(False)["enabled"])

    def test_guardian_never_automates_mes_or_collects(self):
        content = (Path(__file__).resolve().parents[1] / "tools" / "ames-workstation" / "KEEP_AGENT_RUNNING.ps1").read_text(encoding="utf-8")
        self.assertIn("START_AGENT_CANONICAL.ps1", content)
        self.assertIn("127.0.0.1:8765/api/v1/ready", content)
        self.assertNotIn("172.29.185.215", content)
        for item in ("mes_password", "local_agent_token", "/jobs", "/monitor/start", "Stop-Process -Id"):
            self.assertNotIn(item, content)

    def test_guardian_suppresses_relaunch_during_pending_transaction(self):
        content = (Path(__file__).resolve().parents[1] / "tools" / "ames-workstation" / "KEEP_AGENT_RUNNING.ps1").read_text(encoding="utf-8")
        assert "Local\\CentralAMES.UpdateTransaction" in content
        assert ".ames-update\\transaction.json" in content
        assert "UPDATE_JOURNAL_PRESENT; guardian restart suppressed" in content
        assert "UPDATE_MUTEX_BUSY; guardian restart suppressed" in content
        assert content.index("$transactionMutex.WaitOne(0)") < content.index("$transactionJournal -PathType Leaf")
        assert content.index("$transactionJournal -PathType Leaf") < content.index("& powershell.exe")
        assert "$transactionMutex.ReleaseMutex()" in content
        assert "if(-not $portActive)" in content


if __name__ == "__main__":
    main()
