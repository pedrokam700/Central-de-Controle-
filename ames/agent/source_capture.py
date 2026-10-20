"""SQLite-only source capture of completed/partial 3074, 2114 and 3022 jobs.

An immutable selected canonical revision owns the operational day and workstation
identity. The raw result is never an automatic Firebase transport dataset.
"""
import hashlib
import re
import base64
import binascii
import json

import canonical
from store import stable_json, utc_now

VIEWS=('3074','2114','3022')
SCHEMA='ames-local-source-capture-v1'


def capture_source(store, *, target, line, job_id, view, result, status='partial'):
    if view not in VIEWS or line not in canonical.LINES:
        raise ValueError('Unsupported capture source/line')
    if not isinstance(job_id,str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,128}',job_id):
        raise ValueError('Invalid capture job identity')
    if not isinstance(target,dict) or target.get('source_id')!=canonical.source_id(store):
        raise ValueError('Capture workstation source mismatch')
    try:
        sid=int(target['snapshot_id'])
        revision=int(target['snapshot_revision'])
    except (ValueError,TypeError,KeyError):
        raise ValueError('Missing capture snapshot identity')
    if sid<1 or revision<1 or type(target.get('snapshot_revision')) is not int:
        raise ValueError('Invalid capture revision')
    frozen=canonical.read_revision(store,sid,line,revision)
    if (frozen['source_id']!=target['source_id'] or
        frozen['content_hash']!=target.get('content_hash') or
        frozen['summary']['period']!=target.get('period')):
        raise ValueError('Capture period or revision identity changed')
    if status not in ('done','partial','error'):
        raise ValueError('Invalid capture source status')
    # No failure result is encoded as "no failures": absence can mean not queried.
    if result is None:
        raise ValueError('Missing source capture result')
    kind='source_capture_'+view+'_'+job_id
    envelope={
        'schema':SCHEMA,
        'source_id':frozen['source_id'],
        'line_id':line,'snapshot_id':str(sid),
        'parent_snapshot_revision':revision,
        'parent_content_hash':frozen['content_hash'],
        'period':frozen['summary']['period'],
        'job_id':job_id,'source_view':view,
        'source_status':status,
        'source_complete':False,
        'captured_at':utc_now(),'result':result,
    }
    # B3.1 journals every update; another job cannot overwrite this job's data.
    store.save_snapshot_payload(sid,kind,envelope)
    return {'kind':kind,'snapshot_id':sid,'line_id':line,
            'source_view':view,'job_id':job_id,'status':status,
            'result_sha256':hashlib.sha256(stable_json(result).encode('utf-8')).hexdigest()}


def capture_index(store,snapshot_id,line):
    """Local metadata only, never expose raw MES data in an index."""
    if line not in canonical.LINES:
        raise ValueError('Invalid capture line')
    with store.connect() as con:
        rows=con.execute("""SELECT p.kind,r.revision,r.payload_json,r.created_at
            FROM snapshot_payload_revisions r
            JOIN snapshot_payloads p ON p.snapshot_id=r.snapshot_id AND p.kind=r.kind
            WHERE r.snapshot_id=? AND r.kind LIKE 'source_capture_%'
            ORDER BY r.kind,r.revision""",(int(snapshot_id),)).fetchall()
    import json
    entries=[]
    for row in rows:
        x=json.loads(row['payload_json'])
        if x.get('schema')!=SCHEMA or x.get('line_id')!=line:
            continue
        entries.append({'source_view':x['source_view'],'snapshot_id':x['snapshot_id'],
          'line_id':line,'source_id':x['source_id'],
          'parent_snapshot_revision':x['parent_snapshot_revision'],
          'period':x['period'],'job_id':x['job_id'],'capture_revision':row['revision'],
          'source_status':x['source_status'],'source_complete':False,
          'captured_at':row['created_at'],'local_only':True})
    return entries


# B3.4b2: bounded durable sampling of real MES progress events. This is NOT a
# replay log and does not establish complete source/population coverage.
MAX_PARTIAL_ITEMS = 12
MAX_EVENT_BYTES = 12 * 1024
MAX_PARTIAL_WRITES = 4


class BoundedPartialJournal:
    """Save a few real partial checkpoints, never one SQLite write per event.

    Retain at most 12 unique entries per source/job, individually <=12 KiB.
    Each source produces <=4 SQLite revisions from progress, plus the final
    full result that the worker stores separately. This prevents unbounded
    write amplification during long factory queries.
    """

    def __init__(self, store, *, target, line, job_id):
        self.store=store
        self.target=target
        self.line=line
        self.job_id=job_id
        self.entries={view:[] for view in VIEWS}
        self.seen={view:set() for view in VIEWS}
        self.writes={view:0 for view in VIEWS}
        self.dropped={view:0 for view in VIEWS}

    def observe(self, event):
        if not isinstance(event, dict):
            return False
        view=str(event.get('stage') or '')
        if view not in VIEWS:
            return False
        kind=str(event.get('kind') or '')
        pcba=str(event.get('pcba') or event.get('sn') or (event.get('item') or {}).get('pcba_sn') or '')
        progress_only=False
        if view=='3074' and kind=='pcba_result' and event.get('item') is not None:
            item={'event_kind':kind,'pcba':pcba,'item':event['item']}
        elif view=='2114' and kind=='pcba' and event.get('status')=='COMPLETE':
            result=(event.get('state') or {}).get('result')
            if result is None:return False
            item={'event_kind':kind,'pcba':pcba,'status':'COMPLETE','result':result}
        elif view=='3022' and kind=='pcba':
            # The 3022 callback does not expose its raw passage rows. Never
            # present this small metadata as complete 3022 source evidence.
            progress_only=True
            item={'event_kind':kind,'pcba':pcba,'phase':str(event.get('phase') or ''),
                  'status':str(event.get('status') or ''),'current':event.get('current'),
                  'total':event.get('total'),'rows_reported':event.get('rows')}
        else:
            return False
        raw=stable_json(item).encode('utf-8')
        if len(raw)>MAX_EVENT_BYTES:
            self.dropped[view]+=1
            return False
        key=(pcba,kind,str(item.get('phase') or ''))
        if key in self.seen[view]:
            return False
        if len(self.entries[view])>=MAX_PARTIAL_ITEMS:
            self.dropped[view]+=1
            return False
        self.seen[view].add(key)
        self.entries[view].append(item)
        count=len(self.entries[view])
        if self.writes[view]>=MAX_PARTIAL_WRITES:
            return True
        # First evidence is durable immediately. Later checkpoints are sparse.
        if count!=1 and count%4!=1 and count!=MAX_PARTIAL_ITEMS:
            return True
        self.writes[view]+=1
        capture_source(self.store,target=self.target,line=self.line,job_id=self.job_id,
            view=view,status='partial',
            result={'checkpoint_kind':'bounded_partial_progress','items':list(self.entries[view]),
                'progress_only':progress_only if view=='3022' else False,
                'source_complete':False,'population_complete':False,
                'sample_limited_to':MAX_PARTIAL_ITEMS,'sample_count':count,
                'dropped_before_checkpoint':self.dropped[view]})
        return True


def capture_manifest(store, *, snapshot_id, line, snapshot_revision, content_hash,
                     source_view=None, before=None, limit=20):
    """Authorized, paged METADATA only. No raw blob leaves SQLite.

    The requested parent MUST be an immutable canonical revision. A capture
    from a different production day, line, workstation or revision cannot
    be silently selected, even if its job ID or PCBA is the same.
    """
    if line not in canonical.LINES:
        raise ValueError('Invalid capture line')
    try:
        sid=int(snapshot_id)
        rev=int(snapshot_revision)
        n=int(limit)
    except (TypeError,ValueError,OverflowError) as exc:
        raise ValueError('Invalid capture identity/limit') from exc
    if (str(snapshot_id)!=str(sid) or str(snapshot_revision)!=str(rev)
            or sid<1 or rev<1 or n<1 or n>50):
        raise ValueError('Invalid capture identity/limit')
    if not isinstance(content_hash,str) or not re.fullmatch(r'[0-9a-f]{64}',content_hash):
        raise ValueError('Invalid canonical capture hash')
    if source_view not in (None,*VIEWS):
        raise ValueError('Invalid source capture view')
    parent=canonical.read_revision(store,sid,line,rev)
    period=parent['summary']['period']
    if parent['content_hash']!=content_hash or parent['source_id']!=canonical.source_id(store):
        raise ValueError('Source or canonical revision mismatch')
    scope=hashlib.sha256(stable_json([sid,line,rev,content_hash,source_view]).encode()).hexdigest()
    cursor=None
    if before:
        if not isinstance(before,str) or len(before)>512:
            raise ValueError('Invalid capture cursor')
        try:
            data=json.loads(base64.urlsafe_b64decode(before+'='*((-len(before))%4)).decode())
            if (not isinstance(data,list) or len(data)!=4 or data[3]!=scope
                or not isinstance(data[0],str) or not isinstance(data[1],str)
                or not isinstance(data[2],int) or data[2]<1
                or len(data[0])>64 or len(data[1])>180):
                raise ValueError('Invalid capture cursor')
            cursor=data
        except (UnicodeDecodeError,ValueError,TypeError,binascii.Error,OverflowError) as exc:
            raise ValueError('Invalid capture cursor') from exc
    elif before is not None and before!='':
        raise ValueError('Invalid capture cursor')
    # Only project individual scalar JSON values. Never select payload_json
    # itself, raw result, repair comments, SN, material serial or tokens.
    fields={
        'source_view':'$.source_view',
        'source_status':'$.source_status',
        'job_id':'$.job_id',
        'capture_parent_revision':'$.parent_snapshot_revision',
        'source_id':'$.source_id',
        'sample_count':'$.result.sample_count',
        'checkpoint_kind':'$.result.checkpoint_kind',
        'progress_only':'$.result.progress_only',
    }
    sql_columns=','.join(f"json_extract(r.payload_json,'{selector}') AS {key}" for key,selector in fields.items())
    where=["r.snapshot_id=?",
           "substr(r.kind,1,15)='source_capture_'",
           "json_extract(r.payload_json,'$.schema')=?",
           "json_extract(r.payload_json,'$.line_id')=?",
           "json_extract(r.payload_json,'$.source_id')=?",
           "json_extract(r.payload_json,'$.parent_snapshot_revision')=?",
           "json_extract(r.payload_json,'$.parent_content_hash')=?",
           "json_extract(r.payload_json,'$.period.start_at') IS ?",
           "json_extract(r.payload_json,'$.period.end_at') IS ?",
           "json_extract(r.payload_json,'$.period.mode') IS ?"]
    params=[sid,SCHEMA,line,parent['source_id'],rev,content_hash,
            period.get('start_at'),period.get('end_at'),period.get('mode')]
    if source_view:
        where.append("json_extract(r.payload_json,'$.source_view')=?")
        params.append(source_view)
    if cursor:
        where.append("(r.created_at<? OR (r.created_at=? AND r.kind<?)"
                     " OR (r.created_at=? AND r.kind=? AND r.revision<?))")
        params.extend([cursor[0],cursor[0],cursor[1],cursor[0],cursor[1],cursor[2]])
    sql=(f"SELECT r.created_at AS stored_at,r.kind AS stored_kind,r.revision AS capture_revision,{sql_columns} "
         "FROM snapshot_payload_revisions r WHERE "+' AND '.join(where)+
         " ORDER BY r.created_at DESC,r.kind DESC,r.revision DESC LIMIT ?")
    with store.connect() as con:
        rows=[dict(row) for row in con.execute(sql,(*params,n+1))]
    more=len(rows)>n
    rows=rows[:n]
    items=[]
    for row in rows:
        # Never trust a local raw envelope enough to claim complete MES
        # collection. 3022 progress has no passage rows in the callback.
        if row['source_view'] not in VIEWS:
            continue
        items.append({
            'snapshot_id':str(sid),'line_id':line,'snapshot_revision':rev,
            'source_view':row['source_view'],'source_status':row['source_status']
                if row['source_status'] in ('partial','done','error') else 'partial',
            'capture_revision':row['capture_revision'],'job_id':row['job_id'],
            'stored_at':row['stored_at'],'source_id':row['source_id'],
            'progress_only':bool(row['progress_only']),
            'checkpoint_kind':row['checkpoint_kind'] if row['checkpoint_kind']=='bounded_partial_progress' else None,
            'sample_count':row['sample_count'] if type(row['sample_count']) is int and row['sample_count']>0 else None,
            'source_complete':False,'population_complete':False,'local_only':True,
            'period_start':period.get('start_at'),'period_end':period.get('end_at'),
            'period_mode':period.get('mode'),
        })
    next_cursor=None
    if more and rows:
        last=rows[-1]
        packed=stable_json([last['stored_at'],last['stored_kind'],last['capture_revision'],scope])
        next_cursor=base64.urlsafe_b64encode(packed.encode()).decode().rstrip('=')
    return {'schema':SCHEMA,'source_id':parent['source_id'],'line_id':line,
            'snapshot_id':str(sid),'snapshot_revision':rev,'content_hash':content_hash,
            'period':period,'items':items,'next_cursor':next_cursor,
            'local_only':True,'metadata_only':True,'source_complete':False}
