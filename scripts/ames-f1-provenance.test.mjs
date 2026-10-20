import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {groupedFailureName} from '../ames/failure-group-evidence.mjs';

const root=new URL('..',import.meta.url);
const live=fs.readFileSync(new URL('../ames/agent/ames_3028_live.py',import.meta.url),'utf8');
const excel=fs.readFileSync(new URL('../ames/agent/ames_3028.py',import.meta.url),'utf8');
const store=fs.readFileSync(new URL('../ames/agent/store.py',import.meta.url),'utf8');
const canonical=fs.readFileSync(new URL('../ames/agent/canonical.py',import.meta.url),'utf8');

test('F1_9999 is not a hard-coded or synthetic production code',()=>{
  for(const source of [live,excel,store,canonical])assert.equal(source.includes('F1_9999'),false);
  assert.match(live,/"defect_code": _clean\(row\.get\("defectCode"\)\)/);
  assert.match(excel,/"defect_code": \["Defect Code"\]/);
  assert.match(store,/rec\.get\("defect_code"\)/);
  assert.match(canonical,/FIELDS = \([^\n]*'defect_code'/);
});

test('raw 3028 defect code survives transform, SQLite and canonical projection unchanged',()=>{
  const py=String.raw`
import json, pathlib, sys, tempfile
agent=pathlib.Path(sys.argv[1])/'ames'/'agent'
sys.path.insert(0,str(agent))
from ames_3028_live import _detail_to_record
from store import Store
import canonical
raw={'lineId':'TAN10101','lotId':'002527TEST','defectCode':'F1_9999','defectDesc':'Standard Error','defectTime':'2026-10-16T01:49:14.000Z','prodModel':'CPH2817'}
rec=_detail_to_record(raw,'TAN10101')
with tempfile.TemporaryDirectory() as tmp:
    db=Store(pathlib.Path(tmp)/'ames.sqlite3');db.initialize()
    wid=db.ensure_window('manual','2026-10-16T00:00:00','2026-10-17T00:00:00',None,['TAN10101'])
    sid=db.create_snapshot(window_id=wid,source_kind='3028_live_extjs',source_name='test')
    db.ingest_defects(sid,[rec],reconcile_window=False)
    with db.connect() as con:
        stored=con.execute('SELECT defect_code,raw_json FROM defect_observations WHERE snapshot_id=?',(sid,)).fetchone()
    projected=canonical.export_revision(db,sid,'TAN10101')
    print(json.dumps({'transformed':rec['defect_code'],'stored':stored['defect_code'],'raw':json.loads(stored['raw_json'])['defect_code'],'projected':projected['datasets']['defects'][0]['defect_code']}))
`;
  const result=JSON.parse(execFileSync('python3',['-c',py,new URL('..',import.meta.url).pathname],{encoding:'utf8'}).trim());
  assert.deepEqual(result,{transformed:'F1_9999',stored:'F1_9999',raw:'F1_9999',projected:'F1_9999'});
});

test('grouped Failures keeps the raw code visible when no human description exists',()=>{
  assert.equal(groupedFailureName({defect_code:'F1_9999',defect_desc:''}),'F1_9999');
});
