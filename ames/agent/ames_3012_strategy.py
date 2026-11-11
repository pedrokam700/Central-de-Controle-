from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List

import ames_3012_live
import repair_3012


# These failures mean the A-MES request itself was not proved. Changing the
# query from a full window to 90-day blocks cannot fix a wrong ExtJS field,
# wrong page, or unexecuted View; it only hides the original error and shows a
# misleading March end-date in the factory browser.
NON_RETRYABLE_3012_ERRORS = (
    '3012_QUERY_PERIOD_MISMATCH', '3012_DATE_RANGE_NOT_APPLIED',
    '3012_DATE_NOT_APPLIED', '3012_TIME_NOT_APPLIED',
    '3012_MAP_MISMATCH', '3012_EPOCH_2008',
    '3012_GRID_CONTRACT_MISMATCH', '3012_VIEW_NOT_EXECUTED',
    '3012_FILTER_INVALID', '3012_DATE_RANGE_DRIFT_AFTER_VIEW',
    '3012_BACKING_DATE_UNKNOWN',
)


def mes_day_end(now: datetime | None = None) -> datetime:
    """The A-MES 3012's last selectable minute of a workstation-local day.

    One common bound is required for daily trace, SN lookup and SQLite cache.
    A hidden :59-second suffix creates an artificial same-minute gap on the
    next collection even though the 3012 form only sends HH:MM.
    """
    current = now or datetime.now()
    if current.tzinfo:
        current = current.replace(tzinfo=None)
    return current.replace(hour=23, minute=59, second=0, microsecond=0)


def _fatal_contract_error(exc: Exception) -> bool:
    return any(marker in str(exc) for marker in NON_RETRYABLE_3012_ERRORS)


def _brief_error(exc: Exception) -> str:
    return f'{type(exc).__name__}: {str(exc)[:220]}'


def _iso(dt: datetime) -> str:
    return dt.isoformat(timespec="seconds")


def collect_exact_sn_cached(
    *,
    store,
    collector,
    cdp_url: str,
    ames_host: str,
    sns: Iterable[str],
    start_at: datetime,
    end_at: datetime,
    checkpoint_dir: str | Path,
    workstation: str | None = None,
    fallback_chunk_days: int = 90,
    line: str = "",
    model: str = "",
    defect_code: str = "",
    repair_code: str = "",
    defect_type: str = "",
    job_id: str | None = None,
) -> Dict[str, Any]:
    """Collect only temporal gaps for exact SNs, using local 3012 coverage as cache.

    The first attempt for each missing interval is intentionally wide (up to the
    collector's 365-day ceiling). If the live 3012 cannot sustain it, the same
    interval is retried with smaller chunks. Successful intervals are persisted
    by repair_3012.ingest and become cache coverage for future lookups.
    """
    checkpoint_dir = Path(checkpoint_dir)
    checkpoint_dir.mkdir(parents=True, exist_ok=True)
    targets = list(dict.fromkeys(str(x or "").strip() for x in sns if str(x or "").strip()))
    if not targets:
        raise ValueError("A estrategia historica 3012 exige SN exata")

    all_rows: List[Dict[str, Any]] = []
    diagnostics: List[Dict[str, Any]] = []
    persistence = {"records": 0, "inserted": 0, "updated": 0}
    cache = {"targets": len(targets), "covered": 0, "queried": 0, "fallbacks": 0, "gaps": 0}

    for sn in targets:
        gaps = repair_3012.missing_windows(store, sn, start_at, end_at)
        cache["gaps"] += len(gaps)
        if not gaps:
            cache["covered"] += 1
        for gap_start, gap_end in gaps:
            cache["queried"] += 1
            stable = f"{sn}_{gap_start:%Y%m%d%H%M%S}_{gap_end:%Y%m%d%H%M%S}"
            full_checkpoint = checkpoint_dir / f"3012_SN_PERIOD_VERIFIED_FULL_{stable}.json"
            try:
                payload = collector(
                    cdp_url=cdp_url,
                    ames_host=ames_host,
                    sns=[sn],
                    start_at=gap_start,
                    end_at=gap_end,
                    line=line,
                    model=model,
                    defect_code=defect_code,
                    repair_code=repair_code,
                    defect_type=defect_type,
                    chunk_days=365,
                    checkpoint_path=full_checkpoint,
                )
                mode = "full_first"
            except Exception as first_exc:
                if _fatal_contract_error(first_exc):
                    raise RuntimeError(
                        f'3012_CONTRACT_BLOCKED: a consulta até {gap_end:%Y-%m-%d} falhou; '
                        f'não reduzir para 90 dias sem corrigir o contrato: {_brief_error(first_exc)}'
                    ) from first_exc
                cache["fallbacks"] += 1
                fallback_checkpoint = checkpoint_dir / f"3012_SN_PERIOD_VERIFIED_CHUNKED_{stable}.json"
                try:
                    payload = collector(
                        cdp_url=cdp_url,
                        ames_host=ames_host,
                        sns=[sn],
                        start_at=gap_start,
                        end_at=gap_end,
                        line=line,
                        model=model,
                        defect_code=defect_code,
                        repair_code=repair_code,
                        defect_type=defect_type,
                        chunk_days=max(1, min(int(fallback_chunk_days or 90), 180)),
                        checkpoint_path=fallback_checkpoint,
                    )
                except Exception as second_exc:
                    raise RuntimeError(
                        '3012_FULL_AND_CHUNK_FAILED: consulta até '
                        f'{gap_end:%Y-%m-%d} não foi concluída. '
                        f'Consulta ampla: {_brief_error(first_exc)}; '
                        f'blocos de {max(1, min(int(fallback_chunk_days or 90), 180))} dias: {_brief_error(second_exc)}'
                    ) from second_exc
                mode = "chunk_fallback"
                payload.setdefault("warnings", []).append(
                    f"Consulta ampla 3012 falhou e foi retomada em blocos: {type(first_exc).__name__}: {first_exc}"
                )

            persisted = repair_3012.ingest(store, payload, workstation=workstation, job_id=job_id)
            for key in persistence:
                persistence[key] += int(persisted.get(key) or 0)
            all_rows.extend(payload.get("rows") or [])
            diagnostics.append(
                {
                    "sn": sn,
                    "from": _iso(gap_start),
                    "to": _iso(gap_end),
                    "mode": mode,
                    "rows": int(payload.get("records_count") or 0),
                    "chunks": payload.get("chunks") or [],
                }
            )

        all_rows.extend(repair_3012.history(store, sn=sn, start_at=_iso(start_at), end_at=_iso(end_at), limit=100000))

    unique: Dict[str, Dict[str, Any]] = {}
    for row in all_rows:
        key = str(row.get("row_key") or "").strip()
        if key:
            unique[key] = row
    rows = list(unique.values())
    rows.sort(key=lambda r: str(r.get("defect_time") or r.get("repair_time") or ""), reverse=True)

    return {
        "source": "AWIP3012_DIRECT_EXTJS+CACHE",
        "query": {"sns": targets, "start_at": _iso(start_at), "end_at": _iso(end_at)},
        "rows": rows,
        "records_count": len(rows),
        "persistence": persistence,
        "cache": cache,
        "ranges": diagnostics,
    }
