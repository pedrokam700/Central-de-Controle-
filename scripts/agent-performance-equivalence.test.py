"""Differential against committed PR89 functions, disposable SQLite only."""
import copy
import json
from pathlib import Path
import random
import sqlite3
import subprocess
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[1]
sys.path[:0]=[str(ROOT/'ames/agent'),str(ROOT/'ames/factory-engine')]
import canonical
import process_r11
import production_shift as shift
import production_diagnostics as diagnostics
import material_trace_provenance as material
import integrated_snapshot_history as recovery
from core import failure_taxonomy as taxonomy
from store import Store

def reference(name):
    source=subprocess.check_output(['git','show','b8a2b1e00193e2d5493d0fd14bfcbf41e89087ca:ames/agent/'+name+'.py'],text=True)
    module=types.ModuleType('_pr89_'+name)
    exec(compile(source,'<PR89 '+name+'>','exec'),module.__dict__)
    return module

old_shift=reference('production_shift')
old_diag=reference('production_diagnostics');old_diag.production_shift=old_shift
old_canonical=reference('canonical');old_canonical.production_shift=old_shift;old_canonical.production_diagnostics=old_diag
old_material=reference('material_trace_provenance')
old_canonical.exact_observation=old_material.exact_observation;old_canonical.trace_material_links=old_material.trace_material_links
old_store=reference('store')
old_recovery=reference('integrated_snapshot_history')
old_taxonomy=types.ModuleType('_pr89_taxonomy');old_taxonomy.__file__=str(ROOT/'ames/factory-engine/core/failure_taxonomy.py')
exec(compile(subprocess.check_output(['git','show','b8a2b1e00193e2d5493d0fd14bfcbf41e89087ca:ames/factory-engine/core/failure_taxonomy.py'],text=True),'<PR89 taxonomy>','exec'),old_taxonomy.__dict__)
LINE='TAN10101'

class Equivalent(unittest.TestCase):
    def test_unicode_cache_is_bounded_and_preserves_policy_changes_and_long_source_text(self):
        descriptions=['câmera frontal failed','rear camera fault','sem falha','camera frontal traseira',
                      'GPS/WIFI failed','Sensor de proximidade','显示屏','UNKNOWN',None,False,['camera'],{'camera':1},'CÂMERA '*1000]
        rules=taxonomy.configuration();rules['code_aliases']['LEGACY']='D';rules['negative_phrases'].append('synthetic-negative')
        for desc in descriptions:
            self.assertEqual(taxonomy.normalize(desc),old_taxonomy.normalize(desc))
            for code in ('D','LEGACY','UNKNOWN',''):
                self.assertEqual(taxonomy.describe(code,desc,rules),old_taxonomy.describe(code,desc,rules))
                self.assertEqual(taxonomy.compare(code,desc,'D','front camera failed'),old_taxonomy.compare(code,desc,'D','front camera failed'))
        for i in range(2100):taxonomy.normalize('synthetic distinct '+str(i))
        self.assertLessEqual(taxonomy._cached_normalize_text.cache_info().currsize,1024)

    def test_recovery_matches_PR89_and_owns_all_selected_mutable_data(self):
        defects=[{'line':LINE,'pcba_sn':'P','defect_code':code,'defect_time':'2026-11-03 09:00:00'} for code in ('D','E')]
        def payload(revision,complete=True):
            return {'trace_3074':{'items':[{'pcba_sn':'P','status':'COMPLETE' if complete else 'PARTIAL',
                'source_id':'SOURCE','snapshot_revision':revision,'period':{'mode':'synthetic'},
                'base_query':{'query_sn':'P','query_confirmation':'EXACT_QUERY_ROW','rows':[{'Barcode':'P','Sn Type':'PCBA',
                    'Bind Time':'2026-11-03T10:00:00Z','Iss Status':'Y','comment':'Vínculo preservado'}]},
                'defect_traces':[{'defect':d,'status':'COMPLETE','trace_3074':{'results':[{'item_sn':'M',
                    'current_pcba_confirmed':True,'previous_pcbas':['OLD'],'repair_comment':'Comentário'}]}} for d in defects]}]},
                'trace_2114':{'pcbas':[{'pcba_sn':'P','status':'COMPLETE','result':{'rows':[
                    {'Defect Hist Seq':0,'Defect Code':'OLD','Defect User Name':'Autor '+str(revision)},
                    {'Defect Hist Seq':1,'Defect Code':'UNDATED','Repair Status':'N'}]}}],
                    'contexts':[{'line':LINE,'current_pcba':'P','context_key':'CTX','source_id':'SOURCE','snapshot_revision':revision}]}}
        versions=[payload(1),payload(2,False),payload(3)]
        versions[1]['trace_3074']['items'][0]['defect_traces']=versions[1]['trace_3074']['items'][0]['defect_traces'][:1]
        versions[2]['trace_3074']['items'][0]['base_query']['rows'][0]['Bind Time']=None
        original=copy.deepcopy(versions)
        actual=recovery.recover_snapshot_line(versions,LINE,defects)
        self.assertEqual(actual,old_recovery.recover_snapshot_line(versions,LINE,defects))
        self.assertEqual(versions,original)
        actual[0]['trace_3074']['items'][0]['base_query']['rows'][0]['comment']='changed'
        actual[0]['trace_2114']['pcbas'][0]['result']['rows'][0]['Defect User Name']='changed'
        self.assertEqual(versions,original)

    def test_material_indexes_keep_literal_dates_models_duplicates_and_ambiguous_identity(self):
        rows=[{'line':LINE,'pcba_sn':'P','defect_time':'2026-11-03 09:00:00','defect_code':'D',
               'defect_desc':'Camera','defect_key':'K','product_model':'CPH2859'}]
        sources=[rows[0],{**rows[0],'line':'TAN10102'},{**rows[0],'defect_time':'2026-11-03T12:00:00Z'},
                 {**rows[0],'product_model':'OTHER'},{**rows[0],'product_model':''},{**rows[0],'line':''}]
        for candidates in (rows,rows+copy.deepcopy(rows),rows+[{**rows[0],'product_model':'OTHER','defect_key':'OTHER'}]):
            index=material.index_observations(candidates)
            for source in sources:
                self.assertEqual(material.exact_observation(source,material.observation_candidates(source,index)),
                                 old_material.exact_observation(source,candidates))

    def test_persistence_and_canonical_material_rows_equal_PR89_in_disposable_clones(self):
        with tempfile.TemporaryDirectory() as folder:
            source=Store(Path(folder)/'source.sqlite');source.initialize()
            sid=source.create_snapshot(window_id=None,source_kind='synthetic')
            defects=[{'line':LINE,'pcba_sn':f'P{i}','defect_time':'2026-11-03 09:00:00','defect_code':'D',
                'defect_desc':'Camera','product_model':'CPH2859'} for i in range(20)]
            source.ingest_defects(sid,defects)
            items=[{'pcba_sn':r['pcba_sn'],'defect_traces':[{'defect':r,'defect_key':'LEGACY'+str(i),
                'trace_3074':{'results':[{'item_sn':'M'+str(i),'item_type':'Camera','current_pcba_confirmed':True,
                    'previous_pcba_count':i%3,'previous_pcbas':[f'OLD{x}' for x in range(i%3)],
                    'status':'Y' if i%2 else 'N','repair_comment':'Comentário '+str(i),
                    'bind_time_utc':'2026-11-03T10:00:00Z'}]}}]} for i,r in enumerate(defects)]
            payload={'trace_3074':{'items':items}};source.save_snapshot_payload(sid,'integrated_v016',payload)
            targets=[]
            for kind,klass in (('old',old_store.Store),('new',Store)):
                path=Path(folder)/(kind+'.sqlite')
                with source.connect() as src,sqlite3.connect(path) as dst:src.backup(dst)
                targets.append(klass(path))
            old,new=targets
            with patch.dict(sys.modules,{'material_trace_provenance':old_material}):
                expected=old.ingest_material_reuse(sid,payload['trace_3074'])
            self.assertEqual(new.ingest_material_reuse(sid,payload['trace_3074']),expected)
            with old.connect() as a,new.connect() as b:
                self.assertEqual([dict(r) for r in a.execute('SELECT * FROM material_reuse ORDER BY id')],
                                 [dict(r) for r in b.execute('SELECT * FROM material_reuse ORDER BY id')])
            self.assertEqual(canonical.export_revision(new,sid,LINE),old_canonical.export_revision(old,sid,LINE))

    def test_contexts_have_identical_rows_for_UTC_local_legacy_keys_duplicates_and_conflicts(self):
        rng=random.Random(89090)
        stamps=['2026-11-03 09:00:00','2026-11-03T12:00:00Z','2026-11-03T09:00:00-03:00',
                '2026-11-04T12:00:00Z','invalid',None,'2026-02-30T12:00:00Z']
        rows=[{'pcba_sn':rng.choice(['P','Q',' P ','',None]),'line':rng.choice([LINE,'TAN10102',' '+LINE,'']),
               'defect_code':rng.choice(['D','E','',None]),'defect_time':rng.choice(stamps),'defect_key':'K'+str(i%6)} for i in range(80)]
        rows.extend(copy.deepcopy(rows[:5]))
        contexts=[{**r,'source':'3022','reference_station_code':'A6900' if i%7==0 else 'A5162',
                   'reference_event_time':'2026-11-03T11:00:00Z','defect_key':'OLD'+str(i) if i%3 else r['defect_key'],
                   'source_id':'SOURCE'+str(i%2),'snapshot_revision':i%3,'repair_comment':'Comentário '+str(i)} for i,r in enumerate(rows)]
        before=copy.deepcopy((contexts,rows))
        self.assertEqual(shift.project_contexts(contexts,rows),old_shift.project_contexts(contexts,rows))
        self.assertEqual((contexts,rows),before)

    def test_canonical_export_and_old_revision_index_are_identical_in_cloned_databases(self):
        with tempfile.TemporaryDirectory() as folder:
            source=Store(Path(folder)/'source.sqlite');source.initialize();process_r11.patch_store(source)
            sid=source.create_snapshot(window_id=None,source_kind='synthetic')
            source.ingest_defects(sid,[{'pcba_sn':'P','line':LINE,'defect_code':'D','product_model':'CPH2859',
                'defect_time':'2026-11-03 09:00:00'},{'pcba_sn':'P','line':'TAN10102','defect_code':'D',
                'defect_time':'2026-11-03 09:00:00'}])
            source.ingest_2114(sid,[{'pcba_sn':'P','result':{'rows':[{'Defect Hist Seq':0,'Defect Code':'H',
                'Defect Time':'2026-11-01 08:00:00','Defect User Name':'Autor sintético'}]}}])
            records=source.base_rows(sid,LINE)
            contexts=[{**records[0],'source':'3022','reference_station_code':'A5162','reference_event_time':'2026-11-03T11:00:00Z'}]
            process_r11._persist_contexts(source,sid,contexts)
            # Retain old large revisions and a capture whose explicit parent
            # has metadata that must be read from payload, not DB columns.
            parent={'content_hash':'PARENT','summary':{'period':{}},'padding':'X'*30000,
                'snapshot_id':str(sid),'source_id':canonical.source_id(source),'snapshot_revision':1,
                'projection_version':13,'collected_at':'2026-11-17T10:00:00Z','datasets':{'defects':[{'product':'CPH2859'}]}}
            capture={'schema':'ames-local-source-capture-v1','source_view':'3022','line_id':LINE,'snapshot_id':sid,
                'source_id':canonical.source_id(source),'parent_snapshot_revision':1,'parent_content_hash':'PARENT','period':{},
                'result':{'pcbas':[{'pcba_sn':'P','result':{'query_sn':'P','rows':[],
                    'query_diagnostics':{'status':'CONFIRMED_EMPTY'}}}]}}
            with source.connect() as con:
                for rev in (1,2):
                    p={**parent,'snapshot_revision':rev}
                    con.execute('INSERT INTO mes_revisions VALUES(?,?,?,?,?,?)',(sid,LINE,rev,-1,'COLUMN-CONTRADICTION',json.dumps(p)))
            source.save_snapshot_payload(sid,'source_capture_test',capture)
            stores=[]
            for name in ('old','new'):
                target=Store(Path(folder)/(name+'.sqlite'))
                with source.connect() as src,sqlite3.connect(Path(folder)/(name+'.sqlite')) as dst:src.backup(dst)
                stores.append(target)
            old,new=stores
            expected=old_canonical.export_revision(old,sid,LINE)
            actual=canonical.export_revision(new,sid,LINE)
            self.assertEqual(actual,expected)
            self.assertEqual(canonical.history_index(new,LINE),old_canonical.history_index(old,LINE))
            self.assertEqual(canonical.read_revision(new,sid,LINE,1),parent)
            with new.connect() as con:
                self.assertEqual(diagnostics.export_diagnostics(con,sid,LINE,canonical.source_id(new),records,contexts),
                    old_diag.export_diagnostics(con,sid,LINE,canonical.source_id(new),records,contexts))

if __name__=='__main__':unittest.main()
