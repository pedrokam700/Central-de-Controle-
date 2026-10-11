"""Production-hardened canonical entrypoint.

Composition layer only: installs production guards, then delegates to the existing
canonical R11/R12-gated entrypoint.  It does not reimplement MES collectors.
"""
from __future__ import annotations

import agent_entry as canonical_entry
import production_hardening


HARDENING_STATE = production_hardening.install(canonical_entry.a)


class Handler(canonical_entry.Handler):
    """Expose hardening health while preserving every existing canonical route."""

    def do_GET(self):
        from urllib.parse import urlparse

        if urlparse(self.path).path == "/api/v1/health/hardening":
            try:
                self._send({
                    "ok": True,
                    "startup": HARDENING_STATE,
                    "current": production_hardening.status(canonical_entry.a.STORE),
                })
            except Exception as exc:
                self._send({"error": type(exc).__name__, "message": str(exc)}, 500)
            return
        return super().do_GET()


def main():
    a = canonical_entry.a
    try:
        a.maybe_backup_on_start()
    except Exception as exc:
        print(f"[BACKUP] aviso: {exc}")
    a.STORE.record_audit(
        "AGENT_START",
        workstation=a.WORKSTATION,
        details={
            "agent_version": a.AGENT_VERSION,
            "entry": "agent_entry_hardened.py",
            "process_contract": "R11_DERIVED_R12_FACTORY_GATE",
            "hardening": HARDENING_STATE,
            "package_root": str(a.BASE_DIR.parent.resolve()),
        },
    )
    import argparse

    ap = argparse.ArgumentParser(description="A-MES Local Agent - Central V2 production hardening")
    ap.add_argument("--host", default=a.CONFIG.get("host", "127.0.0.1"))
    ap.add_argument("--port", type=int, default=int(a.CONFIG.get("port", 8765)))
    args = ap.parse_args()
    server = a.ThreadingHTTPServer((args.host, args.port), Handler)
    a.recover_jobs()
    a.ensure_monitor_thread()
    print(f"A-MES Canonical Agent {a.CANDIDATE_VERSION} · production hardening v{production_hardening.HARDENING_VERSION}")
    print(f"Package root: {a.BASE_DIR.parent.resolve()}")
    print(f"API: http://{args.host}:{args.port}/api/v1/health")
    print(f"Hardening: http://{args.host}:{args.port}/api/v1/health/hardening")
    try:
        server.serve_forever(poll_interval=.4)
    except KeyboardInterrupt:
        pass
    finally:
        a.MONITOR_STOP.set()
        server.server_close()


if __name__ == "__main__":
    main()
