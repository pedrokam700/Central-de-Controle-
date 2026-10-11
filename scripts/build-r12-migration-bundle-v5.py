from __future__ import annotations

import argparse
import ast
import hashlib
import json
import re
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AGENT = ROOT / "ames" / "agent"
WORKSTATION = ROOT / "tools" / "ames-workstation"

RUNTIME_FILES = (
    "agent.py",
    "agent_entry.py",
    "agent_hardened_entry.py",
    "hardening.py",
    "local_security.py",
    "operational_calendar.py",
    "operational_registry.py",
    "diagnostics.py",
    "migrations.py",
    "disaster_recovery.py",
    "support_diagnostics.py",
    "workstation_identity.py",
    "retention_policy.py",
    "engine_bridge.py",
    "store.py",
    "mes_scheduler.py",
    "canonical.py",
    "process_timeline.py",
    "process_r11.py",
)

# These collectors are deliberately NOT shipped by the migration bundle. They are
# frozen factory-proven files already present in the existing R12 installation;
# update_candidate.py validates their exact SHA-256 before any candidate update.
FROZEN_EXISTING_RUNTIME = (
    "ames_3028.py",
    "ames_3028_live.py",
)

PREVIEW_URLS = (
    "https://central-cora-v2-git-v2-console-parity-r12-pedrokam700-6477.vercel.app",
    "https://deploy-preview-23--productcontrolcenter.netlify.app",
)

ROOT_FILES = {
    "INICIAR_POSTO_CENTRAL_V2.bat": WORKSTATION / "INICIAR_POSTO_CENTRAL_V2.bat",
    "00_INICIAR_AQUI.bat": WORKSTATION / "INICIAR_POSTO_CENTRAL_V2.bat",
    "INICIAR_CENTRAL_AMES.cmd": None,
    "suporte/ames-workstation/ROTA_AMES_APLICAR.bat": WORKSTATION / "ROTA_AMES_APLICAR.bat",
    "suporte/ames-workstation/ROTA_AMES_REMOVER.bat": WORKSTATION / "ROTA_AMES_REMOVER.bat",
    "suporte/ames-workstation/START_AGENT_CANONICAL.ps1": WORKSTATION / "START_AGENT_CANONICAL.ps1",
    "suporte/ames-workstation/DIAGNOSTICO_POSTO.ps1": WORKSTATION / "DIAGNOSTICO_POSTO.ps1",
    "suporte/ames-workstation/CAPTURAR_MOTOR_R12_SEGURO.bat": WORKSTATION / "CAPTURAR_MOTOR_R12_SEGURO.bat",
    "suporte/ames-workstation/capture-r12-engine.py": WORKSTATION / "capture-r12-engine.py",
}

FORBIDDEN_ARCHIVE_MEMBERS = {
    "ames-agent/config.json",
    "ames-agent/data/ames_local.sqlite3",
    "ames-agent/data/local_agent_token",
    "ames-agent/data/workstation_identity.json",
}


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _assignment_tuple(source: str, name: str) -> tuple[str, ...]:
    tree = ast.parse(source)
    for node in tree.body:
        if isinstance(node, ast.Assign):
            if any(isinstance(target, ast.Name) and target.id == name for target in node.targets):
                value = ast.literal_eval(node.value)
                if not isinstance(value, tuple) or not all(isinstance(item, str) for item in value):
                    raise ValueError(f"{name} must be a tuple[str, ...]")
                return value
    raise ValueError(f"Could not read {name} assignment")


def _validate_updater_contract() -> None:
    source = (AGENT / "update_candidate.py").read_text(encoding="utf-8")
    updater_files = _assignment_tuple(source, "FILES")
    if updater_files != RUNTIME_FILES:
        raise ValueError(
            "Bundle/updater FILES mismatch; "
            f"bundle={list(RUNTIME_FILES)}; updater={list(updater_files)}"
        )


def _local_imports(path: Path, local_modules: set[str]) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"))
    imports: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                root = alias.name.split(".", 1)[0]
                if root in local_modules:
                    imports.add(root)
        elif isinstance(node, ast.ImportFrom) and node.module:
            root = node.module.split(".", 1)[0]
            if root in local_modules:
                imports.add(root)
    return imports


def _validate_runtime_closure() -> None:
    included = {Path(name).stem for name in RUNTIME_FILES}
    frozen_existing = {Path(name).stem for name in FROZEN_EXISTING_RUNTIME}
    available = {path.stem for path in AGENT.glob("*.py") if path.is_file()}
    required: set[str] = set()
    pending = ["agent_hardened_entry"]
    while pending:
        module = pending.pop()
        if module in required:
            continue
        required.add(module)
        path = AGENT / f"{module}.py"
        if not path.is_file():
            continue
        for imported in _local_imports(path, available):
            if imported not in required:
                pending.append(imported)
    missing = sorted(required - included - frozen_existing)
    if missing:
        raise ValueError(f"Transitive hardened runtime imports absent from bundle: {missing}")
    if not frozen_existing <= required:
        raise ValueError("Frozen 3028 runtime contract is no longer reachable from hardened agent")


def _update_batch() -> bytes:
    return (
        "@echo off\r\n"
        "setlocal EnableExtensions\r\n"
        "set \"TARGET=%~1\"\r\n"
        "if \"%TARGET%\"==\"\" (\r\n"
        "  echo Informe a pasta raiz da automacao R12 existente.\r\n"
        "  set /p \"TARGET=R12: \"\r\n"
        ")\r\n"
        "if \"%TARGET%\"==\"\" exit /b 2\r\n"
        "for %%I in (\"%TARGET%\") do (set \"TARGET_FULL=%%~fI\"& set \"TARGET_NAME=%%~nxI\")\r\n"
        "set \"CAPTURE_ROOT=%TARGET_FULL%\"\r\n"
        "if /I \"%TARGET_NAME%\"==\"ames-agent\" for %%I in (\"%TARGET_FULL%\\..\") do set \"CAPTURE_ROOT=%%~fI\"\r\n"
        "set \"CAPTURE=%CAPTURE_ROOT%\\R12_ENGINE_CAPTURE_PREMIGRATION.zip\"\r\n"
        "where py >nul 2>nul\r\n"
        "if errorlevel 1 (set \"PYRUN=python\") else (set \"PYRUN=py -3\")\r\n"
        "if not exist \"%CAPTURE%\" (\r\n"
        "  echo [PRE-MIGRACAO] Tentando capturar o motor R12 original sem dados/sessao...\r\n"
        "  %PYRUN% \"%~dp0suporte\\ames-workstation\\capture-r12-engine.py\" \"%CAPTURE_ROOT%\" \"%CAPTURE%\"\r\n"
        "  if errorlevel 1 (\r\n"
        "    echo [AVISO] A captura automatica nao foi criada. A instalacao ainda nao foi alterada.\r\n"
        "  ) else (\r\n"
        "    echo [OK] Captura pre-migracao: %CAPTURE%\r\n"
        "  )\r\n"
        ") else (\r\n"
        "  echo [PRE-MIGRACAO] Captura original ja existe e sera preservada: %CAPTURE%\r\n"
        ")\r\n"
        "%PYRUN% \"%~dp0ames-agent\\update_candidate.py\" update \"%TARGET_FULL%\"\r\n"
        "if errorlevel 1 exit /b %errorlevel%\r\n"
        "echo.\r\n"
        "echo [OK] Migracao aplicada com backup/rollback preservado.\r\n"
        "echo Agora execute 00_INICIAR_AQUI.bat dentro da instalacao atualizada.\r\n"
        "exit /b 0\r\n"
    ).encode("ascii", errors="replace")


def _rollback_batch() -> bytes:
    return (
        "@echo off\r\n"
        "setlocal EnableExtensions\r\n"
        "set \"TARGET=%~1\"\r\n"
        "if \"%TARGET%\"==\"\" (\r\n"
        "  echo Informe a pasta raiz da automacao R12 migrada.\r\n"
        "  set /p \"TARGET=R12: \"\r\n"
        ")\r\n"
        "if \"%TARGET%\"==\"\" exit /b 2\r\n"
        "for %%I in (\"%TARGET%\") do (set \"TARGET_FULL=%%~fI\"& set \"TARGET_NAME=%%~nxI\")\r\n"
        "set \"PACKAGE_ROOT=%TARGET_FULL%\"\r\n"
        "if /I \"%TARGET_NAME%\"==\"ames-agent\" for %%I in (\"%TARGET_FULL%\\..\") do set \"PACKAGE_ROOT=%%~fI\"\r\n"
        "set \"BACKUP=%~2\"\r\n"
        "if \"%BACKUP%\"==\"\" for /f \"usebackq delims=\" %%B in (`powershell -NoProfile -ExecutionPolicy Bypass -Command \"$p=Join-Path $env:PACKAGE_ROOT 'candidate-backups';if(Test-Path $p){$b=Get-ChildItem $p -Directory ^| Where-Object {Test-Path (Join-Path $_.FullName 'backup.json')} ^| Sort-Object LastWriteTime -Descending ^| Select-Object -First 1 -ExpandProperty FullName;if($b){Write-Output $b}}\"`) do set \"BACKUP=%%B\"\r\n"
        "if \"%BACKUP%\"==\"\" (\r\n"
        "  echo [ERRO] Nenhum backup candidato foi encontrado em %PACKAGE_ROOT%\\candidate-backups.\r\n"
        "  exit /b 3\r\n"
        ")\r\n"
        "where py >nul 2>nul\r\n"
        "if errorlevel 1 (set \"PYRUN=python\") else (set \"PYRUN=py -3\")\r\n"
        "echo Restaurando backup: %BACKUP%\r\n"
        "%PYRUN% \"%~dp0ames-agent\\update_candidate.py\" rollback \"%TARGET_FULL%\" --backup \"%BACKUP%\"\r\n"
        "if errorlevel 1 exit /b %errorlevel%\r\n"
        "echo [OK] Rollback concluido. SQLite operacional foi preservado.\r\n"
        "exit /b 0\r\n"
    ).encode("ascii", errors="replace")


def _readme(frontend_sha: str) -> bytes:
    return (
        "CENTRAL V2 + A-MES — MIGRACAO DE R12 EXISTENTE\r\n\r\n"
        "Este bundle NAO e instalador para computador novo.\r\n"
        "Ele atualiza uma instalacao R12 existente depois de validar os coletores 3028.\r\n"
        "O updater cria backup do codigo/configuracao/SQLite antes da troca e nao apaga a base.\r\n"
        "Hardening: migrations ordenadas, snapshot transacional, config atomica, pairing local, calendario operacional, diagnostico sanitizado, verificacao de backup/restore drill, identidade estavel do posto e retencao observe-only.\r\n"
        f"Frontend esperado neste bundle: {frontend_sha}\r\n"
        "O launcher abre somente um preview cujo release-build.json tenha exatamente esse SHA.\r\n"
        "Depois de uma validacao online bem-sucedida, a mesma origem/SHA pode ser reutilizada durante perda de internet para o shell offline.\r\n"
        "O token do agente e a identidade do posto sao gerados somente no computador de destino e NAO vem dentro deste ZIP.\r\n"
        "1. Pare agente/monitor da R12.\r\n"
        "2. Execute ATUALIZAR_R12_EXISTENTE.bat e informe a pasta da instalacao.\r\n"
        "3. O script tenta capturar o motor R12 original antes de alterar a instalacao.\r\n"
        "4. Execute 00_INICIAR_AQUI.bat na instalacao atualizada.\r\n"
        "5. Login A-MES permanece manual.\r\n"
        "6. Rode o gate fisico 9/9 antes de qualquer promocao.\r\n"
        "7. Use ROLLBACK_R12_EXISTENTE.bat se precisar restaurar o backup candidato.\r\n"
    ).encode("utf-8")


def _payload(frontend_sha: str) -> dict[str, bytes]:
    _validate_updater_contract()
    _validate_runtime_closure()
    payload: dict[str, bytes] = {}
    for name in (*RUNTIME_FILES, "update_candidate.py"):
        path = AGENT / name
        if not path.is_file():
            raise ValueError(f"Missing agent file: {name}")
        payload[f"ames-agent/{name}"] = path.read_bytes().replace(b"\r\n", b"\n")

    payload["ames-agent/candidate-files.json"] = (
        json.dumps(
            {name: digest(payload[f"ames-agent/{name}"]) for name in RUNTIME_FILES},
            sort_keys=True,
            indent=2,
        )
        + "\n"
    ).encode("utf-8")

    for rel, path in ROOT_FILES.items():
        if path is None:
            data = b'@echo off\r\ncall "%~dp0INICIAR_POSTO_CENTRAL_V2.bat" %*\r\n'
        else:
            if not path.is_file():
                raise ValueError(f"Missing workstation file: {path}")
            data = path.read_bytes()
        payload[rel] = data

    gate = {
        "schema": "central-frontend-gate-v1",
        "expected_sha": frontend_sha,
        "preview_urls": list(PREVIEW_URLS),
        "release_build_path": "/release-build.json",
        "release_identity_path": "/release-identity.json",
        "central_path": "/Central-de-Controle-/",
        "factory_gate_required": True,
    }
    payload["FRONTEND_GATE.json"] = (json.dumps(gate, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    payload["ATUALIZAR_R12_EXISTENTE.bat"] = _update_batch()
    payload["ROLLBACK_R12_EXISTENTE.bat"] = _rollback_batch()

    manifest = {
        "schema": "central-r12-migration-bundle-v5",
        "purpose": "update-existing-r12-only",
        "frontend_sha": frontend_sha,
        "new_pc_supported": False,
        "factory_gate_required": True,
        "preview_selection": "exact-sha-with-validated-offline-fallback",
        "pre_migration_capture": "best-effort-before-update",
        "rollback": "latest-candidate-backup",
        "runtime_contract": list(RUNTIME_FILES),
        "frozen_existing_runtime": list(FROZEN_EXISTING_RUNTIME),
        "hardening": {
            "snapshot_lifecycle": True,
            "ordered_sqlite_migrations": True,
            "atomic_config": True,
            "workstation_pairing_token": True,
            "operational_calendar": True,
            "sanitized_diagnostics": True,
            "backup_verification": True,
            "non_destructive_restore_drill": True,
            "stable_workstation_identity": True,
            "retention_mode": "observe_only",
        },
        "files": {name: digest(data) for name, data in sorted(payload.items())},
        "notes": [
            "does not contain A-MES credentials/session",
            "does not contain runtime SQLite, workstation token or workstation identity",
            "updater validates frozen 3028 hashes before update",
            "existing installation only; new-PC package remains blocked until factory R12 capture",
            "physical 9/9 remains mandatory before promotion",
        ],
    }
    payload["MIGRATION_MANIFEST.json"] = (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    payload["LEIA_PRIMEIRO_R12.txt"] = _readme(frontend_sha)

    forbidden = sorted(FORBIDDEN_ARCHIVE_MEMBERS.intersection(payload))
    if forbidden:
        raise ValueError(f"Forbidden runtime/private files in bundle: {forbidden}")
    return payload


def build(destination: Path, frontend_sha: str) -> Path:
    destination = destination.resolve()
    frontend_sha = str(frontend_sha).strip().lower()
    if destination.exists():
        raise ValueError(f"Destination exists: {destination}")
    if not re.fullmatch(r"[0-9a-f]{40}", frontend_sha):
        raise ValueError("frontend_sha must be an exact 40-hex commit SHA")

    payload = _payload(frontend_sha)
    destination.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(destination, "x", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, data in sorted(payload.items()):
            info = zipfile.ZipInfo(name, (2026, 10, 11, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, data)
    with zipfile.ZipFile(destination) as archive:
        bad = archive.testzip()
        if bad is not None:
            raise ValueError(f"Corrupt bundle member: {bad}")
    print(destination)
    print("Frontend SHA:", frontend_sha)
    print("SHA-256:", digest(destination.read_bytes()))
    return destination


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("destination", type=Path)
    parser.add_argument("--frontend-sha", required=True)
    args = parser.parse_args()
    build(args.destination, args.frontend_sha)