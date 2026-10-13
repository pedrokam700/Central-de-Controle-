from __future__ import annotations


def install(entry_module):
    """Install fastlane-only transport guards on the FINAL hardened handler.

    This function intentionally receives ``agent_entry`` after
    ``agent_hardened_entry`` has finished replacing ``entry.Handler`` with the
    security-aware HardenedHandler. Installing earlier patches the wrong class
    and can leave the final handler unchanged.

    /api/v1/ready itself is owned by HardenedHandler. This guard is only for
    benign client disconnects so a cancelled browser/launcher request does not
    become a second HTTP 500.
    """
    handler = entry_module.Handler

    if getattr(handler, "_fastlane_runtime_guard_installed", False):
        return

    original_send = handler._send

    def safe_send(self, obj, status=200):
        try:
            return original_send(self, obj, status)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            return None
        except OSError as exc:
            if getattr(exc, "winerror", None) in {10053, 10054}:
                return None
            raise

    handler._send = safe_send
    handler._fastlane_runtime_guard_installed = True
