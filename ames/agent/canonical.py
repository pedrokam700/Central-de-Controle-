"""Versioned, sanitized views of SQLite. No MES/network access and no new store.

IDs identify durable local observations, NOT a fabricated global MES occurrence.
Old rows keep their limitations. A revision is immutable once exported.
"""
import base64
import hashlib
import json
import uuid
import production_shift
import repair_association
from datetime import datetime, timezone

SCHEMA = 'central-ames-v2'
PROJECTION_VERSION = 10  # add noncausal 3074 candidate projection without overwriting immutable revisions
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

        install_evidence_triggers(con)

def install_evidence_triggers(con):
    """Optional evidence tables join the existing revision clock, regardless of init order."""
    tables={r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    if 'mes_source_clock' not in tables:
        return
    for table in ('process_defect_contexts','repair_history_3012'):
        if table not in tables:
            continue
        for op in ('INSERT','UPDATE','DELETE'):
            ref='OLD' if op=='DELETE' else 'NEW'
            # 3012 is workstation-wide history; any exported snapshot can refer to it.
            action=(f"INSERT INTO mes_source_clock(snapshot_id,epoch) VALUES({ref}.snapshot_id,1) "
                    "ON CONFLICT(snapshot_id) DO UPDATE SET epoch=epoch+1;"
                    if table=='process_defect_contexts' else
                    "UPDATE mes_source_clock SET epoch=epoch+1;")
            con.execute(f"CREATE TRIGGER IF NOT EXISTS mes_clock_{table}_{op} AFTER {op} ON {table} BEGIN {action} END")

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

def _candidate_materials_from_trace(integrated, defects, max_rows=500):
    """Read-only projection: retain uncertain 3074 evidence, never reuse KPIs.

    Raw trace lives in snapshot_payloads. Material candidates are scoped by
    exact 3028 PCBA; an unknown defect key is explicitly NOT occurrence proof.
    """
    traced=(integrated or {}).get('trace_3074') or {}
    allowed={str(row.get('pcba_sn') or '') for row in defects if row.get('pcba_sn')}
    allowed_keys={str(row.get('defect_key') or '') for row in defects if row.get('defect_key')}
    out=[];seen=set()
    for item in traced.get('items') or []:
        pcba=str(item.get('pcba_sn') or '').strip()
        if pcba not in allowed:continue
        for occurrence in item.get('defect_traces') or []:
            defect_key=str(occurrence.get('defect_key') or '').strip()
            if defect_key and defect_key not in allowed_keys:continue
            scope=(occurrence.get('trace_3074') or {})
            candidate_rows=scope.get('candidate_material_history') or []
            if not candidate_rows:
                candidate_rows=list((scope.get('temporal_filter') or {}).get('time_unknown') or [])
                candidate_rows += (scope.get('temporal_filter') or {}).get('boundary_ambiguous') or []
            for material in candidate_rows:
                item_sn=str(material.get('item_sn') or '').strip()
                if not item_sn:continue
                key=(pcba,defect_key,item_sn)
                if key in seen:continue
                seen.add(key)
                out.append({
                    'pcba_sn':pcba,'defect_key':defect_key or None,
                    'item_sn':item_sn,'item_type':material.get('item_type'),
                    'status':material.get('status') or 'UNVERIFIED_TEMPORAL_LINK',
                    'temporal_reason':material.get('temporal_reason'),
                    'bind_time_utc':material.get('bind_time_utc'),
                    'unbind_time_utc':material.get('unbind_time_utc'),
                    'binding_operation':material.get('binding_operation'),
                    'iss_status_now':material.get('iss_status_now'),
                    'historical_pcbas':material.get('historical_pcbas') or [],
                    'proven_at_defect':False,'proven_reuse_at_defect':False,
                    'scope':'3028_EXACT_OCCURRENCE_CANDIDATE' if defect_key else 'PCBA_UNASSIGNED_CANDIDATE',
                    'source_view':'3074',
                })
                if len(out)>=max_rows:return out
    return out


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
        if previous and previous['epoch']==epoch and json.loads(previous['payload']).get('projection_version')==PROJECTION_VERSION:return json.loads(previous['payload'])
        source=con.execute("SELECT value FROM schema_meta WHERE key='ames_source_id'").fetchone()[0]
        tables={r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        process_contexts=[dict(r) for r in con.execute('SELECT * FROM process_defect_contexts WHERE snapshot_id=? AND line=?',(sid,line))] if 'process_defect_contexts' in tables else []
        # Raw/debug blobs remain in SQLite; transport only scalar evidence columns.
        process_contexts=[{k:v for k,v in r.items() if k not in ('raw_json','details_json') and (v is None or isinstance(v,(str,int,float,bool)))} for r in process_contexts]
        for context in process_contexts:
            context.update(production_shift.from_context(context))
        context_by_key={r['defect_key']:r for r in process_contexts}
        repair_rows=[dict(r) for r in con.execute('SELECT * FROM repair_history_3012')] if 'repair_history_3012' in tables else []
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
                if dataset=='defects':
                    row['occurrence_id']=ident
                    context=context_by_key.get(raw.get('defect_key'),{})
                    row.update({k:context.get(k) for k in production_shift.FIELDS})
                if dataset in ('defects','pcba_history','material_reuse'):
                    sn=raw.get('pcba_sn') or raw.get('current_pcba_sn')
                    row['repair_evidence_3012']=[{k:r.get(k) for k in ('row_key','pcba_sn','defect_code','defect_desc','defect_time','defect_user','repair_user','repair_time','repair_code','repair_desc','repair_comment','repaired_location','reason_desc','defect_reason_type','defect_reason_desc','product_id','product_model','line','sample_batch_id','defect_oper')} for r in repair_rows if r.get('pcba_sn')==sn]
                    # Separate candidates, never overwrite a 3028/2114 fact with 3012.
                    for repair in row['repair_evidence_3012']:
                        repair.update(repair_association.classify_3012_for_occurrence(raw,repair))
                if dataset=='material_reuse':
                    try:
                        material_raw=json.loads(raw.get('raw_json') or '{}')
                        item_row=material_raw.get('row') or material_raw
                        row['part_number']=next((item_row[k] for k in ('Part Number','Part No','Material ID','Material Id') if isinstance(item_row,dict) and item_row.get(k)),None)
                    except (ValueError,TypeError):pass
                    row['material_sn']=raw.get('item_sn');row['bind_id']=str(uuid.uuid5(uuid.UUID(ident),'bind:'+str(raw.get('bind_time_utc')))) if raw.get('bind_time_utc') else None
                    row['unbind_id']=str(uuid.uuid5(uuid.UUID(ident),'unbind:'+str(raw.get('unbind_time_utc')))) if raw.get('unbind_time_utc') else None
                if dataset=='process_timeline':
                    row.update({k:raw.get(k) for k in ('event_id','product','pcba_sn','process','station','event_time','raw_ref')});row['valid']=bool(raw['valid'])
                    row['provenance']['adapter']=json.loads(raw['provenance_json'])
                    row.update(production_shift.classify_passage(raw.get('event_time')))
                    row['coverage']={'status':'partial','source_complete':False}
                ambiguous+=int(len(candidates)>1);rows.append(row)
            sets[dataset]=rows
            coverage[dataset]={'status':'not_collected' if dataset=='process_timeline' and not rows else 'partial','stored_total':len(rows),'unassigned_rows':unassigned,'ambiguous_context_rows':ambiguous,'transport_complete':True,'source_complete':False,'scope':'stored_snapshot_line_context','reason':'Legacy source has no durable MES ID or completeness proof'}
        raw=con.execute("SELECT payload_json FROM snapshot_payloads WHERE snapshot_id=? AND kind='integrated_json'",(sid,)).fetchone()
        try:
            source_payload=json.loads(raw['payload_json']) if raw else {}
        except (ValueError,TypeError):
            source_payload={}
        material_candidates=_candidate_materials_from_trace(source_payload,sets['defects'])
        metrics=[dict(r) for r in con.execute('SELECT * FROM line_metrics WHERE snapshot_id=? AND line=?',(sid,line))]
        m=metrics[0] if len(metrics)==1 else {}

        # B3.4: per-source evidence coverage is intentionally NOT an MES source
        # completeness certification. Empty rows may mean not queried, partial
        # lookup or a true empty result; these cannot be distinguished yet.
        source_datasets={
            '3028':('defects',),
            '3074':('material_reuse',),
            '2114':('pcba_history','history_contexts'),
            '3022':('process_timeline',),
        }
        source_coverage={}
        for view,names in source_datasets.items():
            totals={name:len(sets[name]) for name in names}
            # A metrics-only 3028 snapshot is still observable evidence.
            total=sum(totals.values())+(1 if view=='3028' and m else 0)
            source_coverage[view]={
                'status':'observed_partial' if total else 'unknown',
                'stored_rows':sum(totals.values()),
                'dataset_rows':totals,
                'transport_complete':True,
                'source_complete':False,
                'population_complete':False,
                'proof':'stored_snapshot_line_rows' if total else 'no_source_execution_evidence',
                'scope':'snapshot_line_context',
            }
        # The 3012 repair table is workstation-wide. A PCBA match supplies
        # candidates only, never proof of a repair on this occurrence or line.
        # Count DISTINCT repair rows despite the same PCBA appearing in multiple
        # defects, histories and material components.
        candidate_keys=set()
        for row in sets['defects']:
            for evidence in row.get('repair_evidence_3012') or []:
                key=evidence.get('row_key')
                if key is not None and evidence.get('candidate_for_occurrence') is True:candidate_keys.add(str(key))
        source_coverage['3012']={
            'status':'candidate_partial' if candidate_keys else 'unknown',
            'stored_rows':len(candidate_keys),
            'dataset_rows':{'repair_candidates':len(candidate_keys)},
            'transport_complete':True,
            'source_complete':False,
            'population_complete':False,
            'association':'candidate_only_never_proven',
            'proof':'same_pcba_repair_rows' if candidate_keys else 'no_line_specific_repair_proof',
            'scope':'workstation_history_candidate_for_snapshot_line',
        }
        insights=None
        if insight_builder:
            try:
                insights=insight_builder(line=line,snapshot_id=sid)
            except Exception:
                # Do not silently classify missing evidence as zero reuse.
                # Never expose SNs, SQL, exception text or tokens in the API.
                insights={"schema":"ames-insights-v1","ready":False,
                          "reason":"LOCAL_INSIGHT_BUILD_FAILED",
                          "message":"Falha na classificação local de reuso; dados MES salvos preservados.",
                          "drilldowns":{},"population_complete":False}
        payload={'projection_version':PROJECTION_VERSION,'schema':SCHEMA,'schema_version':2,'source_id':source,'snapshot_id':str(sid),'line_id':line,'collected_at':snap['collected_at'],'source_view':'3028','source_timestamp':None,'summary':{'period':dict(con.execute('SELECT start_at,end_at,mode FROM analysis_windows WHERE id=?',(snap['window_id'],)).fetchone() or {}),'line':line,'snapshot_id':str(sid),'collected_at':snap['collected_at'],'fpy':m.get('fpy'),'check_fpy':m.get('check_fpy'),'quantity':m.get('quantity'),'defect_rows':len(sets['defects'])},'datasets':sets,'coverage':coverage,'source_coverage':source_coverage,'insights':insights,'process_contexts':process_contexts,'material_candidates':material_candidates,'capabilities':{'process_timeline':bool(sets['process_timeline'])}}
        fingerprint=digest(payload)
        if previous and previous['content_hash']==fingerprint:
            con.execute('UPDATE mes_revisions SET epoch=? WHERE snapshot_id=? AND line=? AND revision=?',(epoch,sid,line,previous['revision']));return json.loads(previous['payload'])
        revision=previous['revision']+1 if previous else 1
        payload.update(snapshot_revision=revision,content_hash=fingerprint)
        for rows in sets.values():
            for row in rows:row['snapshot_revision']=revision
        con.execute('INSERT INTO mes_revisions VALUES(?,?,?,?,?,?)',(sid,line,revision,epoch,fingerprint,encoded(payload)))
        return payload

def read_revision(store,sid,line,revision):
    """Read the requested immutable export; never substitute the latest version."""
    if line not in LINES or int(sid)<1 or int(revision)<1:
        raise ValueError('Invalid historical identity')
    with store.connect() as con:
        row=con.execute('SELECT payload FROM mes_revisions WHERE snapshot_id=? AND line=? AND revision=?',
                        (int(sid),line,int(revision))).fetchone()
    if not row:raise ValueError('Historical revision unavailable')
    return json.loads(row['payload'])

def history_index(store,line):
    """Index saved exports plus explicitly unversioned local updates. No MES I/O.

    Listing does not create revisions. A pending entry is materialized only when
    opened; every already exported revision remains independently addressable.
    """
    if line not in LINES:raise ValueError('Explicit supported line required')
    out=[];latest={}
    with store.connect() as con:
        con.execute('BEGIN')
        source=con.execute("SELECT value FROM schema_meta WHERE key='ames_source_id'").fetchone()[0]
        for r in con.execute('SELECT * FROM mes_revisions WHERE line=? ORDER BY snapshot_id DESC,revision DESC',(line,)):
            p=json.loads(r['payload']);period=p.get('summary',{}).get('period',{})
            latest.setdefault(r['snapshot_id'],(r['epoch'],p.get('projection_version')))
            products=sorted({d['product'] for d in p.get('datasets',{}).get('defects',[]) if d.get('product')})
            out.append({'snapshot_id':p['snapshot_id'],'line_id':line,'source_id':p['source_id'],
                        'snapshot_revision':p['snapshot_revision'],'content_hash':p['content_hash'],
                        'collected_at':p['collected_at'],'period_start':period.get('start_at'),
                        'period_end':period.get('end_at'),'period_mode':period.get('mode'),
                        'products':','.join(products),'revision_pending':False})
        rows=con.execute("""SELECT s.id,s.collected_at,w.start_at,w.end_at,w.mode,COALESCE(c.epoch,0) AS epoch
            FROM snapshots s LEFT JOIN analysis_windows w ON w.id=s.window_id
            LEFT JOIN mes_source_clock c ON c.snapshot_id=s.id WHERE s.status='complete' AND
            (EXISTS(SELECT 1 FROM line_metrics m WHERE m.snapshot_id=s.id AND m.line=?) OR
             EXISTS(SELECT 1 FROM defect_observations d WHERE d.snapshot_id=s.id AND d.line=?))
            ORDER BY s.id DESC""",(line,line)).fetchall()
        for r in rows:
            if latest.get(r['id'])==(r['epoch'],PROJECTION_VERSION):continue
            products=[x[0] for x in con.execute('SELECT DISTINCT product_model FROM defect_observations WHERE snapshot_id=? AND line=?',(r['id'],line)) if x[0]]
            out.append({'snapshot_id':str(r['id']),'line_id':line,'source_id':source,
                        'snapshot_revision':None,'revision_pending':True,'collected_at':r['collected_at'],
                        'period_start':r['start_at'],'period_end':r['end_at'],'period_mode':r['mode'],
                        'products':','.join(sorted(products))})
    return out

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
