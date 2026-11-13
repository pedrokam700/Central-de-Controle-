"""Checkpointed, read-only 3012 enrichment of a completed 3074/2114 trace.

Never confuse 2114 Hist Seq with a timestamp, nor a 3022 station passage with
the failure's Defect Time. This stage only saves independently queried 3012
records into the existing exact-SN cache for the dashboard to correlate.
"""
from __future__ import annotations

from datetime import datetime

import ames_3012_live
import ames_3012_strategy
import repair_3012


def historical_pcba_targets(payload, current_pcbas):
    """Historical PCBA SNs referenced by this *specific* trace, in stable order."""
    current = {str(sn or '').strip() for sn in current_pcbas}
    previous = []
    seen = set()

    def add(sn):
        sn = str(sn or '').strip()
        if sn and sn not in current and sn not in seen:
            seen.add(sn)
            previous.append(sn)

    for item in ((payload or {}).get('trace_3074') or {}).get('items') or []:
        for defect in item.get('defect_traces') or []:
            for result in ((defect.get('trace_3074') or {}).get('results') or []):
                for sn in result.get('previous_pcbas') or []:
                    add(sn)
    for item in ((payload or {}).get('trace_2114') or {}).get('pcbas') or []:
        add(item.get('pcba_sn'))
    return previous


def trace_pcba_targets(payload, current_pcbas):
    """Complete 3012 scope: current 3028 boards plus linked historical boards.

    Keep source order stable so interrupted runs can use the existing exact-SN
    coverage cache and resume without discarding already verified intervals.
    """
    current = list(dict.fromkeys(str(sn or '').strip() for sn in current_pcbas if str(sn or '').strip()))
    historical = historical_pcba_targets(payload, current)
    return current + historical, len(current), len(historical)


def configured_3012_start(config):
    """Use the workstation's validated MES history start, never a hidden cutoff."""
    value = str((config or {}).get('ames_start_date') or '').strip()
    try:
        return datetime.strptime(value, '%Y-%m-%d')
    except (ValueError, TypeError):
        # Compatibility with older workstations that lack ames_start_date.
        return datetime(2026, 1, 24)


def collect_historical_3012(a, payload, records, *, job_id, line, progress=None, collector=None):
    """Collect the full traced scope with independent per-SN persistence.

    Failed SNs never create a coverage certificate. After two consecutive live
    failures, stop instead of hanging a factory trace on a broken 3012 screen.
    An explicitly configured per-job cap remains possible for constrained
    workstations, but the default full mode never silently truncates to 25 SNs.
    """
    current = [r.get('pcba_sn') for r in records]
    targets, current_count, historical_count = trace_pcba_targets(payload, current)
    cap = max(0, int(a.CONFIG.get('3012_trace_max_pcbas') or 0))
    selected = targets[:cap] if cap else targets
    omitted = len(targets) - len(selected)
    result = {'source': ames_3012_live.SOURCE_3012, 'status': 'done',
              'target_count': len(targets), 'queried_count': 0,
              'current_target_count': current_count, 'historical_target_count': historical_count,
              'completed': 0, 'records_count': 0, 'omitted': omitted,
              'failed': [], 'cache_only': 0, 'defect_time_source': '3012 Defect Time',
              'warning': ''}
    if not selected:
        return result

    # Each exact SN has a durable, trustworthy coverage window independently
    # of the 3028 snapshot. No new production data or global browse query.
    repair_3012.ensure_schema(a.STORE)
    collect = collector or a.mes_call(ames_3012_live.collect_live_3012)
    start = configured_3012_start(a.CONFIG)
    result['window_start'] = start.date().isoformat()
    # Identical minute precision to individual SN lookups. Do not regenerate
    # a 23:59:01 -> 23:59:59 cache tail on repeated captures the same day.
    end = ames_3012_strategy.mes_day_end()
    result['window_end'] = end.isoformat(timespec='seconds')
    consecutive_failures = 0
    for index, sn in enumerate(selected, 1):
        result['queried_count'] += 1
        try:
            fetched = ames_3012_strategy.collect_exact_sn_cached(
                store=a.STORE, collector=collect,
                cdp_url=str(a.CONFIG.get('chrome_cdp') or 'http://127.0.0.1:9222'),
                ames_host=str(a.CONFIG.get('ames_host') or '172.29.185.215'),
                sns=[sn], start_at=start, end_at=end,
                checkpoint_dir=a.DATA_DIR / 'checkpoints' / '3012',
                workstation=a.WORKSTATION, job_id=job_id,
                fallback_chunk_days=max(1, int(a.CONFIG.get('3012_sn_chunk_days', 90) or 90)),
            )
            result['completed'] += 1
            result['records_count'] += len(fetched.get('rows') or [])
            if not (fetched.get('cache') or {}).get('queried'):
                result['cache_only'] += 1
            consecutive_failures = 0
        except Exception as exc:
            # Source-specific failure, not evidence of no historical repairs.
            # Keep the original broad-query and fallback causes. Previously
            # truncating to 160 characters hid why the 3012 stopped at its
            # first 90-day chunk while the operator expected today's date.
            result['failed'].append({'sn': sn, 'error': f'{type(exc).__name__}: {str(exc)[:520]}'})
            consecutive_failures += 1
            if ames_3012_strategy._fatal_contract_error(exc):
                result['warning'] = '3012 interrompida: contrato da consulta inválido; demais PCBAs preservadas para retomada'
                result['omitted'] += len(selected) - index
                break
            if consecutive_failures >= 2:
                result['warning'] = '3012 interrompida após duas falhas consecutivas; cobertura parcial'
                result['omitted'] += len(selected) - index
                break
        finally:
            if progress:
                progress(index, len(targets), sn)
    if result['failed'] or result['omitted']:
        result['status'] = 'partial'
    if omitted and not result['warning']:
        result['warning'] = 'Limite 3012 configurado neste posto; demais PCBAs requerem complementação'
    return result
