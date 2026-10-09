"""3022 adapter boundary. Deliberately no collector or registration by default."""
from datetime import datetime
from typing import Protocol, Iterable
import json
from canonical import LINES, cph

class ProcessAdapter(Protocol):
    source_view: str
    def collect(self, *, line_id: str, product: str, pcba_sn: str) -> Iterable[dict]: ...

ADAPTER = None
def register(adapter: ProcessAdapter):
    if adapter.source_view != '3022':raise ValueError('Expected source_view 3022')
    global ADAPTER
    ADAPTER=adapter
def timestamp(value):
    parsed=datetime.fromisoformat(str(value).replace('Z','+00:00'))
    if parsed.tzinfo is None:raise ValueError('Timezone required')
    return parsed
def validate(event):
    required=('event_id','line_id','product','pcba_sn','process','station','event_time','source_view','snapshot_id','snapshot_revision','provenance','raw_ref','coverage')
    if any(k not in event for k in required):raise ValueError('Incomplete ProcessTimeline')
    if event['source_view']!='3022' or event['line_id'] not in LINES or not event['pcba_sn'] or cph(event['product'])!=event['product'] or not event['event_id'] or not event['raw_ref']:raise ValueError('Invalid process identity')
    if not event['product'] or not event['process'] or not event['station'] or not isinstance(event['provenance'],dict) or not isinstance(event['coverage'],dict) or int(event['snapshot_id'])<1 or not isinstance(event['snapshot_revision'],int) or event['snapshot_revision']<1:raise ValueError('Invalid process provenance')
    timestamp(event['event_time'])
    return event
def ingest(store,events):
    validated=[validate(e) for e in events]
    with store.connect() as con:
        for e in validated:
            previous=con.execute('SELECT snapshot_id,line_id,product,pcba_sn FROM mes_process_timeline WHERE event_id=?',(e['event_id'],)).fetchone()
            identity=(int(e['snapshot_id']),e['line_id'],e['product'],e['pcba_sn'])
            if previous and tuple(previous)!=identity:raise ValueError('Process event identity cannot change')
            con.execute('''INSERT INTO mes_process_timeline VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(event_id) DO UPDATE SET process=excluded.process,station=excluded.station,event_time=excluded.event_time,provenance_json=excluded.provenance_json,raw_ref=excluded.raw_ref,valid=excluded.valid''',
            (e['event_id'],int(e['snapshot_id']),e['line_id'],e['product'],e['pcba_sn'],e['process'],e['station'],e['event_time'],'3022',json.dumps(e['provenance']),e['raw_ref'],int(e.get('valid') is True)))
def collect(store,**scope):
    if ADAPTER is None:raise RuntimeError('3022 not collected: adapter unavailable')
    from mes_scheduler import MES
    with MES.critical():events=list(ADAPTER.collect(**scope))
    ingest(store,events)
    return events
def preceding(events,occurrence):
    eligible=[e for e in events if e.get('valid') is True and e.get('line_id')==occurrence['line_id'] and e.get('product')==cph(occurrence['product']) and e.get('pcba_sn')==occurrence['pcba_sn'] and timestamp(e['event_time'])<=timestamp(occurrence['defect_time'])]
    eligible.sort(key=lambda e:timestamp(e['event_time']),reverse=True)
    if len(eligible)>1 and timestamp(eligible[0]['event_time'])==timestamp(eligible[1]['event_time']):return None
    return eligible[0] if eligible else None
