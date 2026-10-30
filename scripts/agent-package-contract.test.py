from __future__ import annotations

import ast
import hashlib
import importlib.util
import json
import re
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AGENT = ROOT / "ames" / "agent"

# These two collectors are deliberately inherited byte-for-byte by update/migration
# candidates and are separately pinned by SHA-256 gates.
FROZEN_INHERITED = {"ames_3028", "ames_3028_live"}


def local_imports(module: str) -> set[str]:
    path = AGENT / f"{module}.py"
    if not path.is_file():
        return set()
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    out: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for item in node.names:
                name = item.name.split(".", 1)[0]
                if (AGENT / f"{name}.py").is_file():
                    out.add(name)
        elif isinstance(node, ast.ImportFrom) and node.module:
            name = node.module.split(".", 1)[0]
            if (AGENT / f"{name}.py").is_file():
                out.add(name)
    return out


def dependency_closure(entry: str) -> set[str]:
    seen: set[str] = set()
    pending = [entry]
    while pending:
        name = pending.pop()
        if name in seen:
            continue
        seen.add(name)
        pending.extend(sorted(local_imports(name) - seen))
    return seen


def quoted_python_names(source: str, assignment: str) -> set[str]:
    match = re.search(rf"{assignment}\s*=\s*[\[(](.*?)[\])]\s*\n", source, re.S)
    if not match:
        raise AssertionError(f"Could not parse {assignment}")
    return set(re.findall(r"['\"]([^'\"]+\.py)['\"]", match.group(1)))


def integrated_builder_module():
    path = ROOT / "scripts" / "build-integrated-candidate.py"
    spec = importlib.util.spec_from_file_location("build_integrated_candidate_contract", path)
    if spec is None or spec.loader is None:
        raise AssertionError("Could not load integrated candidate builder")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_updater_covers_active_hardened_agent_dependency_closure():
    required_modules = dependency_closure("agent_hardened_entry") - FROZEN_INHERITED
    required_files = {f"{name}.py" for name in required_modules}
    updater = (AGENT / "update_candidate.py").read_text(encoding="utf-8")
    updater_files = quoted_python_names(updater, "FILES")
    missing = sorted(required_files - updater_files)
    assert not missing, f"update_candidate FILES missing active imports: {missing}"
    assert "ames_3028.py" not in updater_files
    assert "ames_3028_live.py" not in updater_files


def test_active_package_builders_derive_from_single_updater_contract():
    for relative in (
        "scripts/build-r12-migration-bundle.py",
        "scripts/build-agent-candidate.py",
    ):
        source = (ROOT / relative).read_text(encoding="utf-8")
        assert "update_candidate.py" in source, f"{relative} no longer reads updater contract"
        assert "_updater_files" in source, f"{relative} no longer derives payload from updater contract"
    migration = (ROOT / "scripts" / "build-r12-migration-bundle.py").read_text(encoding="utf-8")
    assert "FILES=_updater_files()" in migration
    candidate = (ROOT / "scripts" / "build-agent-candidate.py").read_text(encoding="utf-8")
    assert "candidate_files=_updater_files(root)" in candidate


def test_integrated_clean_builder_copies_all_agent_python_modules():
    source = (ROOT / "scripts" / "build-integrated-candidate.py").read_text(encoding="utf-8")
    assert "for p in (ROOT/'ames/agent').glob('*')" in source
    assert "p.suffix=='.py'" in source


def test_integrated_clean_support_files_are_explicit():
    builder = integrated_builder_module()
    assert tuple(builder.SUPPORT_FILES) == (
        "START_AGENT_CANONICAL.ps1",
        "DIAGNOSTICO_POSTO.ps1",
        "KEEP_AGENT_RUNNING.ps1",
        "ISSUE57_RELAUNCH_ENROLLMENT.ps1",
    )
    source = (ROOT / "scripts" / "build-integrated-candidate.py").read_text(encoding="utf-8")
    assert "for p in ws.iterdir()" not in source
    for legacy in (
        "CAPTURAR_MOTOR_R12_SEGURO.bat",
        "ROTA_AMES_APLICAR.bat",
        "ROTA_AMES_REMOVER.bat",
    ):
        assert legacy not in builder.SUPPORT_FILES


def test_pr69_clean_retains_supervised_switch_and_first_run_network():
    builder = integrated_builder_module()
    assert set(builder.FIRST_RUN_FILES) == {
        "01_TROCAR_PARA_PR69_NOVA.bat",
        "TROCAR_PARA_PR69_NOVA.ps1",
        "08_PREPARAR_REDE_AMES.bat",
    }
    assert set(builder.PACKAGE_DOCS) == {
        "INSTRUCOES_INSTALACAO_LIMPA.txt",
        "MANUAL_LOGICA_CAPTURA_E_CRUZAMENTO.md",
        "NOTAS_ALERTAS_SN_PR69.md",
        "NOTAS_CORRECOES_28OUT_RESTAURACAO.md",
        "NOTAS_VALIDACAO_FPY_TOP3_RASTREABILIDADE.md",
    }
    startup = (ROOT / "tools/ames-workstation/START_LOCAL_CANDIDATE.ps1").read_text(encoding="utf-8")
    route = (ROOT / "tools/ames-workstation/ensure_ames_route.ps1").read_text(encoding="utf-8")
    switch = (ROOT / "tools/ames-workstation/TROCAR_PARA_PR69_NOVA.ps1").read_text(encoding="utf-8")
    assert startup.index("Get-NetTCPConnection -LocalPort 8765") < startup.index("08_PREPARAR_REDE_AMES.bat") < startup.index("01_INSTALAR_UMA_VEZ.bat")
    assert "if($LASTEXITCODE -ne 0){throw 'Rede A-MES nao validada" in startup
    assert "netsh wlan connect name=$Profile" in route
    assert "TAXXX_5G nao conectado" in route
    assert "-Verb RunAs -Wait -PassThru" in route
    assert "172.29.185.215" in route
    assert "255.255.255.255" in route
    assert "Confirm-Route $index $gateway" in route
    assert "__BUNDLE_SHA__" in switch
    assert "Read-Host 'Para continuar, digite TROCAR'" not in switch
    assert "New-Object -ComObject WScript.Shell" in switch
    assert switch.index("if($answer -ne 6)") > switch.index("Nenhum agente/guardian antigo identificado")
    assert switch.index("if($answer -ne 6)") < switch.index("if($oldRun){WriteRun $null}")
    assert "Get-NetTCPConnection -LocalPort 8765" in switch
    assert "StopKnown" in switch
    assert "START_LOCAL_CANDIDATE.ps1" in switch
    assert "WriteRun $oldRun" in switch
    assert "ames-agent\\data\\local_agent_token" in switch


def test_integrated_clean_builder_rejects_runtime_private_files():
    builder = integrated_builder_module()
    assert builder.assert_clean_payload({
        "ames-agent/config.example.json": b"{}",
        "frontend/Central-de-Controle-/index.html": b"ok",
        "LEIA_PRIMEIRO.txt": b"ok",
    }) is True
    forbidden = [
        "ames-agent/config.json",
        "ames-agent/data/ames_local.sqlite3",
        "ames-agent/data/local_agent_token",
        "ames-agent/network_health.jsonl",
        "logs/agent.log",
        "ames-agent/__pycache__/agent.cpython-312.pyc",
        "nested/old-package.zip",
        "private/.env",
        "private/client.pem",
        "private/client.key",
        "private/cookies.json",
        "private/session.json",
    ]
    for name in forbidden:
        try:
            builder.assert_clean_payload({"safe.txt": b"ok", name: b"private"})
        except ValueError as exc:
            assert name in str(exc), (name, exc)
        else:
            raise AssertionError(f"forbidden CLEAN payload file accepted: {name}")


def _write_synthetic_candidate(path: Path, *, content: bytes = b"safe", manifest_hash: str | None = None, extra: bool = False, wrong_sha=False):
    wanted = manifest_hash or hashlib.sha256(content).hexdigest()
    sha='a'*40
    payload={name:b'synthetic' for name in integrated_builder_module().REQUIRED_FILES}
    payload['safe.txt']=content
    payload['LOCAL_BUNDLE_MANIFEST.json']=json.dumps({'sha':sha,'files':{}}).encode()
    payload['frontend/release-build.json']=json.dumps({'sha':sha}).encode()
    payload['frontend/Central-de-Controle-/sw.js']=('const CACHE_REVISION="'+sha+'";').encode()
    payload['TROCAR_PARA_PR69_NOVA.ps1']=("$ExpectedSha='"+('b'*40 if wrong_sha else sha)+"'").encode()
    manifest = {
        "sha": "a" * 40,
        "standalone_clean": True,
        "physical_gate": "PENDING",
        "files": {**{name:hashlib.sha256(data).hexdigest() for name,data in payload.items()},"safe.txt": wanted},
    }
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        for name,data in payload.items():z.writestr(name,data)
        if extra:
            z.writestr("unmanifested.txt", b"extra")
        z.writestr("CANDIDATE_MANIFEST.json", json.dumps(manifest).encode("utf-8"))


def test_integrated_clean_final_zip_verification_fails_closed():
    builder = integrated_builder_module()
    with tempfile.TemporaryDirectory() as temp:
        root = Path(temp)
        valid = root / "valid.zip"
        _write_synthetic_candidate(valid)
        state = builder.verify_zip(valid)
        assert state["zip_files"] == len(builder.REQUIRED_FILES)+2
        assert state["manifest_files"] == state["zip_files"]-1
        assert state["sha"] == "a" * 40

        wrong = root / 'wrong-identity.zip'
        _write_synthetic_candidate(wrong,wrong_sha=True)
        try:builder.verify_zip(wrong)
        except ValueError as exc:assert 'identity mismatch' in str(exc)
        else:raise AssertionError('Rehashed manifest hid a stale switcher SHA')

        tampered = root / "tampered.zip"
        _write_synthetic_candidate(tampered, content=b"changed", manifest_hash=hashlib.sha256(b"original").hexdigest())
        try:
            builder.verify_zip(tampered)
        except ValueError as exc:
            assert "hash mismatch" in str(exc).lower()
        else:
            raise AssertionError("tampered ZIP content was accepted")

        extra = root / "extra.zip"
        _write_synthetic_candidate(extra, extra=True)
        try:
            builder.verify_zip(extra)
        except ValueError as exc:
            assert "unmanifested" in str(exc).lower()
        else:
            raise AssertionError("unmanifested ZIP file was accepted")


def test_legacy_fastlane_is_not_an_active_package_authority():
    source = (ROOT / "scripts" / "build-ames-fastlane-test-overlay.py").read_text(encoding="utf-8")
    # Fastlane is retained only as historical compatibility material. The active
    # CLEAN/update/R12 package contract above is authoritative for factory builds.
    assert "FASTLANE" in source
    assert "CLEAN V3" in source
    assert "build-agent-candidate.py" not in source


if __name__ == "__main__":
    tests = [
        test_updater_covers_active_hardened_agent_dependency_closure,
        test_active_package_builders_derive_from_single_updater_contract,
        test_integrated_clean_builder_copies_all_agent_python_modules,
        test_integrated_clean_support_files_are_explicit,
        test_pr69_clean_retains_supervised_switch_and_first_run_network,
        test_integrated_clean_builder_rejects_runtime_private_files,
        test_integrated_clean_final_zip_verification_fails_closed,
        test_legacy_fastlane_is_not_an_active_package_authority,
    ]
    for fn in tests:
        fn()
        print("PASS", fn.__name__)
    print(f"PASS agent package contract ({len(tests)} tests)")
