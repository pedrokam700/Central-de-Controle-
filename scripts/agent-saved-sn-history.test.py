"""B3.2: saved SN lookups live in jobs.result_json, never in MES re-query."""
import ast
import hashlib
import json
import pathlib
import sys
import tempfile
import types
import unittest
from urllib.parse import urlparse,parse_qs,urlencode

ROOT=pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'ames'/'agent'))
from store import Store,stable_json
import canonical
import workstation_pairing


class SavedSnHistoryTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.db=Store(pathlib.Path(self.tmp.name)/'original.sqlite')
        self.db.initialize()
        self.source=canonical.source_id(self.db)
        self.job('a01','SN-X','2026-10-16T15:00:00+00:00',{'trace_3074':{'reused_components':[{'secret_mes_row':'RETAINED-LOCAL'}]},'warnings':['partial evidence']})
        self.job('a02','SN-Y','2026-10-17T15:00:00+00:00',{'trace_2114':{'rows':[{'history':'old'}]}})
        self.job('a03','SN-X','2026-10-17T15:00:00+00:00',{'trace_3012':{'rows':[{'repair':'candidate'}]}},status='error')
        self.job('a04','SN-X','2026-10-18T15:00:00+00:00',None)
        self.job('other','SN-X','2026-10-19T15:00:00+00:00',{'not':'sn_lookup'},kind='deep_trace')

        # Run the real hardened GET handler without importing its bootstrapping
        # module, which would start a network agent.
        syntax=ast.parse((ROOT/'ames/agent/agent_hardened_entry.py').read_text())
        cls=next(n for n in syntax.body if isinstance(n,ast.ClassDef) and n.name=='HardenedHandler')
        method=next(n for n in cls.body if isinstance(n,ast.FunctionDef) and n.name=='do_GET')
        context={'entry':types.SimpleNamespace(a=types.SimpleNamespace(STORE=self.db,BASE_DIR=pathlib.Path(self.tmp.name))),
                 'urlparse':urlparse,'parse_qs':parse_qs,'workstation_pairing':workstation_pairing}
        exec(compile(ast.Module(body=[method],type_ignores=[]),'<real hardened GET>','exec'),context)
        self.handler=types.SimpleNamespace(_authorized=lambda path:True,
            _send=lambda value,status=200:setattr(self,'response',(status,value)),
            _reject_unauthorized=lambda:setattr(self,'response',(401,{'error':'agent_not_paired'})))
        self.get_method=types.MethodType(context['do_GET'],self.handler)

    def tearDown(self):
        self.tmp.cleanup()

    def job(self,job_id,sn,when,result,*,status='done',kind='sn_lookup'):
        with self.db.connect() as con:
            con.execute(
                """INSERT INTO jobs(id,kind,status,created_at,finished_at,config_json,result_json)
                   VALUES(?,?,?,?,?,?,?)""",
                (job_id,kind,status,when,when,stable_json({'sn':sn,'include_3012':True}),
                 stable_json(result) if result is not None else None)
            )

    def get(self,**params):
        self.handler.path='/api/v1/saved-sn-history'+(('?'+urlencode(params)) if params else '')
        self.get_method()
        return self.response

    def test_query_clock_pagination_ties_and_no_raw_index(self):
        before=self.db.connect()
        status,page=self.get(limit=2)
        self.assertEqual(status,200)
        self.assertEqual([x['job_id'] for x in page['items']],['a03','a02'])
        self.assertTrue(page['next_cursor'])
        for row in page['items']:
            self.assertIsNone(row['production_date'])
            self.assertIsNone(row['line_id'])
            self.assertEqual(row['clock_kind'],'query_created_at')
            self.assertEqual(row['coverage'],'unverified')
            self.assertTrue(row['local_only'])
        self.assertNotIn('secret_mes_row',json.dumps(page))
        status,second=self.get(limit=2,before=page['next_cursor'])
        self.assertEqual(status,200)
        self.assertEqual([x['job_id'] for x in second['items']],['a01'])
        self.assertIsNone(second['next_cursor'])

    def test_sn_and_query_time_filter_does_not_infer_production_day(self):
        status,page=self.get(sn='sn-x',start='2026-10-17T00:00:00Z',end='2026-10-18T00:00:00Z')
        self.assertEqual(status,200)
        self.assertEqual([x['job_id'] for x in page['items']],['a03'])
        self.assertEqual(page['items'][0]['query_status'],'error')
        self.assertEqual(page['items'][0]['query_sn'],'SN-X')
        self.assertIsNone(page['items'][0]['production_date'])
        status,empty=self.get(sn='SN-Z')
        self.assertEqual(status,200);self.assertEqual(empty['items'],[])

    def test_exact_raw_open_and_payload_hash_persist_over_restart(self):
        entry=self.get(sn='SN-X')[1]['items'][0]
        status,data=self.get(job_id=entry['job_id'],entry_hash=entry['entry_hash'])
        self.assertEqual(status,200)
        self.assertEqual(data['result']['trace_3012']['rows'][0]['repair'],'candidate')
        self.assertEqual(data['entry_hash'],entry['entry_hash'])
        self.assertEqual(data['line_id'],None)
        reopened=Store(self.db.path);reopened.initialize()
        self.assertEqual(canonical.source_id(reopened),self.source)
        self.assertEqual(reopened.open_saved_sn_lookup(entry['job_id'],entry['entry_hash']),data)
        self.assertEqual(hashlib.sha256(stable_json(data['result']).encode()).hexdigest(),entry['result_sha256'])

    def test_tampering_with_result_or_config_never_returns_new_data_as_old(self):
        entries={e['job_id']:e for e in self.get()[1]['items']}
        original=entries['a02']
        with self.db.connect() as con:
            con.execute("UPDATE jobs SET result_json=? WHERE id='a02'",(stable_json({'modified':'different'}),))
        self.assertEqual(self.get(job_id='a02',entry_hash=original['entry_hash'])[0],409)
        unchanged=entries['a03']
        with self.db.connect() as con:
            con.execute("UPDATE jobs SET config_json=? WHERE id='a03'",(stable_json({'sn':'OTHER'}),))
        self.assertEqual(self.get(job_id='a03',entry_hash=unchanged['entry_hash'])[0],409)

    def test_bad_cursor_bounds_identity_and_unpaired_access_fail_closed(self):
        first=self.get(limit=1)[1]['next_cursor']
        for params in [
            {'before':'not_base64'}, {'before':first,'sn':'wrong-filter'},
            {'limit':10000}, {'limit':0},
            {'start':'2026-10-19'}, {'start':'2026-10-18T00:00:00Z','end':'2026-10-17T00:00:00Z'},
        ]:
            self.assertEqual(self.get(**params)[0],400,params)
        self.assertEqual(self.get(job_id='a01',entry_hash='0'*64)[0],409)
        self.assertEqual(self.get(job_id='missing',entry_hash='0'*64)[0],400)
        self.assertEqual(self.get(job_id='a01',entry_hash='abc')[0],400)
        self.handler._authorized=lambda path:False
        self.assertEqual(self.get()[0],401)
        self.assertEqual(self.get(job_id='a01',entry_hash='0'*64)[0],401)

    def test_listing_has_no_write_or_mes_dependency(self):
        with self.db.connect() as con:
            before=con.execute("SELECT COUNT(*),SUM(length(result_json)) FROM jobs").fetchone()
            original=con.execute("SELECT result_json FROM jobs WHERE id='a01'").fetchone()[0]
        self.assertEqual(self.get(sn='SN-X')[0],200)
        with self.db.connect() as con:
            after=con.execute("SELECT COUNT(*),SUM(length(result_json)) FROM jobs").fetchone()
            raw=con.execute("SELECT result_json FROM jobs WHERE id='a01'").fetchone()[0]
        self.assertEqual(tuple(before),tuple(after))
        self.assertEqual(original,raw)


if __name__=='__main__':
    unittest.main()
