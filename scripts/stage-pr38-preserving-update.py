"""Stage a PR38 identity-preserving update in a temporary folder; NEVER install or zip.

A stage is intentionally NOT a factory distributable and does not change a
workstation. It is a source for the existing explicit update/rollback contract.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AGENT = ROOT / "ames" / "agent"
sys.path.insert(0, str(AGENT))
import update_candidate as updater

WORKSTATION = ROOT / "tools" / "ames-workstation"

def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def current_sha() -> str:
    sha = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    if subprocess.check_output(
        ["git", "status", "--porcelain", "--untracked-files=all"], cwd=ROOT, text=True
    ).strip():
        raise ValueError("Staging requires a committed, clean HEAD")
    return sha

def stage(destination: Path, *, expected_sha: str | None = None) -> dict:
    destination = Path(destination).resolve()
    if destination.exists():
        raise ValueError("Refusing to overwrite an existing stage")
    sha = current_sha()
    if expected_sha and sha != expected_sha:
        raise ValueError("Requested SHA does not match current HEAD")
    payload: dict[str, bytes] = {}

    # Only the updater's active Python contract, never operational data.
    for name in (*updater.FILES, "update_candidate.py"):
        p = AGENT / name
        if not p.is_file():
            raise ValueError("Missing updater module: " + name)
        payload["ames-agent/" + name] = p.read_bytes()
    for name, want in updater.HASHES.items():
        if digest((AGENT / name).read_bytes()) != want:
            raise ValueError("Frozen 3028 collector changed: " + name)
        if "ames-agent/" + name in payload:
            raise ValueError("Frozen collectors must not be replaced")

    payload["ames-agent/candidate-files.json"] = json.dumps(
        {name: digest(payload["ames-agent/" + name]) for name in updater.FILES},
        sort_keys=True, indent=2
    ).encode()

    mapping = {
        "INICIAR_POSTO_CENTRAL_V2.bat": "INICIAR_POSTO_CENTRAL_V2.bat",
        "00_INICIAR_AQUI.bat": "INICIAR_POSTO_CENTRAL_V2.bat",
        "suporte/ames-workstation/ROTA_AMES_APLICAR.bat": "ROTA_AMES_APLICAR.bat",
        "suporte/ames-workstation/ROTA_AMES_REMOVER.bat": "ROTA_AMES_REMOVER.bat",
        "suporte/ames-workstation/START_AGENT_CANONICAL.ps1": "START_AGENT_CANONICAL.ps1",
        "suporte/ames-workstation/DIAGNOSTICO_POSTO.ps1": "DIAGNOSTICO_POSTO.ps1",
        "suporte/ames-workstation/CAPTURAR_MOTOR_R12_SEGURO.bat": "CAPTURAR_MOTOR_R12_SEGURO.bat",
        "suporte/ames-workstation/capture-r12-engine.py": "capture-r12-engine.py",
    }
    payload["INICIAR_CENTRAL_AMES.cmd"] = (
        b'@echo off\r\ncall "%~dp0INICIAR_POSTO_CENTRAL_V2.bat" %*\r\nexit /b %errorlevel%\r\n'
    )
    if set(mapping) | {"INICIAR_CENTRAL_AMES.cmd"} != set(updater.ROOT_FILES):
        raise ValueError("Workstation ROOT_FILES changed; reconcile explicitly")
    for rel, name in mapping.items():
        p = WORKSTATION / name
        if not p.is_file():
            raise ValueError("Missing workstation support: " + rel)
        payload[rel] = p.read_bytes()

    # Inherit integrated front-end build, never a second Console/login.
    with tempfile.TemporaryDirectory() as builddir:
        subprocess.run(["node", "scripts/build-static.mjs"], cwd=ROOT, check=True,
                       env={**os.environ, "CENTRAL_STATIC_OUT":builddir, "COMMIT":sha})
        for p in Path(builddir).rglob("*"):
            if p.is_file():
                payload["frontend/" + p.relative_to(builddir).as_posix()] = p.read_bytes()

    index = payload["frontend/Central-de-Controle-/index.html"].decode("utf-8")
    if "offline-bootstrap.mjs?v=15.1.13.49" not in index or "local-entry.mjs" in index:
        raise ValueError("Integrated central frontend identity was lost")
    release = json.loads(payload["frontend/release-build.json"])
    if release.get("sha") != sha:
        raise ValueError("Frontend release SHA mismatch")

    # update_candidate requires the matching local engine; extras trigger
    # cfg.engine_dir update, so omitting factory-engine would break the post.
    for p in (ROOT / "ames/factory-engine").rglob("*"):
        if p.is_file() and "__pycache__" not in p.parts and (
            p.suffix == ".py" or p.name == "requirements.txt"
            or (p.parent.name == "config" and p.suffix == ".json")
        ):
            payload["factory-engine/" + p.relative_to(ROOT / "ames/factory-engine").as_posix()] = p.read_bytes()
    if not any(p.startswith("factory-engine/") for p in payload):
        raise ValueError("Factory engine must be included with frontend extras")
    route = WORKSTATION / "ensure_ames_route.ps1"
    payload["network/ensure_ames_route.ps1"] = route.read_bytes()

    # The local manifest is consumed by the existing atomic backup/rollback
    # flow. No SQLite, source ID, operator config or agent token is included.
    extra = {name: digest(data) for name, data in payload.items()
             if name.startswith(("frontend/", "factory-engine/", "network/"))}
    payload["LOCAL_BUNDLE_MANIFEST.json"] = json.dumps(
        {"sha": sha, "standalone_clean": False, "preserve_existing_installation": True,
         "files": extra, "physical_gate": "PENDING"}, sort_keys=True, indent=2
    ).encode()
    payload["FRONTEND_GATE.json"] = json.dumps(
        {"expected_sha": sha, "preview_urls": [], "allow_local_fallback": True,
         "factory_gate_required": True},
        sort_keys=True, indent=2
    ).encode()

    forbidden = ("config.json", "local_agent_token", "ames_local.sqlite3", "cookies.json")
    for rel in payload:
        if rel.endswith(forbidden) or rel.startswith("ames-agent/data/"):
            raise ValueError("Private or runtime data in stage: " + rel)
    destination.mkdir(parents=True, exist_ok=False)
    for rel, data in payload.items():
        path = destination / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    result = {"sha": sha, "stage": str(destination), "files": len(payload),
              "frontend_files": sum(k.startswith("frontend/") for k in payload),
              "factory_engine_files": sum(k.startswith("factory-engine/") for k in payload),
              "physical_gate": "PENDING", "kind": "preserving_stage_not_package"}
    print(json.dumps(result, sort_keys=True))
    return result

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("destination")
    parser.add_argument("--expected-sha")
    arguments = parser.parse_args()
    stage(Path(arguments.destination), expected_sha=arguments.expected_sha)
