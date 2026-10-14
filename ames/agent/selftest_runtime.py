"""Isolated first-use smoke test for the hardened local A-MES agent.

This never contacts factory MES. It starts the exact hardened entrypoint on an
ephemeral loopback port, validates public startup/health contracts and stops it.
"""
from __future__ import annotations

import json
import socket
import subprocess
import sys
import time
from pathlib import Path
from urllib.request import urlopen

BASE_DIR = Path(__file__).resolve().parent
ENTRY = BASE_DIR / "agent_hardened_entry.py"


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def _json(url: str, timeout: float = 3.0) -> dict:
    with urlopen(url, timeout=timeout) as response:
        if int(response.status) != 200:
            raise RuntimeError(f"HTTP {response.status}: {url}")
        value = json.loads(response.read().decode("utf-8"))
    if not isinstance(value, dict):
        raise RuntimeError(f"Resposta JSON inválida: {url}")
    return value


def main() -> int:
    if not ENTRY.is_file():
        raise RuntimeError(f"Entrypoint ausente: {ENTRY}")
    port = _free_port()
    process = subprocess.Popen(
        [sys.executable, str(ENTRY), "--host", "127.0.0.1", "--port", str(port)],
        cwd=str(BASE_DIR),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    base = f"http://127.0.0.1:{port}/api/v1"
    try:
        ready = None
        deadline = time.monotonic() + 20.0
        while time.monotonic() < deadline:
            if process.poll() is not None:
                break
            try:
                candidate = _json(base + "/ready", timeout=1.5)
                if candidate.get("ready") is True:
                    ready = candidate
                    break
            except Exception:
                time.sleep(0.25)
        if ready is None:
            raise RuntimeError("Agente não atingiu /ready em até 20 s")
        if ready.get("agent_build") != "CANONICAL-R11-BATCH":
            raise RuntimeError(f"Build inesperado: {ready.get('agent_build')!r}")

        # /health intentionally runs the heavier local preflight. A brand-new
        # Windows venv can be noticeably slower on the first import than later
        # launches. Keep every assertion, but give the cold preflight the same
        # 20 s budget used by the workstation startup diagnostics.
        try:
            health = _json(base + "/health", timeout=20.0)
        except TimeoutError as exc:
            raise RuntimeError("/health excedeu 20 s no preflight local") from exc
        if health.get("ok") is not True:
            raise RuntimeError("/health não retornou ok=true")
        if health.get("agent_build") != "CANONICAL-R11-BATCH":
            raise RuntimeError("/health não confirmou o build canônico")

        hardening = _json(base + "/hardening/health", timeout=5.0)
        if hardening.get("ok") is not True or hardening.get("hardening") != "H1":
            raise RuntimeError("Hardening H1 não ficou pronto")
        if str(hardening.get("integrity") or "").lower() != "ok":
            raise RuntimeError(f"SQLite quick_check falhou: {hardening.get('integrity')!r}")

        print(
            "[OK] Selftest agente CLEAN: "
            f"build={ready.get('agent_build')} port={port} "
            f"schema={hardening.get('schema_version')} sqlite={hardening.get('integrity')}"
        )
        return 0
    except Exception as exc:
        print(f"[ERRO] Selftest agente CLEAN: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1
    finally:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
        stdout, stderr = process.communicate()
        if process.returncode not in (0, -15, 1):
            if stdout.strip():
                print(stdout.strip(), file=sys.stderr)
            if stderr.strip():
                print(stderr.strip(), file=sys.stderr)


if __name__ == "__main__":
    raise SystemExit(main())
