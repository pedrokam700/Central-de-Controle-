"""Fail-closed offline Windows payload assembler for AT-only workstations.

The administrator uses an already-installed Central to bundle code and
pre-approved password verifiers. Runtime DB, tokens, config and MES results
are NEVER transferred. Without all pre-staged installers and Windows wheels
there is no "offline-ready" ZIP.
"""
from __future__ import annotations

import hashlib
import json
import zipfile
from pathlib import Path

WINDOWS_SCRIPTS = ('01_INSTALAR_AT.bat', '02_ABRIR_AT.bat',
                   'INSTALAR_CENTRAL_AT.ps1', 'INICIAR_CENTRAL_AT.ps1',
                   '05_ABRIR_CHROME_AMES.bat')
PYTHON_INSTALLER = 'python-3.12.10-amd64.exe'
CHROME_INSTALLER = 'GoogleChromeStandaloneEnterprise64.msi'
FORBIDDEN = {'.sqlite', '.sqlite3', '.db', '.key', '.pem', '.log', '.zip', '.pyc'}


class AtPackageUnavailable(ValueError):
    pass


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def _check_accounts(data: bytes):
    if not isinstance(data, bytes) or not 10 < len(data) < 2_000_000:
        raise AtPackageUnavailable('Perfis de usuário AT ausentes ou grandes demais')
    parsed = json.loads(data)
    if not isinstance(parsed, dict) or not parsed.get('users'):
        raise AtPackageUnavailable('Cadastre pelo menos um técnico antes de preparar o pendrive')
    # Validate by the same model as the runtime, without creating an extra file.
    from at_profiles import _normalized_username, _valid_verifier, _permissions, _ROLES, SCHEMA
    if parsed.get('schema') != SCHEMA or not isinstance(parsed['users'], dict):
        raise AtPackageUnavailable('Formato de perfis AT inválido')
    for name, record in parsed['users'].items():
        if _normalized_username(name) != name or not _valid_verifier(record.get('password')):
            raise AtPackageUnavailable('Conta AT inválida')
        _permissions(record.get('permissions'))
        if record.get('role', 'technician') not in _ROLES:
            raise AtPackageUnavailable('Perfil AT inválido')
        if type(record.get('enabled')) is not bool:
            raise AtPackageUnavailable('Estado de conta AT inválido')


def _verify_vendor_preflight(package_root: Path, vendor: Path, required: list[Path], wheels: list[Path]):
    """Reject stale or unprepared Windows wheels before marking a ZIP offline."""
    proof_path = vendor / 'PREPARACAO_AT_OK.json'
    try:
        proof = json.loads(proof_path.read_text(encoding='utf-8-sig'))
    except (OSError, ValueError) as exc:
        raise AtPackageUnavailable('Execute 00_PREPARAR_PENDRIVE_AT.bat no Windows antes de exportar') from exc
    expected_paths = required + wheels
    actual = {
        path.relative_to(vendor).as_posix(): _sha256_file(path)
        for path in expected_paths
    }
    if (not isinstance(proof, dict) or
            proof.get('schema') != 'central-at-vendor-preflight-v1' or
            proof.get('platform') != 'Windows' or proof.get('arch') != 'amd64' or
            proof.get('python_version') != '3.12' or proof.get('files') != actual or
            proof.get('requirements_sha256') != _sha256_file(
                package_root / 'ames-agent' / 'requirements.txt')):
        raise AtPackageUnavailable('Dependências Windows alteradas ou preparação offline desatualizada')
    for wheel in wheels:
        if not zipfile.is_zipfile(wheel):
            raise AtPackageUnavailable('Biblioteca Windows inválida: ' + wheel.name)


def _collect_payload(package_root: Path, vendor: Path, users: bytes) -> dict[str, Path | bytes]:
    package_root, vendor = Path(package_root).resolve(), Path(vendor).resolve()
    required = [vendor / 'python' / PYTHON_INSTALLER,
                vendor / 'chrome' / CHROME_INSTALLER]
    wheels = sorted((vendor / 'wheels').glob('*.whl'))
    if not wheels:
        raise AtPackageUnavailable('Falta a pasta vendor-at/wheels com todas as bibliotecas Windows para Python 3.12')
    if any(not p.is_file() for p in required):
        raise AtPackageUnavailable('Faltam instaladores offline de Python 3.12 ou Google Chrome em vendor-at')
    _verify_vendor_preflight(package_root, vendor, required, wheels)
    if not (package_root / 'frontend' / 'Central-de-Controle-' / 'ames').is_dir():
        raise AtPackageUnavailable('Arquivos estáticos do Console ausentes na Central instalada')
    if not (package_root / 'factory-engine' / 'config' / 'settings.json').is_file():
        raise AtPackageUnavailable('Motor A-MES incompleto')
    instructions = ("CENTRAL AT · INSTALACAO OFFLINE PARA POSTO DE TECNICO\r\n"
                    "\r\n1. Extraia o ZIP inteiro antes de iniciar.\r\n"
                    "2. Execute 01_INSTALAR_AT.bat e autorize a instalacao com a TI.\r\n"
                    "3. Apos instalar, execute 02_ABRIR_AT.bat no PC AT.\r\n"
                    "4. Faca login no A-MES na janela Chrome, se solicitado.\r\n"
                    "5. Na Central AT, entre com o usuario e senha individuais fornecidos por Pedro.\r\n"
                    "\r\nSem internet: o instalador usa somente os arquivos incluidos,\r\n"
                    "e para se as dependencias nao estiverem presentes.\r\n"
                    "Os historicos sao consultados diretamente no A-MES; nenhuma base\r\n"
                    "antiga foi copiada do computador administrador.\r\n"
                    "Nao substitua instalacoes existentes sem um procedimento de atualizacao.\r\n"
                    "As contas protegidas acompanham o ZIP; guarde o pendrive com cuidado.\r\n")
    payload: dict[str, Path | bytes] = {
        'accounts/at_offline_accounts.json': users,
        'LEIA_PRIMEIRO_AT.txt': instructions.encode('utf-8'),
    }
    for p in (package_root / 'ames-agent').glob('*'):
        if p.is_file() and (p.suffix == '.py' or p.name in {'requirements.txt', 'config.example.json'}):
            payload['ames-agent/' + p.name] = p
    if not {'ames-agent/at_viewer_entry.py', 'ames-agent/at_profiles.py',
            'ames-agent/agent_hardened_entry.py', 'ames-agent/agent.py',
            'ames-agent/requirements.txt', 'ames-agent/config.example.json'} <= payload.keys():
        raise AtPackageUnavailable('O agente instalado ainda não possui o módulo Central AT')
    for p in (package_root / 'factory-engine').rglob('*'):
        if p.is_file() and (p.suffix == '.py' or p.name == 'requirements.txt' or
                            p.parent.name == 'config' and p.suffix == '.json'):
            payload['factory-engine/' + p.relative_to(package_root / 'factory-engine').as_posix()] = p
    for p in (package_root / 'frontend' / 'Central-de-Controle-' / 'ames').rglob('*'):
        # Only the AT portal's own HTML entry is shipped. No general Central
        # dashboard HTML is included in this restricted workstation payload.
        at_entry = p.relative_to(package_root / 'frontend' / 'Central-de-Controle-' / 'ames').as_posix() == 'at-viewer/index.html'
        if p.is_file() and (p.suffix in {'.js', '.mjs', '.css', '.json', '.svg'} or at_entry):
            payload['frontend/Central-de-Controle-/ames/' + p.relative_to(
                package_root / 'frontend' / 'Central-de-Controle-' / 'ames').as_posix()] = p
    if 'frontend/Central-de-Controle-/ames/at-viewer/index.html' not in payload:
        raise AtPackageUnavailable('Página de login AT ausente no pacote de instalação')
    for name in WINDOWS_SCRIPTS:
        p = package_root / 'at-setup' / name
        if not p.is_file():
            raise AtPackageUnavailable('Pacote principal incompleto: at-setup/' + name)
        payload[name] = p
    for p in [*required, *wheels]:
        payload['vendor/' + p.relative_to(vendor).as_posix()] = p
    for name, source in payload.items():
        if name.startswith('/') or '..' in Path(name).parts or Path(name).suffix in FORBIDDEN:
            raise AtPackageUnavailable('Arquivo proibido no pacote AT: ' + name)
        if isinstance(source, Path) and (source.is_symlink() or not source.is_file()):
            raise AtPackageUnavailable('Arquivo de origem inválido: ' + name)
    return payload


def build_at_package(package_root: Path, vendor: Path, accounts: bytes, output: Path) -> dict:
    """Build one portable zip. No network, install or production state changes."""
    _check_accounts(accounts)
    payload = _collect_payload(package_root, vendor, accounts)
    output = Path(output)
    entries = {}
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for name, source in sorted(payload.items()):
            if isinstance(source, bytes):
                entries[name] = hashlib.sha256(source).hexdigest()
                archive.writestr(name, source)
            else:
                digest = hashlib.sha256()
                with source.open('rb') as reader:
                    for chunk in iter(lambda: reader.read(1024 * 1024), b''):
                        digest.update(chunk)
                entries[name] = digest.hexdigest()
                archive.write(source, name)
        manifest = {'schema': 'central-at-offline-package-v1', 'files': entries,
                    'offline_wheels': len([k for k in entries if k.startswith('vendor/wheels/')]),
                    'provisioned_accounts': len(json.loads(accounts)['users']),
                    'internet_needed_on_at_pc': False, 'scope': 'at-query-only'}
        archive.writestr('AT_PACKAGE_MANIFEST.json', json.dumps(manifest, sort_keys=True, indent=2))
    # The actual bytes handed to the operator must pass the same independent
    # hash and account validation that the installer will rely on.
    verify_at_package(output)
    return {'ok': True, 'files': len(entries), 'size': output.stat().st_size,
            'users': manifest['provisioned_accounts']}


def verify_at_package(archive_path: Path) -> dict:
    with zipfile.ZipFile(archive_path) as archive:
        names = archive.namelist()
        if len(names) != len(set(names)) or archive.testzip():
            raise ValueError('ZIP corrompido ou com arquivos duplicados')
        manifest = json.loads(archive.read('AT_PACKAGE_MANIFEST.json'))
        if manifest.get('schema') != 'central-at-offline-package-v1' or set(names) != set(manifest['files']) | {'AT_PACKAGE_MANIFEST.json'}:
            raise ValueError('Manifesto AT incompleto')
        for name, digest in manifest['files'].items():
            if hashlib.sha256(archive.read(name)).hexdigest() != digest:
                raise ValueError('Hash diferente: ' + name)
        _check_accounts(archive.read('accounts/at_offline_accounts.json'))
        return manifest
