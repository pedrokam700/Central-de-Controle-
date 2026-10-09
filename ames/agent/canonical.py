"""Versioned, sanitized views of SQLite. No MES/network access and no new store.

IDs identify durable local observations, NOT a fabricated global MES occurrence.
Old rows keep their limitations. A revision is immutable once exported.
"""
import base64
import hashlib
import json
import uuid
from datetime import datetime, timezone

SCHEMA = 'central-ames-v2'
LINES = ('TAN10101', 'TAN10102', 'TAN10103')
DATASETS = ('defects','pcba_history','material_reuse','history_contexts','process_timeline')
TABLES = ('defect_observations','line_metrics','pcba_history','material_reuse','history_contexts','snapshot_payloads','mes_process_timeline')
FIELDS = ('line','pcba_sn','current_pcba_sn','historical_pcba','current_pcba','product_model','defect_key','hist_seq','defect_code','defect_desc','defect_time','defect_oper','defect_location','defect_material_id','repair_status','repair_status_current','repair_state_current','defect_type','defect_type_current','defect_type_class','manual_or_auto','item_sn','item_type','material_sn','material_type','usage_status','previous_pcba_count','total_pcba_count_known_now','previous_pcbas_json','active_now_pcbas_json','inactive_now_pcbas_json','bind_time_utc','unbind_time_utc','context_kind','context_key','current_defect_key')
def encoded(value):
    return json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':'),default=str)
def digest(value):return hashlib.sha256(encoded(value).encode()).hexdigest()
def cph(value):
    import re
    value=''.join(str(value or '').upper().split())
    return 'CPH'+value if re.fullmatch(r'\d{4}[A-Z0-9]*',value) else value
def initialize(store):
    with store.connect() as con:
        con.executescript('''
        CREATE TABLE IF NOT EXISTS mes_source_clock(snapshot_id INTEGER PRIMARY KEY, epoch INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS mes_revisions(snapshot_id INTEGER NOT NULL,line TEXT NOT NULL,revision INTEGER NOT NULL,epoch INTEGER NOT NULL,content_hash TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(snapshot_id,line,revision));
        CREATE TABLE IF NOT EXISTS mes_requests(request_id TEXT PRIMARY KEY,kind TEXT NOT NULL,config_hash TEXT NOT NULL,job_id TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS mes_process_timeline(event_id TEXT PRIMARY KEY,snapshot_id INTEGER NOT NULL,line_id TEXT NOT NULL,product TEXT NOT NULL,pcba_sn TEXT NOT NULL,process TEXT,station TEXT,event_time TEXT NOT NULL,source_view TEXT NOT NULL CHECK(source_view='3022'),provenance_json TEXT NOT NULL,raw_ref TEXT NOT NULL,valid INTEGER NOT NULL DEFAULT 0);
        ''')
        con.execute("INSERT OR IGNORE INTO schema_meta(key,value) VALUES('ames_source_id',?)",(str(uuid.uuid4()),))
        con.execute('''CREATE TRIGGER IF NOT EXISTS mes_clock_snapshot_update AFTER UPDATE ON snapshots BEGIN
            INSERT INTO mes_source_clock(snapshot_id,epoch) VALUES(NEW.id,1)
            ON CONFLICT(snapshot_id) DO UPDATE SET epoch=epoch+1; END''')
        for table in TABLES:
            for op in ('INSERT','UPDATE','DELETE'):
                ref='OLD' if op=='DELETE' else 'NEW'
                con.execute(f'''CREATE TRIGGER IF NOT EXISTS mes_clock_{table}_{op} AFTER {op} ON {table} BEGIN
                INSERT INTO mes_source_clock(snapshot_id,epoch) VALUES({ref}.snapshot_id,1)
                ON CONFLICT(snapshot_id) DO UPDATE SET epoch=epoch+1; END''')

def source_id(store):
    with store.connect() as con:return con.execute("SELECT value FROM schema_meta WHERE key='ames_source_id'").fetchone()[0]

def contextual_rows(con,sid,dataset):
    """All provenance candidates; never attribute historical line using LIMIT 1."""
    table={'defects':'defect_observations','process_timeline':'mes_process_timeline'}.get(dataset,dataset)
    rows=[dict(r) for r in con.execute(f'SELECT * FROM {table} WHERE snapshot_id=? ORDER BY '+('event_id' if dataset=='process_timeline' else 'id'),(sid,))]
    if dataset in ('defects','history_contexts','process_timeline'):
        for row in rows:
            line=row.get('line_id') or row.get('line')
            row['_contexts']=[{'line_id':line,'product':cph(row.get('product_model') or row.get('product')),'pcba_sn':row.get('pcba_sn') or row.get('current_pcba'),'kind':'source_row'}] if line in LINES else []
        return rows
    defects=[dict(r) for r in con.execute('SELECT * FROM defect_observations WHERE snapshot_id=?',(sid,))]
    contexts=[dict(r) for r in con.execute('SELECT * FROM history_contexts WHERE snapshot_id=?',(sid,))]
    by_sn={};by_history={}
    for d in defects:by_sn.setdefault(d['pcba_sn'],[]).append(d)
    for ctx in contexts:by_history.setdefault(ctx.get('historical_pcba'),[]).append(ctx)
    for row in rows:
        sn=row.get('current_pcba_sn') if dataset=='material_reuse' else row.get('pcba_sn')
        matches=[d for d in by_sn.get(sn,[]) if dataset!='material_reuse' or not row.get('current_defect_key') or d['defect_key']==row['current_defect_key']]
        refs=[{'line_id':d['line'],'product':cph(d.get('product_model')),'pcba_sn':d['pcba_sn'],'kind':'current_observation','defect_key':d['defect_key']} for d in matches if d['line'] in LINES]
        if dataset=='pcba_history':
            for ctx in by_history.get(sn,[]):
                if ctx.get('historical_pcba')==sn and ctx.get('line') in LINES:
                    current=[d for d in by_sn.get(ctx.get('current_pcba'),[]) if d['line']==ctx['line']]
                    refs.extend({'line_id':ctx['line'],'product':cph(d.get('product_model')),'pcba_sn':ctx.get('current_pcba'),'material_sn':ctx.get('material_sn'),'kind':'historical_context','context_key':ctx['context_key']} for d in (current or [{}]))
        row['_contexts']=list({encoded(x):x for x in refs}.values())
    return rows

def legacy_context_rows(store,dataset,sid,line=None,limit=5000):
    with store.connect() as con:
        rows=contextual_rows(con,sid,dataset)
    out=[]
    for row in rows:
        refs=row.pop('_contexts'); candidates=sorted({r['line_id'] for r in refs})
        if line and line not in candidates:continue
        # Explicit filter identifies context, never the production line of history.
        row.update(line=line or (candidates[0] if len(candidates)==1 else None),line_candidates=candidates,line_ambiguous=len(candidates)>1,provenance_contexts=refs)
        out.append(row)
    return out[:max(1,min(int(limit),100000))]

def export_revision(store,sid,line,insight_builder=None):
    if line not in LINES:raise ValueError('Explicit supported line required')
    sid=int(sid)
    with store.connect() as con:
        # A consistent local database read. This is not the MES scheduler lock.
        con.execute('BEGIN IMMEDIATE')
        snap=con.execute('SELECT * FROM snapshots WHERE id=?',(sid,)).fetchone()
        if not snap:raise ValueError('Snapshot not found')
        epochrow=con.execute('SELECT epoch FROM mes_source_clock WHERE snapshot_id=?',(sid,)).fetchone();epoch=epochrow[0] if epochrow else 0
        previous=con.execute('SELECT * FROM mes_revisions WHERE snapshot_id=? AND line=? ORDER BY revision DESC LIMIT 1',(sid,line)).fetchone()
        if previous and previous['epoch']==epoch:return json.loads(previous['payload'])
        source=con.execute("SELECT value FROM schema_meta WHERE key='ames_source_id'").fetchone()[0]
        sets={};coverage={}
        for dataset in DATASETS:
            rows=[];ambiguous=0;unassigned=0
            for raw in contextual_rows(con,sid,dataset):
                refs=raw.pop('_contexts'); candidates=sorted({r['line_id'] for r in refs})
                if not candidates:unassigned+=1
                if line not in candidates:continue
                selected=[r for r in refs if r['line_id']==line]
                row={k:raw[k] for k in FIELDS if k in raw and raw[k] is not None}
                key=raw.get('defect_key') if dataset=='defects' else raw.get('context_key') if dataset=='history_contexts' else raw.get('id') or raw.get('event_id')
                if dataset=='pcba_history' and all(raw.get(k) is not None for k in ('pcba_sn','hist_seq','defect_code','defect_desc')):key=[raw[k] for k in ('pcba_sn','hist_seq','defect_code','defect_desc')]
                if dataset=='material_reuse' and raw.get('current_defect_key') is not None:key=[raw.get(k) for k in ('current_pcba_sn','current_defect_key','item_sn')]
                if dataset=='history_contexts':key=[key,raw.get('context_kind')]
                ident=str(uuid.uuid5(uuid.UUID(source),encoded([sid,dataset,key])))
                products=sorted({r['product'] for r in selected if r.get('product')})
                view={'defects':'3028','pcba_history':'2114','material_reuse':'3074','history_contexts':'2114','process_timeline':'3022'}[dataset]
                row.update(record_id=ident,line=line,line_id=line,snapshot_id=str(sid),product=products[0] if len(products)==1 else None,product_candidates=products,source_view=view,source_timestamp=raw.get('defect_time') or raw.get('event_time'),collected_at=snap['collected_at'],raw_ref=f'sqlite:{source}:{dataset}:{sid}:{key}',provenance={'identity_scope':'agent_snapshot_observation','source_id':source,'line_candidates':candidates,'line_ambiguous':len(candidates)>1,'contexts':selected})
                if dataset=='defects':row['occurrence_id']=ident
                if dataset=='material_reuse':
                    row['material_sn']=raw.get('item_sn');row['bind_id']=str(uuid.uuid5(uuid.UUID(ident),'bind:'+str(raw.get('bind_time_utc')))) if raw.get('bind_time_utc') else None
                    row['unbind_id']=str(uuid.uuid5(uuid.UUID(ident),'unbind:'+str(raw.get('unbind_time_utc')))) if raw.get('unbind_time_utc') else None
                if dataset=='process_timeline':
                    row.update({k:raw.get(k) for k in ('event_id','product','pcba_sn','process','station','event_time','raw_ref')});row['valid']=bool(raw['valid'])
                    row['provenance']['adapter']=json.loads(raw['provenance_json'])
                    row['coverage']={'status':'partial','source_complete':False}
                ambiguous+=int(len(candidates)>1);rows.append(row)
            sets[dataset]=rows
            coverage[dataset]={'status':'not_collected' if dataset=='process_timeline' and not rows else 'partial','stored_total':len(rows),'unassigned_rows':unassigned,'ambiguous_context_rows':ambiguous,'transport_complete':True,'source_complete':False,'scope':'stored_snapshot_line_context','reason':'Legacy source has no durable MES ID or completeness proof'}
        metrics=[dict(r) for r in con.execute('SELECT * FROM line_metrics WHERE snapshot_id=? AND line=?',(sid,line))]
        m=metrics[0] if len(metrics)==1 else {}
        insights=None
        if insight_builder:
            try:insights=insight_builder(line=line,snapshot_id=sid)
            except Exception:pass
        payload={'schema':SCHEMA,'schema_version':2,'source_id':source,'snapshot_id':str(sid),'line_id':line,'collected_at':snap['collected_at'],'source_view':'3028','source_timestamp':None,'summary':{'line':line,'snapshot_id':str(sid),'collected_at':snap['collected_at'],'fpy':m.get('fpy'),'check_fpy':m.get('check_fpy'),'quantity':m.get('quantity'),'defect_rows':len(sets['defects'])},'datasets':sets,'coverage':coverage,'insights':insights,'capabilities':{'process_timeline':bool(sets['process_timeline'])}}
        fingerprint=digest(payload)
        if previous and previous['content_hash']==fingerprint:
            con.execute('UPDATE mes_revisions SET epoch=? WHERE snapshot_id=? AND line=? AND revision=?',(epoch,sid,line,previous['revision']));return json.loads(previous['payload'])
        revision=previous['revision']+1 if previous else 1
        payload.update(snapshot_revision=revision,content_hash=fingerprint)
        for rows in sets.values():
            for row in rows:row['snapshot_revision']=revision
        con.execute('INSERT INTO mes_revisions VALUES(?,?,?,?,?,?)',(sid,line,revision,epoch,fingerprint,encoded(payload)))
        return payload

def manifest(payload):
    return {**{k:v for k,v in payload.items() if k not in ('datasets','insights')},'datasets':{k:{'count':len(v),'coverage':payload['coverage'][k]} for k,v in payload['datasets'].items()}}

def page(store,sid,line,revision,dataset,cursor=None,limit=250):
    if line not in LINES or dataset not in (*DATASETS,'insights'):raise ValueError('Invalid dataset/line')
    with store.connect() as con:
        row=con.execute('SELECT payload FROM mes_revisions WHERE snapshot_id=? AND line=? AND revision=?',(int(sid),line,int(revision))).fetchone()
    if not row:raise ValueError('Revision unavailable; load manifest first')
    payload=json.loads(row[0]);identity=[str(sid),line,int(revision),dataset,payload['content_hash']];offset=0
    if cursor:
        data=json.loads(base64.urlsafe_b64decode(cursor.encode()))
        if data[:5]!=identity or not isinstance(data[5],int) or data[5]<0:raise ValueError('Cursor scope mismatch')
        offset=data[5]
    rows=([payload['insights']] if payload.get('insights') else []) if dataset=='insights' else payload['datasets'][dataset]
    limit=max(1,min(int(limit),500));end=min(offset+limit,len(rows));next_cursor=base64.urlsafe_b64encode(encoded(identity+[end]).encode()).decode() if end<len(rows) else None
    return {'schema':SCHEMA,'source_id':payload['source_id'],'snapshot_id':str(sid),'line_id':line,'snapshot_revision':int(revision),'dataset':dataset,'rows':rows[offset:end],'next_cursor':next_cursor,'total':len(rows),'complete':next_cursor is None}
