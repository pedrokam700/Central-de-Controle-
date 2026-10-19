"""Build an identity-preserving PR38 factory TEST updater; never execute an update.

This builder runs only on a clean commit after the integrated CI quality gates.
No runtime data, config, SQLite, tokens, cookies, or source identities ship.
"""
from __future__ import annotations
import argparse
import hashlib
import importlib.util
import json
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STAGER = ROOT / "scripts" / "stage-pr38-preserving-update.py"
MAGIC = "central-pr38-preserving-factory-test-v1"


def _digest(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _load_stager():
    spec = importlib.util.spec_from_file_location("ames_pr38_stager", STAGER)
    if not spec or not spec.loader:
        raise RuntimeError("Canonical preserving stage not found")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


APPLY = r"""@echo off
setlocal EnableExtensions
title PR38 TESTE FISICO - Atualizar instalacao EXISTENTE
if "%~1"=="" goto :usage
if not exist "%~1\ames-agent\agent.py" goto :usage
echo.
echo AVISO: Apenas teste de fabrica autorizado. NAO crie outra CLEAN.
echo Este comando modifica os arquivos do agente EXISTENTE, apos backup.
echo Pare o agente antigo e preserve a pasta antiga ANTES de prosseguir.
echo Nunca apague SQLite, config, token, historico ou source_id.
echo.
set "CONFIRM="
set /p "CONFIRM=Digite APLICAR para continuar: "
if /I not "%CONFIRM%"=="APLICAR" exit /b 2
where py >nul 2>nul
if not errorlevel 1 (
  py -3 "%~dp0ames-agent\update_candidate.py" update "%~1"
) else (
  python "%~dp0ames-agent\update_candidate.py" update "%~1"
)
set "RC=%errorlevel%"
if not "%RC%"=="0" echo FALHA: anote o codigo e NAO inicie coleta.
if "%RC%"=="0" echo Concluido. GUARDE o caminho exato do backup impresso acima.
pause
exit /b %RC%
:usage
echo Uso: APLICAR_TESTE_PR38.bat "C:\pasta\instalacao-existente"
echo A pasta deve conter ames-agent\agent.py e o agente deve estar PARADO.
exit /b 2
""".replace("\n", "\r\n").encode("utf-8")

ROLLBACK = r"""@echo off
setlocal EnableExtensions
title PR38 TESTE FISICO - Rollback autorizado
if "%~1"=="" goto :usage
if "%~2"=="" goto :usage
if not exist "%~1\ames-agent\agent.py" goto :usage
if not exist "%~2\backup.json" goto :usage
echo.
echo Rollback de arquivos, sem restaurar/apagar o SQLite atual.
echo Pare o agente e confirme o BACKUP EXATO da atualizacao.
set "CONFIRM="
set /p "CONFIRM=Digite RESTAURAR para continuar: "
if /I not "%CONFIRM%"=="RESTAURAR" exit /b 2
where py >nul 2>nul
if not errorlevel 1 (
  py -3 "%~dp0ames-agent\update_candidate.py" rollback "%~1" --backup "%~2"
) else (
  python "%~dp0ames-agent\update_candidate.py" rollback "%~1" --backup "%~2"
)
set "RC=%errorlevel%"
if not "%RC%"=="0" echo FALHA NO ROLLBACK: nao continue ate investigar.
pause
exit /b %RC%
:usage
echo Uso: RESTAURAR_TESTE_PR38.bat "C:\pasta\instalacao-existente" "C:\pasta\candidate-backups\ID"
echo O backup deve conter backup.json. Nao use um backup de outra instalacao.
exit /b 2
""".replace("\n", "\r\n").encode("utf-8")


def verify(path: Path, expected_sha: str | None = None) -> dict:
    with zipfile.ZipFile(path) as z:
        names = z.namelist()
        if len(names) != len(set(names)) or any(
            item.startswith("/") or "\\" in item or ".." in Path(item).parts
            for item in names
        ):
            raise ValueError("Unsafe or repeated ZIP entry")
        if "CANDIDATE_MANIFEST.json" not in names:
            raise ValueError("Missing signed-by-hash candidate manifest")
        m = json.loads(z.read("CANDIDATE_MANIFEST.json"))
        if m.get("schema") != MAGIC or m.get("physical_gate") != "PENDING" or not m.get("preserve_existing_installation"):
            raise ValueError("Not a preserving TEST candidate")
        if expected_sha and m.get("sha") != expected_sha:
            raise ValueError("Wrong candidate SHA")
        wanted = m.get("files")
        if not isinstance(wanted, dict) or set(names) != set(wanted) | {"CANDIDATE_MANIFEST.json"}:
            raise ValueError("Unexpected or missing ZIP files")
        for item, digest in wanted.items():
            if _digest(z.read(item)) != digest:
                raise ValueError("Corrupt ZIP file: " + item)
            if item.startswith("ames-agent/data/") or item in (
                "ames-agent/config.json", "ames-agent/data/local_agent_token", ".env",
            ) or item.endswith((".sqlite", ".sqlite3", ".db", ".log", ".key", ".pem")):
                raise ValueError("Operational or private data forbidden: " + item)
        if "ames-agent/candidate-files.json" not in wanted or "LOCAL_BUNDLE_MANIFEST.json" not in wanted:
            raise ValueError("Update candidate contract missing")
        if json.loads(z.read("LOCAL_BUNDLE_MANIFEST.json")).get("sha") != m["sha"]:
            raise ValueError("Local bundle mismatch")
        if json.loads(z.read("FRONTEND_GATE.json")).get("expected_sha") != m["sha"]:
            raise ValueError("Frontend gate mismatch")
        return {"sha": m["sha"], "files": len(wanted), "physical_gate": "PENDING", "kind": MAGIC}


def build(out: Path, expected_sha: str | None = None) -> dict:
    out = Path(out).resolve()
    if out.exists():
        raise ValueError("Refuse overwrite of prior update ZIP")
    mod = _load_stager()
    with tempfile.TemporaryDirectory(prefix="pr38-update-build-") as tmp:
        stage_root = Path(tmp) / "stage"
        result = mod.stage(stage_root, expected_sha=expected_sha)
        sha = result["sha"]
        files = {p.relative_to(stage_root).as_posix(): p.read_bytes() for p in stage_root.rglob("*") if p.is_file()}
        files["APLICAR_TESTE_PR38.bat"] = APPLY
        files["RESTAURAR_TESTE_PR38.bat"] = ROLLBACK
        files["LEIA_PRIMEIRO_PR38.txt"] = (
            "PR38 — TESTE FISICO CONTROLADO, NAO PRODUCAO\n"
            f"SHA EXATO: {sha}\n"
            "1. Exija CI Windows + estatico + emulador + navegador GREEN deste SHA.\n"
            "2. Teste acesso ao frontend do MESMO SHA em PC B, antes de tocar em PC A.\n"
            "3. Na empresa, operador autorizado: preserve a pasta e dados originais,\n"
            "   incluindo SQLite, token/config, Firestore remoto, e mantenha rollback.\n"
            "4. Feche o agente ORIGINAL. Nao execute duas copias na porta 8765.\n"
            "5. APLIQUE APENAS em instalacao existente aprovada, jamais em CLEAN nova.\n"
            "6. Execute APLICAR_TESTE_PR38.bat com CAMINHO da pasta existente.\n"
            "7. Capture o caminho da pasta candidate-backups criado pela operacao.\n"
            "8. Teste TAN10103 Hoje A->B, historico 16/10 e TAN10102, sem\n"
            "   mudar source_id, apagar historico ou sobrescrever outra origem.\n"
            "9. Se houver falha: pare o agente e RESTAURAR_TESTE_PR38.bat\n"
            "   com CAMINHO da instalacao e do backup exato impresso.\n"
            "Sem testes fisicos A/B este pacote NAO esta aprovado para producao.\n"
        ).encode("utf-8")
        files["CANDIDATE_MANIFEST.json"] = json.dumps(
            {"schema": MAGIC, "sha": sha, "preserve_existing_installation": True,
             "physical_gate": "PENDING", "files": {n: _digest(data) for n, data in sorted(files.items())}},
            sort_keys=True, indent=2
        ).encode()
        out.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(out, "x", compression=zipfile.ZIP_DEFLATED) as z:
            for name, data in sorted(files.items()):
                info = zipfile.ZipInfo(name, date_time=(2026, 10, 19, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                z.writestr(info, data)
        verified = verify(out, sha)
        result = {**verified, "archive_sha256": _digest(out.read_bytes())}
        print(json.dumps(result, sort_keys=True))
        return result


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("destination")
    ap.add_argument("--expected-sha")
    args = ap.parse_args()
    build(Path(args.destination), args.expected_sha)
