from __future__ import annotations

import os
from urllib.parse import urlparse


def install():
    """Install fastlane-only runtime hardening without changing validated collectors.

    - /api/v1/ready is intentionally lightweight and is the only endpoint a launcher
      should poll while waiting for the local agent to bind.
    - Client disconnects are normal when a browser/launcher cancels an HTTP request;
      do not turn WinError 10053/10054 or BrokenPipe into a second HTTP 500.
    """
    import agent as a

    if getattr(a.Handler, "_fastlane_runtime_guard_installed", False):
        return

    original_send = a.Handler._send
    original_get = a.Handler.do_GET

    def safe_send(self, obj, status=200):
        try:
            return original_send(self, obj, status)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            return None
        except OSError as exc:
            if getattr(exc, "winerror", None) in {10053, 10054}:
                return None
            raise

    def guarded_get(self):
        if urlparse(self.path).path == "/api/v1/ready":
            return self._send(
                {
                    "ok": True,
                    "ready": True,
                    "agent_build": "CANONICAL-R11-BATCH",
                    "agent_version": a.AGENT_VERSION,
                    "candidate_version": a.CANDIDATE_VERSION,
                    "pid": os.getpid(),
                    "package_root": str(a.BASE_DIR.parent.resolve()),
                }
            )
        return original_get(self)

    a.Handler._send = safe_send
    a.Handler.do_GET = guarded_get
    a.Handler._fastlane_runtime_guard_installed = True
