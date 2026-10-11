from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AGENT = ROOT / "ames" / "agent"
sys.path.insert(0, str(AGENT))

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
    check(cfg["work_shifts"]["2"]["end"] == "07:30", "2º turno deve terminar 07:30")
    check(cfg["timezone"] == "America/Sao_Paulo", "timezone da fábrica deve ser explícito")


def test_production_windows_keep_0700_boundary():
    cfg = {"production_day_start": "07:00", "timezone": "America/Sao_Paulo"}
    start, end = cal.today_window(cfg, datetime(2026, 10, 10, 10, 0))
    check(start.startswith("2026-10-10T07:00"), "janela hoje deve usar 07:00, não o início do turno")
    check(end.startswith("2026-10-10T10:00"), "fim deve ser o instante atual")
    pstart, pend = cal.previous_day_window(cfg, datetime(2026, 10, 10, 10, 0))
    check(pstart.startswith("2026-10-09T07:00"), "dia anterior deve começar 07:00")
    check(pend.startswith("2026-10-10T07:00"), "dia anterior deve terminar 07:00")


def test_shift_classification_crosses_midnight():
    cfg = {"timezone": "America/Sao_Paulo"}
    check(cal.shift_for(cfg, datetime(2026, 10, 10, 8, 0))["id"] == "1", "08:00 deve ser 1º turno")
    check(cal.shift_for(cfg, datetime(2026, 10, 10, 17, 29))["id"] == "1", "17:29 deve ser 1º turno")
    check(cal.shift_for(cfg, datetime(2026, 10, 10, 17, 30))["id"] == "2", "17:30 deve ser 2º turno")
    check(cal.shift_for(cfg, datetime(2026, 10, 11, 0, 15))["id"] == "2", "madrugada deve permanecer 2º turno")
    check(cal.shift_for(cfg, datetime(2026, 10, 11, 7, 29))["id"] == "2", "07:29 deve ser 2º turno")
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


if __name__ == "__main__":
    tests = [
        test_legacy_day_start_is_migrated_without_shift_reinterpretation,
        test_production_windows_keep_0700_boundary,
        test_shift_classification_crosses_midnight,
        test_invalid_calendar_fails_closed,
    ]
    for test in tests:
        test()
        print("PASS", test.__name__)
    print(f"PASS operational calendar ({len(tests)} tests)")
