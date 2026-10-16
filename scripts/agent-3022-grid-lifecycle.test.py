from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import unittest
from contextlib import ExitStack
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
ENGINE = ROOT / "factory-engine" if (ROOT / "factory-engine").exists() else ROOT / "ames" / "factory-engine"
sys.path.insert(0, str(ENGINE))
from ames import tela_3022 as collector  # noqa: E402

NODE_FIXTURE = r"""
const vm=require('node:vm');const readline=require('node:readline');
let now=0,pending=null,plans=[],submitted=[],value='',generation=0;
const allStores=[];
const rect=v=>({getBoundingClientRect:()=>({width:v?800:0,height:v?300:0})});
function store(rows){const listeners=new Map();const s={rows,loading:false,on(n,f,scope,o){if(!listeners.has(n))listeners.set(n,[]);listeners.get(n).push({f,o});},un(n,f){listeners.set(n,(listeners.get(n)||[]).filter(x=>x.f!==f));},emit(n,...a){for(const x of [...(listeners.get(n)||[])]){x.f(...a);if(x.o?.single)this.un(n,x.f);}},each(f){this.rows.forEach(data=>f({data}));},isLoading(){return this.loading;},getCount(){return this.rows.length;},getTotalCount(){return this.rows.length;},listenerCount(){return [...listeners.values()].reduce((n,a)=>n+a.length,0);}};allStores.push(s);return s;}
const columns=['Hist Seq','Working Oper Code','Working Oper','Current Oper Code','Current Oper','Station','Tran Desc','Tran Time','Tran User Id','Shift','Cutoff Date','Lot Id','TRAN CMF3'].map(text=>({text,dataIndex:text}));
let currentStore=store([]), hiddenStore=store([]);
const grid=(id,s,visible)=>({id,columns,getStore:()=>s,el:{dom:rect(visible)},isVisible:()=>visible});
let grids=[grid('hidden-history',hiddenStore,false),grid('history-0',currentStore,true)];
const input=rect(true);const field={id:'sn-field',inputId:'sn-input',name:'sn',fieldLabel:'SN / IMEI / A-S',inputEl:{dom:input},isVisible:()=>true,getValue:()=>value,getRawValue:()=>value};
const ctx=vm.createContext({});Object.assign(ctx,{window:ctx,document:{getElementById:()=>input},getComputedStyle:()=>({display:'block',visibility:'visible'}),Ext:{ComponentQuery:{query:type=>type==='gridpanel'?grids:[field]},getCmp:id=>grids.find(g=>g.id===id)}});
function finish(){const plan=pending.plan;pending=null;if(plan.mode==='replace'||plan.mode==='rebind'){generation++;const fresh=store(plan.rows||[]);currentStore=fresh;const id=plan.mode==='rebind'?'history-0':'history-'+generation;grids=[grid('hidden-history',hiddenStore,false),grid(id,fresh,true)];return;}if(plan.mode!=='failed'){currentStore.rows=plan.rows||[];currentStore.emit('datachanged',currentStore);currentStore.emit('refresh',currentStore);}currentStore.loading=false;if(plan.mode!=='loadData')currentStore.emit('load',currentStore,currentStore.rows,plan.mode!=='failed');}
function handle(req){if(req.op==='eval')return vm.runInContext(`(${req.code})`,ctx)(req.arg);if(req.op==='setup'){plans=req.plans;currentStore.rows=req.rows||[];hiddenStore.rows=req.hidden||[];return true;}if(req.op==='fill'){value=req.value;return true;}if(req.op==='value')return value;if(req.op==='click'){const plan=plans.shift();submitted.push(value);if(!plan||plan.mode==='stale')return true;if(plan.mode!=='replace'&&plan.mode!=='rebind'&&plan.mode!=='loadData'){currentStore.loading=true;currentStore.emit('beforeload',currentStore,{})}pending={at:now+(plan.delay||0),plan};if(pending.at<=now)finish();return true;}if(req.op==='advance'){now+=req.ms;if(pending&&now>=pending.at)finish();return now;}if(req.op==='state')return {submitted,grids:grids.map(g=>g.id),listeners:allStores.reduce((n,s)=>n+s.listenerCount(),0)};throw Error('unknown op');}
readline.createInterface({input:process.stdin}).on('line',line=>{try{process.stdout.write(JSON.stringify({result:handle(JSON.parse(line))??null})+'\n')}catch(e){process.stdout.write(JSON.stringify({error:e.stack})+'\n')}})
"""


def history_rows(label: str):
    return [{
        "Hist Seq": 1, "Working Oper Code": "A5162", "Working Oper": "Camera inspection",
        "Current Oper Code": "A5201", "Current Oper": "Assembly", "Station": "A5162",
        "Tran Desc": "END LOT", "Tran Time": "2026-10-16 10:00:00", "Tran User Id": label,
        "Shift": "DAY", "Cutoff Date": "2026-10-16", "Lot Id": "", "TRAN CMF3": "raw preserved",
    }]


class Locator:
    def __init__(self, fixture, kind):
        self.fixture, self.kind, self.first = fixture, kind, self
    def count(self): return 0 if self.kind == "table" else 1
    def is_visible(self, **kwargs): return True
    def wait_for(self, **kwargs): pass
    def fill(self, value, **kwargs): self.fixture.call(op="fill", value=value)
    def input_value(self, **kwargs): return self.fixture.call(op="value")
    def click(self, **kwargs): self.fixture.call(op="click")
    def inner_text(self, **kwargs): return "AWIP3022 View Lot History"


class Fixture:
    url = "http://fixture/AWIP3022/VwViewLotHistoryView"
    def __init__(self, plans, rows=()):
        self.clock = 0.0
        self.frames = [self]
        self.tmp = tempfile.TemporaryDirectory()
        script = Path(self.tmp.name) / "fixture.cjs"
        script.write_text(NODE_FIXTURE, encoding="utf-8")
        self.process = subprocess.Popen(["node", str(script)], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, encoding="utf-8")
        self.call(op="setup", plans=plans, rows=list(rows), hidden=[])
        self.tela = collector.Tela3022(self, ENGINE)
    def call(self, **message):
        self.process.stdin.write(json.dumps(message) + "\n"); self.process.stdin.flush()
        response = json.loads(self.process.stdout.readline())
        if "error" in response: raise RuntimeError(response["error"])
        return response["result"]
    def evaluate(self, code, arg=None): return self.call(op="eval", code=code, arg=arg)
    def locator(self, selector): return Locator(self, "table" if selector == "table" else "input")
    def get_by_role(self, *args, **kwargs): return Locator(self, "button")
    def choose_active_page(self, hint): return self
    def connect(self): return self
    def disconnect(self): pass
    def advance(self, seconds): self.clock += seconds; self.call(op="advance", ms=seconds * 1000)
    def __enter__(self):
        self.stack = ExitStack()
        for name in ("time", "perf_counter"):
            self.stack.enter_context(patch.object(collector.time, name, side_effect=lambda: self.clock))
        self.stack.enter_context(patch.object(collector.time, "perf_counter_ns", side_effect=lambda: int(self.clock * 1e9)))
        self.stack.enter_context(patch.object(collector.time, "sleep", side_effect=self.advance))
        return self
    def __exit__(self, *args):
        self.stack.close(); self.process.stdin.close(); self.process.wait(timeout=5); self.process.stdout.close(); self.tmp.cleanup()


class GridLifecycleRegressionTests(unittest.TestCase):
    def test_recreated_grid_after_view_is_accepted_and_old_store_listener_is_cleaned(self):
        with Fixture([{"rows": history_rows("NEW"), "delay": 240, "mode": "replace"}]) as f:
            result = f.tela.consultar("B", timeout_s=.8, empty_confirm_s=.2)
            self.assertEqual(result["rows"][0]["Tran User Id"], "NEW")
            self.assertEqual(result["query_diagnostics"]["confirmation"], "GRID_REPLACED_AFTER_VIEW")
            self.assertEqual(f.call(op="state")["listeners"], 0)

    def test_same_grid_with_rebound_store_is_accepted(self):
        with Fixture([{"rows": history_rows("NEW"), "delay": 240, "mode": "rebind"}]) as f:
            result = f.tela.consultar("B", timeout_s=.8, empty_confirm_s=.2)
            self.assertEqual(result["rows"][0]["Tran User Id"], "NEW")
            self.assertEqual(result["query_diagnostics"]["confirmation"], "STORE_REBOUND_AFTER_VIEW")
            self.assertEqual(f.call(op="state")["listeners"], 0)

    def test_stale_same_binding_is_still_rejected(self):
        with Fixture([{"mode": "stale"}], rows=history_rows("OLD")) as f:
            with self.assertRaisesRegex(RuntimeError, "não confirmou atualização"):
                f.tela.consultar("B", timeout_s=.5, empty_confirm_s=.1)
            self.assertFalse(f.tela.last_query_diagnostics["refresh_proven"])
            self.assertEqual(f.call(op="state")["listeners"], 0)


if __name__ == "__main__":
    unittest.main()
