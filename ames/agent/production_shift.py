"""CLEAN V5 temporal classification, adapted to the canonical 3022 contract.

Naive grid timestamps require an explicit grid offset. Reference times already
normalized by the process correlator are timezone aware. Never use Defect Time.
"""
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

FIELDS = ('production_shift', 'production_operational_date', 'production_event_time', 'production_shift_source', 'production_shift_basis')
ZONE = ZoneInfo('America/Sao_Paulo')

def classify(reference_event_time, previous_event_time=None, *, naive_offset=-3):
    result = dict.fromkeys(FIELDS)
    # Legacy positional argument is ignored: a previous passage is not generation evidence.
    for value, basis in ((reference_event_time, 'reference_process'),):
        if not value:
            continue
        try:
            event = datetime.fromisoformat(str(value).strip().replace('Z', '+00:00'))
            if event.tzinfo is None:
                event = event.replace(tzinfo=timezone(timedelta(hours=naive_offset)))
            local = event.astimezone(ZONE)
        except (TypeError, ValueError):
            continue
        minute = local.hour * 60 + local.minute
        # Production day is 07:00→07:00, independently of the 07:30 shift boundary.
        day = local.date() - (timedelta(days=1) if minute < 420 else timedelta())
        return dict(zip(FIELDS, ('1st Shift' if 450 <= minute < 1050 else '2nd Shift', day.isoformat(), local.isoformat(), '3022', basis)))
    return result

def classify_passage(event_time, *, naive_offset=-3):
    result = classify(event_time, naive_offset=naive_offset)
    if result['production_shift_source']:
        result['production_shift_basis'] = 'process_passage'
    return result

def from_context(context):
    """Revalidate a persisted defect context; old fallback classifications are not proof."""
    empty = dict.fromkeys(FIELDS)
    if context.get('source') != '3022' or not context.get('reference_station_code'):
        return empty
    reference = context.get('reference_event_time')
    defect = context.get('defect_time_utc') or context.get('defect_time')
    if not reference or not defect:
        return empty
    try:
        def aware(value):
            dt = datetime.fromisoformat(str(value).strip().replace('Z', '+00:00'))
            return dt if dt.tzinfo else dt.replace(tzinfo=ZONE)
        if aware(reference) > aware(defect):
            return empty
    except (TypeError, ValueError):
        return empty
    return classify(reference)

def enrich_sn(result, *, grid_offset=0):
    """Classify each actual passage; failure-level association uses the correlator."""
    for event in (result.get('trace_3022') or {}).get('process_passages') or []:
        event.update(classify_passage(event.get('event_time_utc') or event.get('event_time'), naive_offset=grid_offset))
    return result

def _aware_defect(value):
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(str(value).strip().replace('Z', '+00:00'))
        return dt if dt.tzinfo else dt.replace(tzinfo=ZONE)
    except (ValueError, TypeError):
        return None


def _occurrence_time(row, pcba, code, records):
    """Return a *unique* timestamp verified by exact board and defect code.

    Historical 2114 grids often omit Defect Time. Only a distinct 3028/3012
    occurrence can fill that gap; repair time and 3022 event time are never
    substituted for the failure registration time.
    """
    existing = row.get('Defect Time') or row.get('defect_time')
    if _aware_defect(existing):
        return existing, '2114'
    seen = {}
    for source, candidates in records:
        for item in candidates or []:
            if str(item.get('pcba_sn') or item.get('PCBA') or '').strip() != pcba:
                continue
            if str(item.get('defect_code') or item.get('Defect Code') or '').strip() != code:
                continue
            stamp = item.get('defect_time') or item.get('Defect Time')
            dt = _aware_defect(stamp)
            if dt is not None:
                key = dt.astimezone(timezone.utc).isoformat()
                entry = seen.setdefault(key, {'value': stamp, 'sources': set()})
                entry['sources'].add(source)
    if len(seen) != 1:
        return None, 'ambiguous' if len(seen) > 1 else 'not_available'
    only = next(iter(seen.values()))
    return only['value'], '+'.join(sorted(only['sources']))


def _registered_mode(row):
    for key in ('Manual/Automatic', 'TestTools Auto Defect Or Defect By Hand',
                'manual_or_auto', 'TestTools Auto Defect Or Defect By Hand'):
        value = row.get(key)
        if str(value or '').strip():
            return value
    return None


def correlate_sn(result, engine_dir, *, grid_offset=0):
    """Correlate each 2114 occurrence with 3022 only when its Defect Time
    is explicitly recorded or reconstructable from unique 3028/3012 evidence.
    """
    import importlib
    correlate = importlib.import_module('ames.tela_3022').correlacionar_falha_3022
    processes = {p.get('pcba_sn'):p.get('result') or {} for p in (result.get('trace_3022') or {}).get('pcbas') or [] if p.get('status')=='COMPLETE'}
    local = result.setdefault('local_snapshot', {})
    sources = [('3028', local.get('defects_3028') or []),
               ('3012', (result.get('trace_3012') or {}).get('rows') or [])]
    contexts = []
    trace2114 = result.get('trace_2114') or {}
    lookup = {}
    for history in trace2114.get('pcbas') or []:
        sn = str(history.get('pcba_sn') or '').strip()
        if sn not in processes:
            continue
        model = (history.get('result') or {}).get('model') or result.get('product_model') or ''
        histories = (history.get('result') or {}).get('rows') or []
        # Without Defect Time, two 2114 records with the same code cannot
        # be assigned a unique 3012/3028 occurrence by code alone.
        missing_counts = {}
        for hr in histories:
            if not _aware_defect(hr.get('Defect Time') or hr.get('defect_time')):
                hc = str(hr.get('Defect Code') or '').strip()
                missing_counts[hc] = missing_counts.get(hc,0)+1
        for row in histories:
            code = str(row.get('Defect Code') or '').strip()
            stamp, source = _occurrence_time(row, sn, code, sources)
            if missing_counts.get(code,0)>1 and source!='2114':
                stamp = None
            if not stamp:
                continue
            mode = _registered_mode(row)
            rec = {'line':result.get('line'), 'product_model':model,
                   'pcba_sn':sn,'defect_code':code,
                   'defect_desc':row.get('Defect Description'),
                   'defect_time':stamp,'manual_or_auto':mode,
                   'defect_time_source':source}
            correlated = correlate(engine_dir, processes[sn].get('rows') or [], rec,
                                   registration_value=mode,
                                   registration_source='2114',
                                   defect_local_offset_hours=-3,
                                   event_naive_offset_hours=grid_offset)
            from process_r11 import _context_from_correlation
            ctx = {**_context_from_correlation(rec, correlated),
                   'defect_time_source':source,'root_cause':False}
            contexts.append(ctx)
            lookup[(sn,code)] = (stamp,source)
    # Enrich the DISPLAY copies only. Raw 2114 results are retained in their
    # source grid and the provenance label prevents a 3012 date appearing to
    # come from the 2114 view itself.
    for collection in ('current_failure','previous_failures'):
        value = trace2114.get(collection)
        rows = [value] if isinstance(value,dict) else value if isinstance(value,list) else []
        for row in rows:
            key = (str(row.get('pcba_sn') or result.get('sn') or '').strip(),
                   str(row.get('Defect Code') or row.get('defect_code') or '').strip())
            if key in lookup and not _aware_defect(row.get('Defect Time') or row.get('defect_time')):
                stamp, source = lookup[key]
                row['Defect Time'] = stamp
                row['defect_time'] = stamp
                row['Defect Time Source'] = source
    existing = local.get('process_contexts') or []
    by_identity = {}
    for item in [*contexts,*existing]:
        key = (item.get('pcba_sn'),item.get('defect_code'),
               str(item.get('defect_time')),item.get('reference_event_time'))
        by_identity.setdefault(key,item)
    local['process_contexts'] = list(by_identity.values())
    return result
