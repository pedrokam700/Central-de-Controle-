from __future__ import annotations

import copy
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AGENT = ROOT / "ames" / "agent"
sys.path.insert(0, str(AGENT))

import candidate_config  # noqa: E402
import operational_calendar as cal  # noqa: E402


def check(value, message):
    if not value:
        raise AssertionError(message)


def test_legacy_day_start_is_migrated_without_shift_reinterpretation():
    cfg = {"day_start": "07:00"}
    changed = cal.migrate_config(cfg)
    check(changed, "config antigo deve receber campos explícitos")
    check(cfg["production_day_start"] == "07:00", "day_start antigo deve permanecer como fronteira do dia")
    check(cfg["work_shifts"]["1"]["start"] == "07:30", "1º turno deve começar 07:30")
    check(cfg["work_shifts"]["1"]["end"] == "17:30", "1º turno deve terminar 17:30")
    check(cfg["work_shifts"]["2"]["start"] == "17:30", "2º turno deve começar 17:30")
    check(cfg["work_shifts"]["2"]["end"] == "03:30", "2º turno deve terminar 03:30")
    check(cfg["timezone"] == "America/Sao_Paulo", "timezone da fábrica deve ser explícito")


def test_production_windows_keep_0700_boundary():
    cfg = {"production_day_start": "07:00", "timezone": "America/Sao_Paulo"}
    start, end = cal.today_window(cfg, datetime(2026, 10, 10, 10, 0))
    check(start.startswith("2026-10-10T07:00"), "janela hoje deve usar 07:00, não o início do turno")
    check(end.startswith("2026-10-10T10:00"), "fim deve ser o instante atual")
    pstart, pend = cal.previous_day_window(cfg, datetime(2026, 10, 10, 10, 0))
    check(pstart.startswith("2026-10-09T07:00"), "dia anterior deve começar 07:00")
    check(pend.startswith("2026-10-10T07:00"), "dia anterior deve terminar 07:00")


def test_previous_production_day_skips_weekend_and_supports_exceptions():
    cfg = {"timezone": "America/Sao_Paulo", "production_day_start": "07:00"}
    monday = datetime(2026, 10, 19, 9, 45)
    start, end = cal.previous_day_window(cfg, monday)
    check(start.startswith("2026-10-16T07:00"), "segunda deve buscar sexta")
    check(end.startswith("2026-10-17T07:00"), "janela da sexta encerra sábado 07:00")
    cfg["non_production_dates"] = ["2026-10-16"]
    start, end = cal.previous_day_window(cfg, monday)
    check(start.startswith("2026-10-15T07:00"), "sexta parada deve recuar para quinta")
    cfg["extra_production_dates"] = ["2026-10-18"]
    start, end = cal.previous_day_window(cfg, monday)
    check(start.startswith("2026-10-18T07:00"), "domingo excepcional deve ser considerado")
    check(end.startswith("2026-10-19T07:00"), "janela excepcional mantém a virada 07:00")
    check(cal.shift_for(cfg, datetime(2026, 10, 19, 7, 15))["id"] is None, "07:15 fora dos turnos apesar de novo dia produtivo")


def test_exact_legacy_schedule_is_corrected_without_changing_custom_shifts():
    legacy={"day_start":"07:00","work_shifts":{
        "1":{"label":"1º Turno","start":"07:30","end":"17:30"},
        "2":{"label":"2º Turno","start":"17:30","end":"07:30"}}}
    check(cal.normalized(legacy)["work_shifts"]["2"]["end"]=="03:30","legacy defaults read as corrected")
    changed=cal.migrate_config(legacy)
    check(changed,"old incorrect schedule must persist correction")
    check(legacy["work_shifts"]["2"]["end"]=="03:30","migration must update legacy hours")
    custom={"work_shifts":{
        "1":{"label":"Especial 1","start":"08:00","end":"16:00"},
        "2":{"label":"Especial 2","start":"16:00","end":"22:00"}}}
    check(cal.normalized(custom)["work_shifts"]["2"]["end"]=="22:00","custom schedules must be preserved")

def test_calendar_exceptions_fail_closed():
    for bad in [
        {"non_production_dates": ["2026-02-30"]},
        {"extra_production_dates": "2026-10-18"},
        {"non_production_dates": ["2026-10-16"], "extra_production_dates": ["2026-10-16"]},
    ]:
        try:
            cal.normalized(bad)
        except ValueError:
            pass
        else:
            raise AssertionError(f"exceção inválida deve ser rejeitada: {bad}")


def test_shift_classification_crosses_midnight():
    cfg = {"timezone": "America/Sao_Paulo"}
    check(cal.shift_for(cfg, datetime(2026, 10, 10, 8, 0))["id"] == "1", "08:00 deve ser 1º turno")
    check(cal.shift_for(cfg, datetime(2026, 10, 10, 17, 29))["id"] == "1", "17:29 deve ser 1º turno")
    check(cal.shift_for(cfg, datetime(2026, 10, 10, 17, 30))["id"] == "2", "17:30 deve ser 2º turno")
    check(cal.shift_for(cfg, datetime(2026, 10, 11, 0, 15))["id"] == "2", "madrugada deve permanecer 2º turno")
    check(cal.shift_for(cfg, datetime(2026, 10, 11, 7, 29))["id"] is None, "07:29 fora dos turnos")
    check(cal.shift_for(cfg, datetime(2026, 10, 11, 3, 29))["id"] == "2", "03:29 ainda é 2º turno")
    check(cal.shift_for(cfg, datetime(2026, 10, 11, 3, 30))["id"] is None, "03:30 fora dos turnos")
    check(cal.shift_for(cfg, datetime(2026, 10, 11, 4, 0))["id"] is None, "04:00 fora dos turnos")
    check(cal.shift_for(cfg, datetime(2026, 10, 11, 7, 30))["id"] == "1", "07:30 deve virar 1º turno")


def test_invalid_calendar_fails_closed():
    for cfg in [
        {"timezone": "Invalid/Zone"},
        {"production_day_start": "25:00"},
        {"work_shifts": {"1": {"start": "xx", "end": "17:30"}}},
    ]:
        try:
            cal.normalized(cfg)
        except ValueError:
            pass
        else:
            raise AssertionError(f"calendário inválido deveria falhar: {cfg}")


class _AuditStore:
    def __init__(self):
        self.events = []
        self.fail = False

    def record_audit(self, event_type, workstation=None, details=None):
        if self.fail:
            raise RuntimeError("audit unavailable")
        self.events.append((event_type, workstation, details or {}))


class _FakeAgent:
    def __init__(self):
        self.CONFIG = {
            "ames_host": "172.29.185.215",
            "ames_port": 80,
            "ames_start_url": "http://172.29.185.215/asymes",
            "configured_lines": ["TAN10101", "TAN10102", "TAN10103"],
            "production_day_start": "07:00",
            "day_start": "07:00",
            "timezone": "America/Sao_Paulo",
            "work_shifts": {
                "1": {"label": "1º Turno", "start": "07:30", "end": "17:30"},
                "2": {"label": "2º Turno", "start": "17:30", "end": "07:30"},
            },
        }
        self.WORKSTATION = "TEST"
        self.STORE = _AuditStore()
        self.writes = []
        self.fail_write = False

    def normalize_line_id(self, value):
        raw = str(value or "").strip()
        aliases = {"Linha 1": "TAN10101", "Linha 2": "TAN10102", "Linha 3": "TAN10103"}
        return aliases.get(raw, raw.upper())

    def normalize_lines(self, values):
        out = []
        for value in values or []:
            line = self.normalize_line_id(value)
            if line and line not in out:
                out.append(line)
        return out

    def write_config(self, config):
        if self.fail_write:
            raise OSError("disk unavailable")
        self.writes.append(copy.deepcopy(config))


def test_candidate_config_normalizes_safe_values():
    agent = _FakeAgent()
    result = candidate_config.apply(agent, {
        "configured_lines": ["Linha 1", "TAN10102", "Linha 1"],
        "performance": "normal",
        "monitor_interval_minutes": "30",
        "backup_retention": 12,
        "ames_port": "80",
        "ames_host": "172.29.185.215",
        "ames_start_url": "http://172.29.185.215/asymes",
        "allowed_origins": [
            "https://central-cora-v2.vercel.app/",
            "https://central-cora-v2.vercel.app",
            "http://127.0.0.1:8765/",
        ],
        "setup_complete": True,
        "auto_backup_on_start": False,
        "unknown_legacy_field": "ignored",
    })
    check(result["ok"], "config válida deve ser aceita")
    check(agent.CONFIG["configured_lines"] == ["TAN10101", "TAN10102"], "linhas devem ser normalizadas e deduplicadas")
    check(agent.CONFIG["performance"] == "balanced", "normal legado deve virar balanced")
    check(agent.CONFIG["allowed_origins"] == ["https://central-cora-v2.vercel.app", "http://127.0.0.1:8765"], "origens devem ser canônicas")
    check(result["ignored_keys"] == ["unknown_legacy_field"], "campos desconhecidos devem ser auditáveis sem quebrar compatibilidade")
    check(result["audit_warning"] is None, "audit normal não deve gerar warning")
    check(len(agent.writes) == 1, "config validada deve ser persistida uma vez")
    check(agent.STORE.events[-1][2]["ignored_keys"] == ["unknown_legacy_field"], "audit deve registrar campos ignorados")


def test_candidate_config_rejects_unsafe_network_values_atomically():
    invalid_bodies = [
        {"allowed_origins": ["http://example.com"]},
        {"allowed_origins": ["https://example.com/path"]},
        {"ames_port": 70000},
        {"ames_host": "http://172.29.185.215"},
        {"ames_start_url": "http://10.0.0.2/asymes"},
        {"ames_start_date": "2026-01-01-extra"},
        {"configured_lines": []},
        {"performance": "turbo"},
        {"setup_complete": "yes"},
    ]
    for body in invalid_bodies:
        agent = _FakeAgent()
        before = copy.deepcopy(agent.CONFIG)
        try:
            candidate_config.apply(agent, body)
        except ValueError:
            pass
        else:
            raise AssertionError(f"config insegura deveria falhar: {body}")
        check(agent.CONFIG == before, f"falha de validação não pode mutar CONFIG: {body}")
        check(not agent.writes, f"falha de validação não pode persistir config: {body}")
        check(not agent.STORE.events, f"falha de validação não pode auditar como update concluído: {body}")


def test_candidate_config_disk_failure_keeps_previous_memory_and_no_audit():
    agent = _FakeAgent()
    before = copy.deepcopy(agent.CONFIG)
    agent.fail_write = True
    try:
        candidate_config.apply(agent, {"performance": "fast", "backup_retention": 20})
    except OSError as exc:
        check("disk unavailable" in str(exc), "erro real de persistência deve chegar ao chamador")
    else:
        raise AssertionError("falha de persistência deveria ser propagada")
    check(agent.CONFIG == before, "falha de escrita não pode deixar CONFIG em memória diferente do disco")
    check(not agent.writes, "escrita que falhou não pode ser registrada como persistida")
    check(not agent.STORE.events, "update não persistido não pode gerar audit de sucesso")


def test_candidate_config_audit_failure_does_not_turn_committed_config_into_failure():
    agent = _FakeAgent()
    agent.STORE.fail = True
    result = candidate_config.apply(agent, {"performance": "safe"})
    check(result["ok"] is True, "config já persistida deve continuar sucesso mesmo se audit ficar indisponível")
    check(result["audit_warning"] == "RuntimeError", "falha de audit deve ficar explícita sem expor payload")
    check(agent.CONFIG["performance"] == "safe", "config persistida e memória devem permanecer alinhadas")
    check(agent.writes[-1]["performance"] == "safe", "persistência deve ocorrer antes do audit")


if __name__ == "__main__":
    tests = [
        test_legacy_day_start_is_migrated_without_shift_reinterpretation,
        test_production_windows_keep_0700_boundary,
        test_previous_production_day_skips_weekend_and_supports_exceptions,
        test_exact_legacy_schedule_is_corrected_without_changing_custom_shifts,
        test_calendar_exceptions_fail_closed,
        test_shift_classification_crosses_midnight,
        test_invalid_calendar_fails_closed,
        test_candidate_config_normalizes_safe_values,
        test_candidate_config_rejects_unsafe_network_values_atomically,
        test_candidate_config_disk_failure_keeps_previous_memory_and_no_audit,
        test_candidate_config_audit_failure_does_not_turn_committed_config_into_failure,
    ]
    for test in tests:
        test()
        print("PASS", test.__name__)
    print(f"PASS operational calendar/config ({len(tests)} tests)")
