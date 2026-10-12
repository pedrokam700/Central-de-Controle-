import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

const python=process.env.PYTHON_BIN||(process.platform==='win32'?'python':'python3');

test('hardening H1 protege migrations, snapshot lifecycle, canonical export e config atomica',()=>{
  const code=String.raw`
import json,pathlib,sys,tempfile,types
ROOT=pathlib.Path.cwd()
sys.path.insert(0,str(ROOT/'ames'/'agent'))
from store import Store
import canonical,hardening

with tempfile.TemporaryDirectory() as tmp:
    root=pathlib.Path(tmp)
    store=Store(root/'ames.sqlite3')
    store.initialize()

    first=hardening.apply_migrations(store)
    second=hardening.apply_migrations(store)
    assert first['schema_version']==1
    assert second['schema_version']==1
    assert second['applied']==[]
    with store.connect() as con:
        assert con.execute('SELECT COUNT(*) FROM schema_migrations WHERE migration_id=?',(hardening.MIGRATION_ID,)).fetchone()[0]==1
        cols={r[1] for r in con.execute('PRAGMA table_info(snapshots)').fetchall()}
        assert {'completed_at','error'} <= cols

    hardening.install_store_guards(store)
    sid=store.create_snapshot(window_id=None,source_kind='test')
    assert store.snapshot_status(sid)['status']=='collecting'
    assert store.latest_snapshot_id() is None
    try:
        store.finalize_snapshot(sid)
        raise AssertionError('empty snapshot was accepted')
    except RuntimeError:
        pass
    store.ingest_line_metrics(sid,[{'line':'TAN10101','product_model':'CPH2859','quantity':10,'fpy':98.0,'check_fpy':97.5}])
    store.finalize_snapshot(sid)
    assert store.snapshot_status(sid)['status']=='complete'
    assert store.latest_snapshot_id()==sid
    assert store.latest_snapshot_id_for_line('TAN10101')==sid

    failed=store.create_snapshot(window_id=None,source_kind='failed')
    store.ingest_line_metrics(failed,[{'line':'TAN10101','product_model':'CPH2859','quantity':11,'fpy':97.0}])
    store.fail_snapshot(failed,'simulated failure')
    assert store.snapshot_status(failed)['status']=='error'
    assert store.latest_snapshot_id()==sid
    assert store.latest_snapshot_id_for_line('TAN10101')==sid

    hardening._guard_canonical_export(canonical,store)
    collecting=store.create_snapshot(window_id=None,source_kind='collecting')
    store.ingest_line_metrics(collecting,[{'line':'TAN10101','product_model':'CPH2859','quantity':12,'fpy':96.0}])
    try:
        canonical.export_revision(store,collecting,'TAN10101')
        raise AssertionError('incomplete snapshot was exported')
    except ValueError as exc:
        assert 'incompleto' in str(exc)
    store.finalize_snapshot(collecting)
    exported=canonical.export_revision(store,collecting,'TAN10101')
    assert exported['snapshot_id']==str(collecting)
    assert exported['line_id']=='TAN10101'

    class Dummy: pass
    dummy=Dummy();dummy.STORE=store
    def good():
        x=store.create_snapshot(window_id=None,source_kind='wrapped-good')
        store.ingest_line_metrics(x,[{'line':'TAN10102','product_model':'CPH2817','quantity':2,'fpy':99.0}])
        return {'snapshot_id':x}
    dummy.good=good
    hardening._wrap_snapshot_operation(dummy,'good')
    good_result=dummy.good()
    assert store.snapshot_status(good_result['snapshot_id'])['status']=='complete'

    created=[]
    def bad():
        x=store.create_snapshot(window_id=None,source_kind='wrapped-bad');created.append(x)
        store.ingest_line_metrics(x,[{'line':'TAN10103','product_model':'CPH2819','quantity':3,'fpy':95.0}])
        raise RuntimeError('boom')
    dummy.bad=bad
    hardening._wrap_snapshot_operation(dummy,'bad')
    try:
        dummy.bad()
        raise AssertionError('wrapped failure did not propagate')
    except RuntimeError as exc:
        assert str(exc)=='boom'
    assert store.snapshot_status(created[0])['status']=='error'

    cfg=root/'config.json'
    cfg.write_text(json.dumps({'version':1}),encoding='utf-8')
    hardening.atomic_write_json(cfg,{'version':2,'configured_lines':['TAN10101']})
    assert json.loads(cfg.read_text(encoding='utf-8'))['version']==2
    previous=root/'config.previous.json'
    assert previous.exists() and json.loads(previous.read_text(encoding='utf-8'))['version']==1
    badcfg=root/'bad.json';badcfg.write_text('{broken',encoding='utf-8')
    try:
        hardening.strict_load_config(badcfg)
        raise AssertionError('invalid config accepted')
    except RuntimeError:
        pass

    state=hardening.health(store)
    assert state['schema_version']==1
    assert state['integrity'].lower()=='ok'
    assert state['collecting_snapshots']==0
    assert state['error_snapshots']>=2
    assert state['config_write']=='atomic'

print('hardening-ok')
`;
  const run=spawnSync(python,['-c',code],{cwd:process.cwd(),encoding:'utf8'});
  assert.equal(run.status,0,(run.stdout||'')+(run.stderr||''));
  assert.match(run.stdout,/hardening-ok/);
});
