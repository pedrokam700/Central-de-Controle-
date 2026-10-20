"""B3.4b3 — verify scope, paging and authorization on the real hardened GET."""
import ast
import json
import pathlib
import sys
import tempfile
import types
import unittest
from urllib.parse import parse_qs,urlparse,urlencode

ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'ames'/'agent'))
from store import Store
import canonical
import workstation_pairing
import source_capture

LINE='TAN10103'
OTHER='TAN10102'

class CaptureManifestTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.store=Store(pathlib.Path(self.tmp.name)/'original.sqlite')
        self.store.initialize()
        window=self.store.ensure_window('previous_day','2026-10-16T07:00-03:00','2026-10-17T07:00-03:00',None,[LINE,OTHER])
        self.sid=self.store.create_snapshot(window_id=window,source_kind='synthetic')
        self.store.ingest_defects(self.sid,[{'line':LINE,'pcba_sn':'PCBA-ORIGINAL','product_model':'CPH2859V',
            'defect_code':'D1','defect_time':'2026-10-16T12:00:00-03:00'}])
        self.original=canonical.export_revision(self.store,self.sid,LINE)
        self.scope={k:self.original[k] for k in ('source_id','snapshot_id','snapshot_revision','content_hash')}
        self.scope['period']=self.original['summary']['period']
        self.query={'snapshot_id':str(self.sid),'line':LINE,'snapshot_revision':1,
                    'content_hash':self.original['content_hash']}
        self.save('3074','J1',{'status':'partial','secret_raw':'SENSITIVE_LCM_RAW','items':[{'item_sn':'LCD-SECRET'}]},'partial')
        self.save('2114','J1',{'status':'done','repair_comment':'PRIVATE_AT_COMMENT'},'done')
        self.save('3022','J1',{'progress_only':True,'sample_count':2,'checkpoint_kind':'bounded_partial_progress',
            'items':[{'pcba':'VERY_PRIVATE_PCBA','phase':'mes'}]},'partial')
        self.save('3074','J2',{'status':'done','secret_raw':'MORE_PRIVATE_DATA'},'done')
        self.save('3074','J1',{'status':'done','secret_raw':'FINAL_PRIVATE_DATA'},'done')
        self._handler()

    def save(self,view,job,data,status):
        source_capture.capture_source(self.store,target=self.scope,line=LINE,job_id=job,view=view,result=data,status=status)

    def _handler(self):
        tree=ast.parse((ROOT/'ames/agent/agent_hardened_entry.py').read_text())
        cls=next(x for x in tree.body if isinstance(x,ast.ClassDef) and x.name=='HardenedHandler')
        getter=next(x for x in cls.body if isinstance(x,ast.FunctionDef) and x.name=='do_GET')
        env={'entry':types.SimpleNamespace(a=types.SimpleNamespace(STORE=self.store,
            BASE_DIR=pathlib.Path(self.tmp.name))),
            'urlparse':urlparse,'parse_qs':parse_qs,'source_capture':source_capture,'workstation_pairing':workstation_pairing}
        exec(compile(ast.Module(body=[getter],type_ignores=[]),'<actual hardened GET>','exec'),env)
        self.handler=types.SimpleNamespace(
            _authorized=lambda path:True,
            _send=lambda value,status=200:setattr(self,'response',(status,value)),
            _reject_unauthorized=lambda:setattr(self,'response',(401,{'error':'agent_not_paired'}))
        )
        self.get_method=types.MethodType(env['do_GET'],self.handler)

    def get(self,**kwargs):
        q={**self.query,**kwargs}
        self.handler.path='/api/v1/source-captures?'+urlencode(q)
        self.get_method()
        return self.response

    def tearDown(self):self.tmp.cleanup()

    def test_paging_metadata_is_bounded_and_never_leaks_mes_raw(self):
        paged=[];cursor=None
        while True:
            args={'limit':2}
            if cursor:args['before']=cursor
            status,body=self.get(**args)
            self.assertEqual(status,200)
            self.assertTrue(body['metadata_only'])
            self.assertTrue(body['local_only'])
            self.assertFalse(body['source_complete'])
            self.assertEqual(body['period']['mode'],'previous_day')
            self.assertEqual(body['snapshot_revision'],1)
            self.assertLessEqual(len(body['items']),2)
            paged.extend(body['items'])
            cursor=body['next_cursor']
            if not cursor:break
            self.assertLess(len(paged),10)
        self.assertEqual(len(paged),5)
        self.assertEqual(len({(x['job_id'],x['source_view'],x['capture_revision']) for x in paged}),5)
        self.assertEqual({x['source_view'] for x in paged},{'3074','2114','3022'})
        self.assertEqual({x['line_id'] for x in paged},{LINE})
        self.assertEqual({x['period_mode'] for x in paged},{'previous_day'})
        self.assertTrue(all(x['source_complete'] is False for x in paged))
        self.assertTrue(all(x['population_complete'] is False for x in paged))
        self.assertEqual([x for x in paged if x['source_view']=='3022'][0]['progress_only'],True)
        self.assertNotIn('SENSITIVE_LCM_RAW',json.dumps(paged))
        self.assertNotIn('PRIVATE_AT_COMMENT',json.dumps(paged))
        self.assertNotIn('VERY_PRIVATE_PCBA',json.dumps(paged))
        self.assertNotIn('secret_raw',json.dumps(paged))
        self.assertNotIn('result',json.dumps(paged))

    def test_filter_view_cursors_and_wrong_sources_fail_closed(self):
        s,res=self.get(source_view='3074',limit=1);self.assertEqual(s,200)
        self.assertEqual(res['items'][0]['source_view'],'3074')
        cursor=res['next_cursor'];self.assertIsNotNone(cursor)
        self.assertEqual(self.get(before=cursor,source_view='2114')[0],400)
        self.assertEqual(self.get(before='$$$')[0],400)
        self.assertEqual(self.get(content_hash='0'*64)[0],400)
        self.assertEqual(self.get(snapshot_revision=99)[0],400)
        self.assertEqual(self.get(line=OTHER)[0],400)
        self.assertEqual(self.get(snapshot_id='1 or 1')[0],400)
        self.assertEqual(self.get(source_view='3012')[0],400)
        self.assertEqual(self.get(limit=10000)[0],400)

    def test_late_canonical_change_does_not_move_original_captures(self):
        with self.store.connect() as db:
            db.execute("UPDATE defect_observations SET repair_status_current='Y' WHERE snapshot_id=? AND line=?",
                (self.sid,LINE))
        latest=canonical.export_revision(self.store,self.sid,LINE)
        self.assertGreater(latest['snapshot_revision'],self.original['snapshot_revision'])
        new=self.get(snapshot_revision=latest['snapshot_revision'],content_hash=latest['content_hash'])
        self.assertEqual(new[0],200)
        self.assertEqual(new[1]['items'],[])
        old=self.get()
        self.assertEqual(old[0],200)
        self.assertEqual(len(old[1]['items']),5)
        self.assertEqual(canonical.read_revision(self.store,self.sid,LINE,1),self.original)

    def test_no_new_revision_and_token_required_after_restart(self):
        with self.store.connect() as db:
            before=db.execute("SELECT COUNT(*) FROM mes_revisions").fetchone()[0]
        reopened=Store(self.store.path);reopened.initialize()
        self.assertEqual(canonical.source_id(reopened),self.original['source_id'])
        self.assertEqual(len(source_capture.capture_manifest(reopened,snapshot_id=self.sid,
            line=LINE,snapshot_revision=1,content_hash=self.original['content_hash'])['items']),5)
        with self.store.connect() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM mes_revisions").fetchone()[0],before)
        self.handler._authorized=lambda path:False
        self.assertEqual(self.get()[0],401)
        self.assertEqual(self.get(source_view='3074')[0],401)

if __name__=='__main__':unittest.main()
