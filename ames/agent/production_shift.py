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
        day = local.date() - (timedelta(days=1) if minute < 450 else timedelta())
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

def correlate_sn(result, engine_dir, *, grid_offset=0):
    import importlib
    correlate = importlib.import_module('ames.tela_3022').correlacionar_falha_3022
    processes = {p.get('pcba_sn'):p.get('result') or {} for p in (result.get('trace_3022') or {}).get('pcbas') or [] if p.get('status')=='COMPLETE'}
    contexts=[]
    for history in (result.get('trace_2114') or {}).get('pcbas') or []:
        sn=history.get('pcba_sn')
        if sn not in processes:continue
        for row in (history.get('result') or {}).get('rows') or []:
            rec={'line':result.get('line'),'pcba_sn':sn,'defect_code':row.get('Defect Code'),'defect_desc':row.get('Defect Description'),'defect_time':row.get('Defect Time'),'manual_or_auto':row.get('Manual/Automatic')}
            correlated=correlate(engine_dir,processes[sn].get('rows') or [],rec,registration_value=rec['manual_or_auto'],registration_source='2114',defect_local_offset_hours=-3,event_naive_offset_hours=grid_offset)
            # Same projection as batch collection; preserve return and reference evidence.
            from process_r11 import _context_from_correlation
            contexts.append({**_context_from_correlation(rec,correlated),'root_cause':False})
    result.setdefault('local_snapshot',{})['process_contexts']=contexts
    return result
