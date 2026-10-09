import hashlib
import importlib.util
import json
import pathlib
import shutil
import sys
import tempfile
import threading
import unittest
import urllib.request
from http.server import ThreadingHTTPServer
from unittest.mock import patch
from types import SimpleNamespace

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'ames' / 'agent'))
from mes_scheduler import MesScheduler, Cancelled, MonitorSkipped, MES, session_object


class SchedulerTests(unittest.TestCase):
    def test_fifo_and_no_overlap(self):
        gate = MesScheduler(); entered = threading.Event(); release = threading.Event(); order = []
        def first():
            with gate.critical(): entered.set(); release.wait(3)
        owner = threading.Thread(target=first); owner.start(); self.assertTrue(entered.wait(2))
        threads=[]
        for n in range(8):
            queued=threading.Event()
            def work(n=n, queued=queued):
                with gate.job(status=lambda state: queued.set() if state=='waiting_mes' else None):
                    with gate.critical():
                        self.assertEqual(gate.owner is not None, True); order.append(n)
                        # Reentrant view methods do not deadlock.
                        with gate.critical(): self.assertEqual(order[-1],n)
            t=threading.Thread(target=work); t.start(); threads.append(t); self.assertTrue(queued.wait(2))
        self.assertEqual(gate.snapshot()['queued'],8)
        release.set();owner.join(2)
        for t in threads: t.join(2);self.assertFalse(t.is_alive())
        self.assertEqual(order,list(range(8))); self.assertFalse(gate.snapshot()['busy'])

    def test_exception_success_and_cancellation_release(self):
        gate=MesScheduler()
        for error in [RuntimeError('failed'), Cancelled()]:
            with self.assertRaises(type(error)):
                with gate.critical(): raise error
            self.assertFalse(gate.snapshot()['busy'])
        token=threading.Event()
        with self.assertRaises(Cancelled):
            with gate.job(token=token):
                with gate.critical(): token.set()
        with gate.critical(): self.assertTrue(gate.snapshot()['busy'])
        self.assertFalse(gate.snapshot()['busy'])

    def test_cancel_waiter_does_not_release_owner(self):
        gate=MesScheduler(); token=threading.Event(); queued=threading.Event(); stopped=threading.Event()
        def waiting():
            try:
                with gate.job(token=token,status=lambda _:queued.set()):
                    with gate.critical(): self.fail('cancelled entered')
            except Cancelled: stopped.set()
        with gate.critical():
            t=threading.Thread(target=waiting);t.start();self.assertTrue(queued.wait(2))
            token.set();gate.wake();self.assertTrue(stopped.wait(2));self.assertTrue(gate.snapshot()['busy'])
        t.join(2);self.assertEqual(gate.snapshot()['queued'],0)

    def test_monitor_atomic_admission_no_backlog_and_nonmes_parallel(self):
        gate=MesScheduler(); worked=threading.Event()
        with gate.critical():
            for _ in range(1000):self.assertIsNone(gate.reserve_monitor())
            threading.Thread(target=lambda: worked.set()).start();self.assertTrue(worked.wait(1))
            self.assertEqual(gate.snapshot()['queued'],0)
        reservation=gate.reserve_monitor();self.assertIsNotNone(reservation)
        with gate.job(monitor=True,reservation=reservation):
            with gate.critical():self.assertTrue(gate.snapshot()['busy'])
        self.assertFalse(gate.snapshot()['busy'])

    def test_proxy_limits_lock_to_mes_call_and_cleanup_after_cancel(self):
        token=threading.Event(); seen=[]
        class FakeView:
            def consultar(self):seen.append(MES.snapshot()['busy']);return {'rows':[]}
            def disconnect(self):seen.append(MES.snapshot()['busy'])
        view=session_object(FakeView())
        with self.assertRaises(Cancelled):
            with MES.job(token=token):
                view.consultar();self.assertFalse(MES.snapshot()['busy'])
                token.set();view.disconnect()
        self.assertEqual(seen,[True,True]);self.assertFalse(MES.snapshot()['busy'])

    def test_3028_bytes_unchanged(self):
        expected={'ames_3028.py':'829da91ba7b685f4594bae2aad737f1eea64d7b1eaa8073e8bb263748fbe1ca1',
            'ames_3028_live.py':'b512d42ad39fad326252264ce57f98f3731db5161ab8625cf5b244dffffad0e2'}
        for name,digest in expected.items():self.assertEqual(hashlib.sha256((ROOT/'ames'/'agent'/name).read_bytes()).hexdigest(),digest)

    def test_bridge_deep_real_orchestration_keeps_transforms_outside_gate(self):
        import engine_bridge
        seen=[]; pauses=[]
        def touched(name):
            self.assertTrue(MES.snapshot()['busy'],name);seen.append(name)
        class Browser:
            def __init__(self,*args):pass
            def connect(self):touched('connect');return self
            def disconnect(self):touched('disconnect')
        class Navigation:
            def __init__(self,*args):pass
            def ensure_3074(self):touched('nav3074')
            def ensure_2114(self):touched('nav2114');return 'page'
            def ensure_current_shift_2114(self,*args):touched('shift');return 'A'
        class View:
            def __init__(self,*args):pass
            def _page(self):touched('page')
            def turno_atual(self):touched('turno');return 'A'
            def consultar(self,sn):touched('query');return {'rows':[]}
        def flow(source,parsed,view,**kw):
            self.assertFalse(MES.snapshot()['busy']);view.consultar('P');self.assertFalse(MES.snapshot()['busy']);pauses.append(kw['pause_s']);return {'source_sha256':'hash'}
        def history(result,view,**kw):
            self.assertFalse(MES.snapshot()['busy']);view.consultar('P');self.assertFalse(MES.snapshot()['busy']);pauses.append(kw['pause_s']);return {'pcbas':[]}
        modules={'ames.browser':SimpleNamespace(AmesBrowser=Browser),'ames.navigation':SimpleNamespace(AmesNavigation=Navigation),'ames.tela_3074':SimpleNamespace(Tela3074=View),'ames.tela_2114':SimpleNamespace(Tela2114=View),'core.fluxo_3028_3074':SimpleNamespace(executar_fluxo=flow),'core.fluxo_2114':SimpleNamespace(executar_fluxo_2114=history)}
        with tempfile.TemporaryDirectory() as tmp,patch.object(engine_bridge.importlib,'import_module',side_effect=modules.__getitem__):
            for profile in ['fast','balanced','safe']:
                result=engine_bridge.run_deep_v016_records(pathlib.Path(tmp),[{'pcba_sn':'P'}],'test',tmp,performance=profile)
                self.assertEqual(result['version'],'0.16-live')
        self.assertEqual(pauses,[0,0,.03,.03,.12,.12]);self.assertEqual(seen.count('disconnect'),3)
        self.assertFalse(MES.snapshot()['busy'])

    def test_monitor_reservation_released_before_first_call_error_and_callback_error(self):
        gate=MesScheduler();ticket=gate.reserve_monitor()
        with self.assertRaises(ValueError):
            with gate.job(monitor=True,reservation=ticket):raise ValueError('preflight')
        self.assertFalse(gate.snapshot()['busy'])
        with self.assertRaises(ValueError):
            with gate.job(status=lambda _: (_ for _ in ()).throw(ValueError('status'))):
                with gate.critical():pass
        self.assertFalse(gate.snapshot()['busy']);self.assertEqual(gate.snapshot()['queued'],0)

    def test_actual_agent_jobs_monitor_endpoints_and_sqlite_parallel(self):
        with tempfile.TemporaryDirectory() as tmp:
            target=pathlib.Path(tmp)/'agent.py';shutil.copyfile(ROOT/'ames'/'agent'/'agent.py',target)
            spec=importlib.util.spec_from_file_location('test_agent',target);agent=importlib.util.module_from_spec(spec);spec.loader.exec_module(agent)
            entered=threading.Event();release=threading.Event()
            def fake_collect(**kw):
                self.assertTrue(MES.snapshot()['busy']);entered.set();release.wait(3);return {'lines':[]}
            agent.collect_live_3028=__import__('mes_scheduler').mes_call(fake_collect)
            with patch.object(agent,'_tcp_probe',return_value=True):
                job=agent.start_job({'start_at':'2026-10-09T07:00','end_at':'2026-10-09T08:00','lines':['TAN10101']})
                self.assertTrue(entered.wait(2))
                for _ in range(30):self.assertIsNone(agent.start_job({},monitor=True))
                self.assertEqual(len(agent.JOBS),1)
                with agent.STORE.connect() as con:self.assertEqual(con.execute('SELECT COUNT(*) FROM jobs').fetchone()[0],1)
                server=ThreadingHTTPServer(('127.0.0.1',0),agent.Handler)
                thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
                try:
                    url=f'http://127.0.0.1:{server.server_port}/api/v1'
                    with urllib.request.urlopen(url+'/health') as r:health=json.load(r)
                    self.assertEqual(health['mes_scheduler']['policy'],'fifo-monitor-skip-v1')
                    with urllib.request.urlopen(url+'/jobs/'+job['id']) as r:status=json.load(r)
                    self.assertEqual(status['kind'],'analysis');self.assertEqual(status['status'],'running')
                    with urllib.request.urlopen(urllib.request.Request(url+'/jobs/'+job['id']+'/cancel',data=b'{}',headers={'Content-Type':'application/json'})) as r:self.assertTrue(json.load(r)['cancel_requested'])
                    release.set()
                    with MES.condition:
                        MES.condition.wait_for(lambda: MES.owner is None,timeout=3)
                    self.assertFalse(MES.snapshot()['busy'])
                finally:release.set();server.shutdown();server.server_close();thread.join(2)
            self.assertEqual(agent.JOBS[job['id']]['status'],'cancelled')


if __name__=='__main__':unittest.main()
