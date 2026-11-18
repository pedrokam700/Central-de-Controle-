"""Independent OLD native consumers on copies only. No agent/launcher/startup."""
from contextlib import contextmanager
import json
from pathlib import Path
import runpy
import shutil
import sqlite3
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path[:0]=[str(ROOT/'ames/agent'),str(ROOT/'ames/factory-engine')]
import canonical
import local_sn
from engine_bridge import build_trace_insights
from operator_evidence import operator_evidence
from production_shift import from_context
from store import Store

P08=runpy.run_path(str(ROOT/'tools/ames-lab/generation_reconcile.py'))
FIX=runpy.run_path(str(ROOT/'scripts/fixtures/p08_generations.py'));DB=FIX['DB']


class NativeReaders(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name).resolve()/'P08-SYNTHETIC-NATIVE'
        FIX['make'](self.root,technical=True);before={r:FIX['hashes'](self.root/r) for r in ('C0','A','B')}
        result=P08['reconcile'](self.root);self.assertEqual(result['decision'],'R1',result)
        self.assertEqual(before,{r:FIX['hashes'](self.root/r) for r in ('C0','A','B')})
        self.b=sqlite3.connect(self.root/'B'/DB);self.target=sqlite3.connect(self.root/'return-target'/DB)
        self.addCleanup(self.b.close);self.addCleanup(self.target.close)

    def test_original_canonical_module_reads_every_saved_revision_exactly(self):
        target=self.root/'return-target'/DB
        class ReadOnlyStore:
            @contextmanager
            def connect(self):
                con=sqlite3.connect(target.as_uri()+'?mode=ro',uri=True);con.row_factory=sqlite3.Row
                try:con.execute('PRAGMA query_only=ON');yield con
                finally:con.close()
        count=0
        for sid,line,revision,raw in self.b.execute('SELECT snapshot_id,line,revision,payload FROM mes_revisions'):
            self.assertEqual(canonical.read_revision(ReadOnlyStore(),sid,line,revision),json.loads(raw));count+=1
        self.assertEqual(count,3)

    def test_native_3074_all_indicators_histories_and_transfers_identical(self):
        get=lambda c:json.loads(c.execute("SELECT payload_json FROM snapshot_payloads WHERE kind='integrated_v016'").fetchone()[0])
        old=build_trace_insights(ROOT/'ames/factory-engine',get(self.b),line='TAN10103')
        new=build_trace_insights(ROOT/'ames/factory-engine',get(self.target),line='TAN10103')
        self.assertEqual(old,new);self.assertEqual(len(new['drilldowns']['pcba_analysis']),4)
        self.assertEqual([dict(new['pcba_kpis'])[k] for k in ('PCBA em 1º uso','PCBA em 2º uso','PCBA em 3º+ uso')],[1,1,2])

    def test_native_names_roles_comments_and_production_contexts_identical(self):
        a=[operator_evidence(json.loads(r[0])) for r in self.b.execute('SELECT raw_json FROM process_events ORDER BY id')]
        b=[operator_evidence(json.loads(r[0])) for r in self.target.execute('SELECT raw_json FROM process_events ORDER BY id')]
        self.assertEqual(a,b);self.assertTrue(any(x['operator_name']=='Pessoa sintética' for x in b))
        for old,new in zip(self.b.execute('SELECT payload FROM mes_revisions ORDER BY rowid'),self.target.execute('SELECT payload FROM mes_revisions ORDER BY rowid')):
            old,new=json.loads(old[0]),json.loads(new[0])
            self.assertEqual([from_context(x) for x in old.get('process_contexts',[])],[from_context(x) for x in new.get('process_contexts',[])])
        self.assertEqual(self.b.execute('SELECT repair_user,repair_comment,repair_time FROM repair_history_3012').fetchall(),self.target.execute('SELECT repair_user,repair_comment,repair_time FROM repair_history_3012').fetchall())

    def test_native_SN_lookup_on_separate_diagnostic_copies_preserves_all_roles(self):
        # lookup calls ensure_schema: never run it on C0/A/B/vault/return target.
        # These two extra copies are disposable; no production source is patched.
        paths=[]
        for label,source in [('before',self.root/'B'/DB),('after',self.root/'return-target'/DB)]:
            dest=Path(self.tmp.name)/(label+'.sqlite3');shutil.copyfile(source,dest);paths.append(dest)
        sources_before={r:FIX['hashes'](self.root/r) for r in ('C0','A','B')}
        for sn in ('P1','P2','M1'):
            self.assertEqual(local_sn.lookup(Store(paths[0]),sn),local_sn.lookup(Store(paths[1]),sn))
        self.assertEqual(sources_before,{r:FIX['hashes'](self.root/r) for r in ('C0','A','B')})
        self.assertTrue(P08['verify_target'](self.root))

    def test_R2_is_STOP_even_if_native_reader_can_still_read_new_evidence(self):
        other=Path(self.tmp.name).resolve()/'P08-SYNTHETIC-NEW';FIX['make'](other,technical=True)
        con=sqlite3.connect(other/'B'/DB)
        try:con.execute("UPDATE repair_history_3012 SET repair_comment='SYNTHETIC POST CANDIDATE EVIDENCE'");con.commit()
        finally:con.close()
        FIX['seal'](other);before=FIX['hashes'](other/'B');result=P08['reconcile'](other)
        self.assertEqual(result['decision'],'R2');self.assertEqual(result['reason'],'NEW_OR_CHANGED_DATABASE')
        self.assertEqual(before,FIX['hashes'](other/'B'));self.assertFalse((other/'return-target').exists())


if __name__=='__main__':unittest.main()
