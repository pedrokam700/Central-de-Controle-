"""The CLEAN 3074 checkpoint key must never be mistaken for a 3028 key."""
import pathlib
import sys
import tempfile
import unittest

sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'ames'/'agent'))
from store import Store
import canonical


class MaterialLineage(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.store=Store(pathlib.Path(self.temp.name)/'factory.sqlite')
        self.store.initialize()
        self.sid=self.store.create_snapshot(window_id=None,source_kind='synthetic')
        self.source={'line':'TAN10103','pcba_sn':'PCBA-42','product_model':'CPH2819',
            'defect_time':'2026-10-30T12:02:00Z','defect_code':'GN-01',
            'defect_desc':'Sensor infrared failed'}
        self.store.ingest_defects(self.sid,[self.source,{**self.source,'line':'TAN10102'}])

    def tearDown(self):self.temp.cleanup()

    def trace(self,source=None,checkpoint_key='3074-batch-1'):
        return {'trace_3074':{'items':[{'pcba_sn':'PCBA-42','status':'COMPLETE',
            'defect_traces':[{'defect_key':checkpoint_key,'defect':source or self.source,
             'trace_3074':{'results':[{'item_sn':'LCD-SECOND-USE','item_type':'LCD',
                 'current_pcba_confirmed':True,'previous_pcba_count':1,
                 'previous_pcbas':['PCBA-OLDER'],'total_pcba_count_known_now':2,
                 'status':'SEGUNDO_USO_NO_MOMENTO_DA_FALHA'}],
             'candidate_material_history':[{'item_sn':'CAM-HISTORY','item_type':'CAM',
                 'status':'CANDIDATE_HISTORY_AVAILABLE'}]}}]}]}}

    def test_new_trace_ingest_uses_exact_stored_key_and_never_crosses_line(self):
        result=self.trace()
        self.assertEqual(self.store.ingest_material_reuse(self.sid,result['trace_3074']),1)
        with self.store.connect() as con:
            row=dict(con.execute('SELECT * FROM material_reuse WHERE snapshot_id=?',(self.sid,)).fetchone())
            matching=con.execute('SELECT defect_key FROM defect_observations WHERE snapshot_id=? AND line=?',
                (self.sid,'TAN10103')).fetchone()['defect_key']
        self.assertEqual(row['current_defect_key'],matching)
        line3=canonical.export_revision(self.store,self.sid,'TAN10103')
        line2=canonical.export_revision(self.store,self.sid,'TAN10102')
        self.assertEqual(len(line3['datasets']['material_reuse']),1)
        self.assertEqual(len(line2['datasets']['material_reuse']),0)
        self.assertEqual(line3['datasets']['material_reuse'][0]['previous_pcba_count'],1)
        self.assertEqual(line3['datasets']['material_reuse'][0]['material_use_index'],2)

    def test_proven_first_use_is_observed_but_unknown_is_not_first_use(self):
        trace=self.trace()
        results=trace['trace_3074']['items'][0]['defect_traces'][0]['trace_3074']['results']
        results.extend([
            {'item_sn':'CAM-FIRST','item_type':'CAM','current_pcba_confirmed':True,
             'previous_pcba_count':0,'previous_pcbas':[],'status':'SEM_REUSO_ANTERIOR'},
            {'item_sn':'CAM-UNKNOWN','item_type':'CAM','current_pcba_confirmed':False,
             'previous_pcba_count':None,'status':'HISTORICO_3074_PARCIAL'},
        ])
        self.assertEqual(self.store.ingest_material_reuse(self.sid,trace['trace_3074']),2)
        rows=canonical.export_revision(self.store,self.sid,'TAN10103')['datasets']['material_reuse']
        self.assertEqual({r['item_sn']:r['material_use_index'] for r in rows},
                         {'LCD-SECOND-USE':2,'CAM-FIRST':1})

    def test_existing_orphan_is_recovered_in_memory_with_exact_raw_trace(self):
        trace=self.trace()
        with self.store.connect() as con:
            con.execute('INSERT INTO material_reuse(snapshot_id,current_pcba_sn,current_defect_key,item_sn,item_type,previous_pcba_count) '
                'VALUES(?,?,?,?,?,?)',(self.sid,'PCBA-42','3074-batch-1','LCD-SECOND-USE','LCD',1))
        old=canonical.export_revision(self.store,self.sid,'TAN10103')
        self.assertEqual(old['datasets']['material_reuse'],[])
        self.store.save_snapshot_payload(self.sid,'integrated_v016',trace)
        new=canonical.export_revision(self.store,self.sid,'TAN10103')
        self.assertEqual(new['snapshot_revision'],old['snapshot_revision']+1)
        self.assertEqual(len(new['datasets']['material_reuse']),1)
        self.assertEqual(canonical.read_revision(self.store,self.sid,'TAN10103',old['snapshot_revision']),old)
        # The old factory row was not silently migrated or rewritten.
        with self.store.connect() as con:
            self.assertEqual(con.execute('SELECT current_defect_key FROM material_reuse WHERE snapshot_id=?',
                (self.sid,)).fetchone()[0],'3074-batch-1')

    def test_candidates_from_actual_integrated_v016_use_canonical_occurrence(self):
        self.store.save_snapshot_payload(self.sid,'integrated_v016',self.trace())
        projected=canonical.export_revision(self.store,self.sid,'TAN10103')
        candidates=projected['material_candidates']
        self.assertEqual([c['item_sn'] for c in candidates],['CAM-HISTORY'])
        self.assertEqual(candidates[0]['scope'],'3028_EXACT_OCCURRENCE_CANDIDATE')
        self.assertEqual(candidates[0]['defect_key'],projected['datasets']['defects'][0]['defect_key'])
        self.assertFalse(candidates[0]['proven_reuse_at_defect'])
        self.assertEqual(canonical.export_revision(self.store,self.sid,'TAN10102')['material_candidates'],[])

    def test_missing_line_cannot_relabel_old_material_as_proven(self):
        trace=self.trace(source={k:v for k,v in self.source.items() if k!='line'})
        self.store.ingest_material_reuse(self.sid,trace['trace_3074'])
        self.store.save_snapshot_payload(self.sid,'integrated_v016',trace)
        self.assertEqual(canonical.export_revision(self.store,self.sid,'TAN10103')['datasets']['material_reuse'],[])
        self.assertEqual(canonical.export_revision(self.store,self.sid,'TAN10102')['datasets']['material_reuse'],[])

    def test_different_defect_time_never_joins_by_matching_pcba(self):
        trace=self.trace(source={**self.source,'defect_time':'2026-10-30T14:59:00Z'})
        self.store.ingest_material_reuse(self.sid,trace['trace_3074'])
        self.store.save_snapshot_payload(self.sid,'integrated_v016',trace)
        data=canonical.export_revision(self.store,self.sid,'TAN10103')
        self.assertEqual(data['datasets']['material_reuse'],[])
        self.assertEqual(data['material_candidates'],[])


if __name__=='__main__':unittest.main(verbosity=2)
