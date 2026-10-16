from __future__ import annotations


def install(entry_module):
    """Install fastlane-only transport/read-model guards on the FINAL handler.

    This function intentionally receives ``agent_entry`` after
    ``agent_hardened_entry`` has finished replacing ``entry.Handler`` with the
    security-aware HardenedHandler. Installing earlier patches the wrong class
    and can leave the final handler unchanged.

    /api/v1/ready itself is owned by HardenedHandler. This guard is only for
    benign client disconnects so a cancelled browser/launcher request does not
    become a second HTTP 500. The offline catalog extension installed here is
    read-only and reuses the same canonical SQLite/store.
    """
    handler = entry_module.Handler

    if getattr(handler, "_fastlane_runtime_guard_installed", False):
        return

    # Factory RED 2026-10-16: focused runtime guards only. This deliberately
    # leaves bootstrap/8765 and production 3022 waits/selectors/acceptance alone.
    import factory_redfix
    factory_redfix.install(entry_module)

    # Install only after 3012/process migrations and the final hardened handler
    # exist. This makes optional datasets discoverable without inventing tables.
    import offline_catalog
    offline_catalog.install(entry_module)

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
