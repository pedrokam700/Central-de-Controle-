from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path

SCHEMA = 'central-factory-validation-evidence-v1'
PHYSICAL_BRANCH = 'v2/console-parity-r12'
PHYSICAL_SHA = '5e45127d3b61b37968a4c2b05596919670b307cb'
HARDENING_BRANCH = 'hardening/p0-production-readiness'
STATUS = {'pending', 'pass', 'fail', 'blocked'}
APPROVAL = {'pending', 'approved', 'rejected'}
GIT_SHA = re.compile(r'^(?:[0-9a-f]{40}|[0-9a-f]{64})$', re.I)
SHA256 = re.compile(r'^[0-9a-f]{64}$', re.I)

VIEWS = [
    ('monitoring', 'Monitoramento'),
    ('top3_fpy', 'Top 3 & FPY'),
    ('failures', 'Falhas'),
    ('sn_query', 'Consulta por SN'),
    ('traceability', 'Rastreabilidade'),
    ('reuse_dashboards', 'Dashboards de reuso'),
    ('process_3022_at', 'Processo / 3022 & AT'),
    ('local_base', 'Base local'),
    ('cora_knowledge', 'CORA conhecimento'),
]

FACTORY_GATES = {
    'A': 'conexao_e_isolamento',
    'B': '3028',
    'C': '2114',
    'D': '3074_reuso',
    'E': '3022_processo',
    'F': 'modos_seletivos',
    'G': 'consulta_por_sn',
    'H': 'concorrencia_e_cancelamento',
    'I': 'experiencia_equipe_offline_recuperacao',
}


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace('+00:00', 'Z')


def template(hardening_sha: str | None) -> dict:
    if hardening_sha is not None and not GIT_SHA.fullmatch(hardening_sha):
        raise SystemExit('hardening SHA deve conter 40 ou 64 caracteres hexadecimais')
    return {
        'schema': SCHEMA,
        'created_at_utc': now_iso(),
        'physical_candidate': {
            'branch': PHYSICAL_BRANCH,
            'sha': PHYSICAL_SHA,
            'validation': 'pending',
        },
        'hardening_candidate': {
            'branch': HARDENING_BRANCH,
            'sha': hardening_sha,
            'validation': 'pending',
        },
        'views_9_of_9': [
            {'id': view_id, 'name': name, 'status': 'pending'} for view_id, name in VIEWS
        ],
        'factory_gates': {
            gate: {'id': gate_id, 'status': 'pending'} for gate, gate_id in FACTORY_GATES.items()
        },
        'r12_capture': {
            'status': 'pending',
            'sha256': None,
            'file_count': None,
        },
        'multi_pc_hardening': {
            'status': 'pending',
            'observer_diagnostic': 'pending',
            'same_workstation_confirmation': 'pending',
            'stale_fence_rejected': 'pending',
            'two_workstation_physical': 'pending',
        },
        'local_origin_hardening': {
            'status': 'pending',
            'service_worker_lifecycle': 'pending',
            'offline_shell_after_online_prepare': 'pending',
            'firebase_auth_loopback': 'pending',
            'deactivate_rollback': 'pending',
        },
        'performance_ms': {
            '3028': None,
            '3074': None,
            '2114': None,
            '3022': None,
            'full': None,
        },
        'human_approval': 'pending',
        'overall': 'pending',
        'privacy': {
            'contains_mes_credentials': False,
            'contains_browser_session': False,
            'contains_pcba_or_material_sn': False,
            'contains_operator_identity': False,
            'contains_raw_mes_payload': False,
        },
    }


def exact_keys(obj: dict, expected: set[str], where: str) -> None:
    if not isinstance(obj, dict):
        raise ValueError(f'{where} deve ser objeto')
    actual = set(obj)
    if actual != expected:
        extra = sorted(actual - expected)
        missing = sorted(expected - actual)
        raise ValueError(f'{where}: chaves inválidas; extras={extra}, ausentes={missing}')


def status(value: object, where: str) -> str:
    if value not in STATUS:
        raise ValueError(f'{where} deve ser pending/pass/fail/blocked')
    return str(value)


def validate(doc: dict) -> dict:
    exact_keys(doc, {
        'schema', 'created_at_utc', 'physical_candidate', 'hardening_candidate',
        'views_9_of_9', 'factory_gates', 'r12_capture', 'multi_pc_hardening',
        'local_origin_hardening', 'performance_ms', 'human_approval', 'overall', 'privacy'
    }, 'root')
    if doc['schema'] != SCHEMA:
        raise ValueError('schema inválido')

    physical = doc['physical_candidate']
    exact_keys(physical, {'branch', 'sha', 'validation'}, 'physical_candidate')
    if physical['branch'] != PHYSICAL_BRANCH or physical['sha'] != PHYSICAL_SHA:
        raise ValueError('candidata física congelada não pode ser alterada')
    physical['validation'] = status(physical['validation'], 'physical_candidate.validation')

    hardening = doc['hardening_candidate']
    exact_keys(hardening, {'branch', 'sha', 'validation'}, 'hardening_candidate')
    if hardening['branch'] != HARDENING_BRANCH:
        raise ValueError('branch de hardening inválida')
    if hardening['sha'] is not None and not GIT_SHA.fullmatch(str(hardening['sha'])):
        raise ValueError('hardening_candidate.sha inválido')
    hardening['validation'] = status(hardening['validation'], 'hardening_candidate.validation')
    if hardening['validation'] == 'pass' and hardening['sha'] is None:
        raise ValueError('hardening_candidate PASS exige SHA exato')

    views = doc['views_9_of_9']
    if not isinstance(views, list) or len(views) != len(VIEWS):
        raise ValueError('views_9_of_9 deve conter exatamente 9 views')
    for index, ((expected_id, expected_name), item) in enumerate(zip(VIEWS, views)):
        exact_keys(item, {'id', 'name', 'status'}, f'views_9_of_9[{index}]')
        if item['id'] != expected_id or item['name'] != expected_name:
            raise ValueError(f'view {index} não corresponde ao requisito canônico')
        item['status'] = status(item['status'], f'views_9_of_9[{index}].status')

    gates = doc['factory_gates']
    exact_keys(gates, set(FACTORY_GATES), 'factory_gates')
    for gate, expected_id in FACTORY_GATES.items():
        item = gates[gate]
        exact_keys(item, {'id', 'status'}, f'factory_gates.{gate}')
        if item['id'] != expected_id:
            raise ValueError(f'factory_gates.{gate}.id inválido')
        item['status'] = status(item['status'], f'factory_gates.{gate}.status')

    capture = doc['r12_capture']
    exact_keys(capture, {'status', 'sha256', 'file_count'}, 'r12_capture')
    capture['status'] = status(capture['status'], 'r12_capture.status')
    if capture['sha256'] is not None and not SHA256.fullmatch(str(capture['sha256'])):
        raise ValueError('r12_capture.sha256 inválido')
    if capture['file_count'] is not None and (not isinstance(capture['file_count'], int) or capture['file_count'] <= 0):
        raise ValueError('r12_capture.file_count deve ser inteiro positivo')
    if capture['status'] == 'pass' and (capture['sha256'] is None or capture['file_count'] is None):
        raise ValueError('captura R12 PASS exige sha256 e file_count')

    multi = doc['multi_pc_hardening']
    exact_keys(multi, {
        'status', 'observer_diagnostic', 'same_workstation_confirmation',
        'stale_fence_rejected', 'two_workstation_physical'
    }, 'multi_pc_hardening')
    for key in multi:
        multi[key] = status(multi[key], f'multi_pc_hardening.{key}')

    local = doc['local_origin_hardening']
    exact_keys(local, {
        'status', 'service_worker_lifecycle', 'offline_shell_after_online_prepare',
        'firebase_auth_loopback', 'deactivate_rollback'
    }, 'local_origin_hardening')
    for key in local:
        local[key] = status(local[key], f'local_origin_hardening.{key}')

    perf = doc['performance_ms']
    exact_keys(perf, {'3028', '3074', '2114', '3022', 'full'}, 'performance_ms')
    for key, value in perf.items():
        if value is not None and (not isinstance(value, int) or isinstance(value, bool) or value < 0 or value > 86_400_000):
            raise ValueError(f'performance_ms.{key} deve ser inteiro >=0 e <=86400000')

    if doc['human_approval'] not in APPROVAL:
        raise ValueError('human_approval deve ser pending/approved/rejected')

    privacy = doc['privacy']
    exact_keys(privacy, {
        'contains_mes_credentials', 'contains_browser_session', 'contains_pcba_or_material_sn',
        'contains_operator_identity', 'contains_raw_mes_payload'
    }, 'privacy')
    if any(value is not False for value in privacy.values()):
        raise ValueError('evidência de fábrica deve permanecer sanitizada; privacy deve ser todo false')

    statuses = [item['status'] for item in views]
    statuses += [item['status'] for item in gates.values()]
    statuses += [capture['status']]
    statuses += list(multi.values())
    statuses += list(local.values())
    statuses += [physical['validation'], hardening['validation']]

    if 'fail' in statuses or doc['human_approval'] == 'rejected':
        overall = 'failed'
    elif 'blocked' in statuses:
        overall = 'blocked'
    elif all(value == 'pass' for value in statuses) and doc['human_approval'] == 'approved' and hardening['sha'] is not None:
        overall = 'ready_for_promotion_review'
    else:
        overall = 'pending'
    doc['overall'] = overall
    return doc


def load(path: Path) -> dict:
    try:
        value = json.loads(path.read_text(encoding='utf-8-sig'))
    except Exception as exc:
        raise SystemExit(f'JSON inválido: {exc}') from exc
    if not isinstance(value, dict):
        raise SystemExit('evidência deve ser um objeto JSON')
    return value


def write_new(path: Path, data: dict) -> None:
    path = path.resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        raise SystemExit(f'Arquivo já existe: {path}')
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(path)


def main() -> None:
    parser = argparse.ArgumentParser(description='Gera/valida evidência sanitizada do Factory Gate R12 + hardening físico.')
    sub = parser.add_subparsers(dest='command', required=True)
    create = sub.add_parser('template', help='Cria template novo, todo pendente.')
    create.add_argument('output', type=Path)
    create.add_argument('--hardening-sha')
    check = sub.add_parser('validate', help='Valida e normaliza evidência existente.')
    check.add_argument('input', type=Path)
    check.add_argument('--output', type=Path)
    args = parser.parse_args()

    if args.command == 'template':
        write_new(args.output, template(args.hardening_sha))
        return

    try:
        normalized = validate(load(args.input))
    except ValueError as exc:
        raise SystemExit(f'Evidência inválida: {exc}') from exc
    if args.output:
        write_new(args.output, normalized)
    else:
        print(json.dumps(normalized, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
