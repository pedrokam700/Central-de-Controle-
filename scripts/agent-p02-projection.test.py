"""P02 semantic equivalence through existing pure consumers; synthetic SQLite only.

Runs with the preexisting, pinned CI test dependencies. Never initializes Store,
starts an agent/browser, or changes the production canonical/sync contract.
"""
import hashlib
import json
from pathlib import Path
import runpy
import sqlite3
import subprocess
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path[:0]=[str(ROOT/'ames/agent'),str(ROOT/'ames/factory-engine')]
from engine_bridge import build_trace_insights
from operator_evidence import operator_evidence
from production_shift import from_context,classify_passage

FIX=runpy.run_path(str(ROOT/'scripts/fixtures/p02_installation.py'))
P02=runpy.run_path(str(ROOT/'tools/ames-lab/synthetic_deidentify.py'))


class P02Projection(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.workspace=Path(self.tmp.name).resolve()/'P02-SYNTHETIC-PROJECTION'
        source=FIX['make_fixture'](self.workspace);P02['prepare_synthetic'](self.workspace)
        self.a=sqlite3.connect(source/'ames-agent/data/ames_local.sqlite3')
        self.b=sqlite3.connect(self.workspace/'published/lab/ames_local.sqlite3')
        self.addCleanup(self.a.close);self.addCleanup(self.b.close)
        ledger=json.loads((self.workspace/'private/transform-ledger.json').read_text(encoding='utf-8'))
        self.mapping=ledger['mapping'];self.inverse={v:k for k,v in self.mapping.items()}

    def restore(self,value):
        return P02['_normalize'](value,self.inverse)

    def payload(self,con):
        return json.loads(con.execute("SELECT payload_json FROM snapshot_payloads WHERE snapshot_id=1 AND kind='integrated_v016'").fetchone()[0])

    def test_native_3074_insights_preserve_all_cohorts_and_history(self):
        old=build_trace_insights(ROOT/'ames/factory-engine',self.payload(self.a),line='TAN10103')
        new=build_trace_insights(ROOT/'ames/factory-engine',self.payload(self.b),line=self.mapping['TAN10103'])
        self.assertEqual(old,self.restore(new))
        cohorts=dict(new['pcba_kpis'])
        self.assertEqual([cohorts[k] for k in ('PCBA em 1º uso','PCBA em 2º uso','PCBA em 3º+ uso')],[1,1,2])
        self.assertEqual(len(new['drilldowns']['pcba_analysis']),4)

    def test_native_3022_contexts_keep_clock_proof_and_AT_exclusion(self):
        observed=0;proven=0;at=0
        for left,right in zip(self.a.execute('SELECT payload FROM mes_revisions ORDER BY rowid'),self.b.execute('SELECT payload FROM mes_revisions ORDER BY rowid')):
            old,new=json.loads(left[0]),json.loads(right[0])
            for x,y in zip(old.get('process_contexts',[]),new.get('process_contexts',[])):
                self.assertEqual(from_context(x),self.restore(from_context(y)))
                observed+=1;proven+=from_context(y)['production_shift_source']=='3022'
            for x,y in zip(old['datasets']['process_timeline'],new['datasets']['process_timeline']):
                eligible=not str(x.get('station') or '').startswith('A69')
                a=classify_passage(x['event_time'],station=x['station'],eligible=eligible)
                b=classify_passage(y['event_time'],station=y['station'],eligible=eligible)
                self.assertEqual(a,self.restore(b))
                if not eligible:
                    at+=1;self.assertIsNone(b['production_event_time'])
        self.assertGreater(observed,0);self.assertGreater(proven,0);self.assertGreater(at,0)

    def test_native_operator_aliases_preserve_name_id_and_provenance(self):
        names=0;ids=0
        old=[operator_evidence(json.loads(r[0])) for r in self.a.execute('SELECT raw_json FROM process_events ORDER BY rowid')]
        new=[operator_evidence(json.loads(r[0])) for r in self.b.execute('SELECT raw_json FROM process_events ORDER BY rowid')]
        self.assertEqual(old,self.restore(new))
        for x,y in zip(old,new):
            names+=bool(y['operator_name']);ids+=bool(y['operator_id'])
            if x['operator_id'] and x['operator_id'].startswith('BRM'):self.assertTrue(y['operator_id'].startswith('BRM-LAB-'))
        self.assertGreater(names,0);self.assertGreater(ids,names)
        self.assertNotEqual(self.mapping['Pessoa sintética'],self.mapping['Autor sintético'])

    def test_all_revision_hashes_and_checkpoint_use_LAB_domain(self):
        seen=[]
        for sid,line,revision,content,raw in self.b.execute('SELECT snapshot_id,line,revision,content_hash,payload FROM mes_revisions ORDER BY rowid'):
            payload=json.loads(raw);self.assertEqual(payload.pop('content_hash'),content)
            self.assertEqual(P02['digest'](payload),content)
            self.assertEqual(payload['schema'],'central-ames-lab-only-v1')
            seen.append((sid,line,revision,content))
        self.assertEqual(len(seen),3);self.assertEqual(len({r[1] for r in seen}),2)
        for content,raw in self.b.execute('SELECT content_hash,row_json FROM repair_row_versions_3012'):
            self.assertEqual(hashlib.sha256(raw.encode()).hexdigest(),content)
        checkpoint=json.loads((self.workspace/'published/lab/checkpoint.json').read_text(encoding='utf-8'))
        self.assertIs(checkpoint['sync_allowed'],False);c=checkpoint['checkpoint']
        self.assertIn((c['snapshot_id'],c['line'],c['revision'],c['content_hash']),seen)

    def test_production_normalizer_accepts_original_but_refuses_LAB(self):
        before=json.loads(self.a.execute('SELECT payload FROM mes_revisions ORDER BY rowid DESC LIMIT 1').fetchone()[0])
        after=json.loads(self.b.execute('SELECT payload FROM mes_revisions ORDER BY rowid DESC LIMIT 1').fetchone()[0])
        code="""import {normalizeCanonical} from './ames/data/canonical.mjs';
let text='';for await(const part of process.stdin)text+=part;
const [before,after]=JSON.parse(text);normalizeCanonical(before);
let refused=false;try{normalizeCanonical(after)}catch(e){refused=e.message==='Invalid canonical snapshot'}
if(!refused)throw Error('LAB accepted as production canonical');console.log('LAB_SYNC_DOMAIN_REFUSED');"""
        result=subprocess.run(['node','--input-type=module','-e',code],cwd=ROOT,input=json.dumps([before,after]),capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stderr);self.assertEqual(result.stdout.strip(),'LAB_SYNC_DOMAIN_REFUSED')


if __name__=='__main__':unittest.main()
