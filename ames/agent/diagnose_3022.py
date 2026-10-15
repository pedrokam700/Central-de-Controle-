"""Non-invasive physical timing probe for AWIP3022.

This module deliberately does not replace or monkeypatch the production collector.
It calls the same ``ames.tela_3022.Tela3022`` used by the canonical agent and only
measures around it. The goal is to prove where the reported ~5 s/PCBA is spent
before changing waits that protect against stale ExtJS grids.

The output is sanitized operational telemetry: durations, row counts, hashes of
before/after grids and header-association status. It never writes MES credentials,
cookies, CDP data or raw grid contents to the diagnostic payload.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List

from mes_scheduler import session_object
from process_r11 import engine_support
from store import Store

AGENT_DIR = Path(__file__).resolve().parent
DEFAULT_DB = AGENT_DIR / "data" / "ames_local.sqlite3"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _ms(start: float) -> float:
    return round((time.perf_counter() - start) * 1000.0, 2)


def _safe_sn(value: Any) -> str:
    return str(value or "").strip()


def grid_signature(grid: Dict[str, Any] | None) -> Dict[str, Any]:
    """Return a non-reversible compact signature, never the raw grid payload."""
    grid = grid or {}
    headers = list(grid.get("headers") or [])
    rows = list(grid.get("rows") or [])
    canonical = json.dumps({"headers": headers, "rows": rows}, ensure_ascii=False, sort_keys=True, default=str)
    return {
        "rows": len(rows),
        "headers": len(headers),
        "loading": grid.get("store_loading"),
        "sha256_16": hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:16],
    }


def header_association(header_fields: Iterable[Dict[str, Any]] | None, pcba_sn: str) -> Dict[str, Any]:
    """Confirm the queried PCBA only when a visible header field explicitly matches it."""
    target = _safe_sn(pcba_sn)
    matches: List[Dict[str, str]] = []
    for field in header_fields or []:
        values = [field.get("raw"), field.get("value")]
        if target and any(_safe_sn(value) == target for value in values):
            matches.append({
                "label": _safe_sn(field.get("label")),
                "name": _safe_sn(field.get("name")),
                "itemId": _safe_sn(field.get("itemId")),
            })
    return {
        "status": "CONFIRMED_VISIBLE_HEADER" if matches else "UNPROVEN",
        "matched_fields": matches,
    }


def stale_grid_risk(*, before: Dict[str, Any], after: Dict[str, Any], association: Dict[str, Any], returned_rows: int) -> bool:
    """Telemetry-only risk flag; it never changes the collector result."""
    same_signature = bool(before.get("sha256_16")) and before.get("sha256_16") == after.get("sha256_16")
    return bool(returned_rows and same_signature and association.get("status") != "CONFIRMED_VISIBLE_HEADER")


def summarize(entries: Iterable[Dict[str, Any]]) -> Dict[str, Any]:
    entries = list(entries or [])
    completed = [x for x in entries if x.get("status") == "COMPLETE"]
    failed = [x for x in entries if x.get("status") == "ERROR"]
    query = [float(x.get("query_ms")) for x in completed if x.get("query_ms") is not None]
    total = [float(x.get("total_ms")) for x in entries if x.get("total_ms") is not None]
    return {
        "requested": len(entries),
        "completed": len(completed),
        "errors": len(failed),
        "no_data": sum(1 for x in completed if x.get("no_data") is True),
        "stale_grid_risk_flags": sum(1 for x in completed if x.get("stale_grid_risk") is True),
        "query_avg_ms": round(sum(query) / len(query), 2) if query else None,
        "query_max_ms": round(max(query), 2) if query else None,
        "total_avg_ms": round(sum(total) / len(total), 2) if total else None,
        "total_max_ms": round(max(total), 2) if total else None,
    }


def _grid_snapshot(tela, tela3022_mod) -> Dict[str, Any]:
    try:
        page = tela._page()
        grid = tela3022_mod.extract_best_grid(
            page,
            expected_headers=tela.cfg["expected_headers"],
            frame_hints=("3022", "Current Oper", "Tran Time", "View Lot History"),
        )
        return grid_signature(grid)
    except Exception as exc:
        return {
            "rows": None,
            "headers": None,
            "loading": None,
            "sha256_16": None,
            "probe_error_type": type(exc).__name__,
        }


def measure(engine_dir: Path, pcbas: Iterable[str], *, timeout_s: float = 18.0,
            empty_confirm_s: float = 3.0, store: Store | None = None) -> Dict[str, Any]:
    """Measure real 3022 reads without changing the collector behavior."""
    engine_dir = Path(engine_dir).resolve()
    targets = []
    seen = set()
    for value in pcbas or []:
        sn = _safe_sn(value)
        if sn and sn not in seen:
            seen.add(sn)
            targets.append(sn)
    if not targets:
        raise ValueError("Informe ao menos uma PCBA para diagnosticar a 3022")

    support = engine_support(engine_dir)
    if not support.get("ready"):
        raise RuntimeError("Motor 3022 sem contrato exigido: " + json.dumps(support, ensure_ascii=False, default=str))
    if str(engine_dir) not in sys.path:
        sys.path.insert(0, str(engine_dir))

    browser_mod = importlib.import_module("ames.browser")
    navigation_mod = importlib.import_module("ames.navigation")
    tela3022_mod = importlib.import_module("ames.tela_3022")

    started = time.perf_counter()
    browser = session_object(browser_mod.AmesBrowser(engine_dir)).connect()
    connect_ms = _ms(started)
    nav_ms = None
    entries: List[Dict[str, Any]] = []
    try:
        nav = session_object(navigation_mod.AmesNavigation(browser._target))
        nav_started = time.perf_counter()
        nav.ensure_3022()
        nav_ms = _ms(nav_started)
        tela = session_object(tela3022_mod.Tela3022(browser._target, engine_dir))
        tela._page()

        for index, pcba in enumerate(targets, start=1):
            total_started = time.perf_counter()
            before = _grid_snapshot(tela, tela3022_mod)
            query_started = time.perf_counter()
            try:
                result = tela.consultar(pcba, timeout_s=timeout_s, empty_confirm_s=empty_confirm_s)
                query_ms = _ms(query_started)
                after = _grid_snapshot(tela, tela3022_mod)
                rows = list((result or {}).get("rows") or [])
                association = header_association((result or {}).get("header_fields") or [], pcba)
                entry = {
                    "index": index,
                    "pcba_sn": pcba,
                    "status": "COMPLETE",
                    "query_ms": query_ms,
                    "total_ms": _ms(total_started),
                    "rows": len(rows),
                    "no_data": bool((result or {}).get("no_data")),
                    "process_passages": len((result or {}).get("process_passages") or []),
                    "before_grid": before,
                    "after_grid": after,
                    "grid_changed": before.get("sha256_16") != after.get("sha256_16") if before.get("sha256_16") and after.get("sha256_16") else None,
                    "association": association,
                    "stale_grid_risk": stale_grid_risk(before=before, after=after, association=association, returned_rows=len(rows)),
                    "collector_config": {"timeout_s": float(timeout_s), "empty_confirm_s": float(empty_confirm_s)},
                }
            except Exception as exc:
                entry = {
                    "index": index,
                    "pcba_sn": pcba,
                    "status": "ERROR",
                    "query_ms": _ms(query_started),
                    "total_ms": _ms(total_started),
                    "rows": None,
                    "no_data": None,
                    "before_grid": before,
                    "after_grid": _grid_snapshot(tela, tela3022_mod),
                    "error_type": type(exc).__name__,
                    "error": str(exc)[:500],
                    "collector_config": {"timeout_s": float(timeout_s), "empty_confirm_s": float(empty_confirm_s)},
                }
            entries.append(entry)
            if store is not None:
                store.record_audit(
                    "3022_DIAGNOSTIC_PCBA",
                    snapshot_id=None,
                    details={
                        "source": "diagnose_3022.py",
                        "contract": "NON_INVASIVE_MEASURE_ONLY",
                        **entry,
                    },
                )
    finally:
        browser.disconnect()

    payload = {
        "source": "3022",
        "contract": "NON_INVASIVE_MEASURE_ONLY",
        "generated_at": _now_iso(),
        "engine": {"path": support.get("path"), "sha256": support.get("sha256")},
        "connect_ms": connect_ms,
        "navigation_3022_ms": nav_ms,
        "collector_config": {"timeout_s": float(timeout_s), "empty_confirm_s": float(empty_confirm_s)},
        "entries": entries,
        "summary": summarize(entries),
        "note": "Medição externa ao coletor; não altera waits, seletores nem decisão de aceitar/recusar a grade.",
    }
    if store is not None:
        store.record_audit(
            "3022_DIAGNOSTIC_SUMMARY",
            snapshot_id=None,
            details={k: v for k, v in payload.items() if k != "entries"},
        )
    return payload


def main() -> int:
    parser = argparse.ArgumentParser(description="Mede a latência real da AWIP3022 sem alterar o coletor")
    parser.add_argument("--engine-dir", required=True, help="Diretório factory-engine/R12")
    parser.add_argument("--pcba", action="append", default=[], help="PCBA a consultar; repita para medir várias")
    parser.add_argument("--timeout", type=float, default=18.0)
    parser.add_argument("--empty-confirm", type=float, default=3.0)
    parser.add_argument("--audit", action="store_true", help="Também grava resumo sanitizado em audit_events do SQLite local")
    parser.add_argument("--output", help="Arquivo JSON de saída; se omitido imprime no console")
    args = parser.parse_args()

    store = None
    if args.audit:
        store = Store(DEFAULT_DB)
        store.initialize()
    payload = measure(Path(args.engine_dir), args.pcba, timeout_s=args.timeout, empty_confirm_s=args.empty_confirm, store=store)
    text = json.dumps(payload, ensure_ascii=False, indent=2, default=str) + "\n"
    if args.output:
        target = Path(args.output)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding="utf-8")
        print(target)
    else:
        print(text, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
