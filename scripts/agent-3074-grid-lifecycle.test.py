"""Issue #66: 3074 must accept a fresh component-only PCBA result, not a stale grid."""

import json
import subprocess
import sys
import tempfile
import unittest
from contextlib import ExitStack
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
ENGINE = ROOT / "ames" / "factory-engine"
sys.path.insert(0, str(ENGINE))
from ames import tela_3074 as collector  # noqa: E402


NODE = r"""
const vm=require('node:vm'),readline=require('node:readline');
let now=0,plans=[],pending=null,input='',submitted=[],revision=0;
const stores=[];
function store(rows){
  const handlers=new Map();
  const s={rows,loading:false,
    on(n,f){handlers.set(n,[...(handlers.get(n)||[]),f]);},
    un(n,f){handlers.set(n,(handlers.get(n)||[]).filter(v=>v!==f));},
    emit(n,...args){for(const f of [...(handlers.get(n)||[])])f(...args);},
    each(fn){this.rows.forEach(data=>fn({data}));},
    isLoading(){return this.loading;},getCount(){return this.rows.length;},
    getTotalCount(){return this.rows.length;},
    listenerCount(){return [...handlers.values()].reduce((n,v)=>n+v.length,0);}
  }; stores.push(s);return s;
}
const columns=['Barcode','Sn Type','Batch Id','Line Id','Whether to use','Create Time'].map(t=>({text:t,dataIndex:t}));
let current=store([]);
const rectangle={getBoundingClientRect:()=>({width:600,height:300})};
const grid=(id,s)=>({id,columns,getStore:()=>s,el:{dom:rectangle},isVisible:()=>true});
let grids=[grid('3074-grid-1',current)];
const ctx=vm.createContext({});
Object.assign(ctx,{window:ctx,Ext:{ComponentQuery:{query:t=>t==='gridpanel'?grids:[]},getCmp:id=>grids.find(g=>g.id===id)},getComputedStyle:()=>({display:'block',visibility:'visible'})});
function complete(){
  if(!pending)return;
  const p=pending;pending=null;
  if(p.mode==='replace'){
    revision++;current=store(p.rows||[]);grids=[grid('3074-grid-'+(revision+1),current)];return;
  }
  if(p.mode==='rebind'){
    current=store(p.rows||[]);grids=[grid('3074-grid-1',current)];return;
  }
  current.rows=p.rows||[];current.loading=false;
  if(p.mode==='failed')current.emit('load',current,current.rows,false);
  else {current.emit('load',current,current.rows,true);current.emit('datachanged',current);}
}
function handle(r){
  if(r.op==='setup'){plans=r.plans;current.rows=r.rows||[];return true;}
  if(r.op==='eval')return vm.runInContext('('+r.code+')',ctx)(r.arg);
  if(r.op==='fill'){input=r.value;return true;}
  if(r.op==='value')return input;
  if(r.op==='click'){
    const p=plans.shift();submitted.push(input);
    if(p&&p.mode!=='stale'){
      if(p.mode!=='replace'&&p.mode!=='rebind'){
        current.loading=true;current.emit('beforeload',current,{});
      }
      pending={...p,at:now+(p.delay||0)};if(pending.at<=now)complete();
    }
    return true;
  }
  if(r.op==='advance'){now+=r.ms;if(pending&&now>=pending.at)complete();return now;}
  if(r.op==='state')return {submitted,listeners:stores.reduce((n,s)=>n+s.listenerCount(),0)};
  if(r.op==='empty')return current.rows.length===0;
  throw new Error('unsupported '+r.op);
}
readline.createInterface({input:process.stdin}).on('line',l=>{
  try{process.stdout.write(JSON.stringify({result:handle(JSON.parse(l))??null})+'\n');}
  catch(e){process.stdout.write(JSON.stringify({error:String(e.stack||e)})+'\n');}
});
"""


def rows(*sn):
    return [{"Barcode": value, "Sn Type": "Rear Camera", "Batch Id": "B1"} for value in sn]


class Locator:
    def __init__(self, fixture, role):
        self.fixture, self.role, self.first = fixture, role, self

    def count(self):
        return 1

    def click(self, **_):
        if self.role == "button":
            self.fixture.call(op="click")

    def fill(self, value, **_):
        self.fixture.call(op="fill", value=value)

    def input_value(self, **_):
        return self.fixture.call(op="value")

    def inner_text(self, **_):
        return "No data to display" if self.fixture.call(op="empty") else "AWIP3074"


class Fixture:
    url = "http://fixture/AWIP3074"

    def __init__(self, plans, initial=()):
        self.clock = 0
        self.frames = [self]
        self.tmp = tempfile.TemporaryDirectory()
        path = Path(self.tmp.name) / "fixture.cjs"
        path.write_text(NODE, encoding="utf-8")
        self.process = subprocess.Popen(["node", str(path)], stdin=subprocess.PIPE,
                                        stdout=subprocess.PIPE, text=True, encoding="utf-8")
        self.call(op="setup", plans=plans, rows=list(initial))
        self.tela = collector.Tela3074(self, ENGINE)

    def call(self, **kwargs):
        self.process.stdin.write(json.dumps(kwargs) + "\n")
        self.process.stdin.flush()
        reply = json.loads(self.process.stdout.readline())
        if "error" in reply:
            raise RuntimeError(reply["error"])
        return reply["result"]

    def evaluate(self, code, arg=None):
        return self.call(op="eval", code=code, arg=arg)

    def choose_active_page(self, _):
        return self

    def locator(self, _):
        return Locator(self, "input")

    def get_by_role(self, *_args, **_kwargs):
        return Locator(self, "button")

    def advance(self, seconds):
        self.clock += seconds
        self.call(op="advance", ms=seconds * 1000)

    def __enter__(self):
        self.stack = ExitStack()
        self.stack.enter_context(patch.object(collector.time, "time", side_effect=lambda: self.clock))
        self.stack.enter_context(patch.object(collector.time, "sleep", side_effect=self.advance))
        self.stack.enter_context(patch.object(collector.time, "perf_counter_ns", side_effect=lambda: int(self.clock*1e9)))
        return self

    def __exit__(self, *_):
        self.stack.close()
        self.process.stdin.close()
        self.process.wait(timeout=5)
        self.process.stdout.close()
        self.tmp.cleanup()


class RefreshProofTests(unittest.TestCase):
    def test_pcba_query_returns_component_barcodes_without_query_row(self):
        with Fixture([{"rows": rows("CAMERA-1", "LCD-2"), "delay": 210}]) as f:
            result = f.tela.consultar("PCBA-1", timeout_s=.7, retries=1)
            self.assertEqual([r["Barcode"] for r in result["rows"]], ["CAMERA-1", "LCD-2"])
            self.assertEqual(result["query_confirmation"], "STORE_REFRESH_AFTER_VIEW")
            self.assertEqual(f.call(op="state")["listeners"], 0)

    def test_stale_nonmatching_rows_cannot_become_other_pcba_result(self):
        with Fixture([{"mode": "stale"}], initial=rows("OTHER-CAMERA")) as f:
            with self.assertRaisesRegex(RuntimeError, "nao confirmou atualizacao"):
                f.tela.consultar("PCBA-1", timeout_s=.45, retries=1)
            self.assertEqual(f.call(op="state")["listeners"], 0)

    def test_fresh_empty_grid_is_confirmed_zero_only_after_store_load(self):
        with Fixture([{"rows": [], "delay": 100}], initial=rows("STALE")) as f:
            result = f.tela.consultar("PCBA-1", timeout_s=.7, retries=1,
                                      empty_confirm_s=.14, empty_fallback_s=.3)
            self.assertTrue(result["no_data"])
            self.assertEqual(result["query_confirmation"], "STORE_REFRESH_AFTER_VIEW")

    def test_unchanged_empty_grid_is_not_zero(self):
        with Fixture([{"mode": "stale"}]) as f:
            with self.assertRaises(RuntimeError):
                f.tela.consultar("PCBA-1", timeout_s=.45, retries=1,
                                 empty_confirm_s=.05, empty_fallback_s=.12)

    def test_recreated_grid_after_view_with_component_rows(self):
        with Fixture([{"mode": "replace", "rows": rows("CAMERA-2"), "delay": 150}]) as f:
            result = f.tela.consultar("PCBA-1", timeout_s=.7, retries=1)
            self.assertEqual(result["rows"][0]["Barcode"], "CAMERA-2")
            self.assertEqual(f.call(op="state")["listeners"], 0)

    def test_rebound_store_same_grid_id_is_still_fresh(self):
        with Fixture([{"mode": "rebind", "rows": rows("LCD-3"), "delay": 150}]) as f:
            result = f.tela.consultar("PCBA-1", timeout_s=.7, retries=1)
            self.assertEqual(result["rows"][0]["Barcode"], "LCD-3")
            self.assertEqual(f.call(op="state")["listeners"], 0)

    def test_material_sn_direct_query_can_return_pcba_rows_only(self):
        historical = [{"Barcode": "PCBA-OLD", "Sn Type": "PCBA", "Whether to use": "N"},
                      {"Barcode": "PCBA-NOW", "Sn Type": "PCBA", "Whether to use": "Y"}]
        with Fixture([{"rows": historical, "delay": 110}]) as f:
            result = f.tela.consultar("CAMERA-1", timeout_s=.7, retries=1)
            self.assertEqual(collector.pcbas_historicas(result["rows"]), ["PCBA-OLD", "PCBA-NOW"])
            self.assertEqual(result["query_confirmation"], "STORE_REFRESH_AFTER_VIEW")

    def test_failed_load_must_not_confirm_stale_components(self):
        with Fixture([{"mode": "failed", "rows": rows("CAMERA-2"), "delay": 100}]) as f:
            with self.assertRaises(RuntimeError):
                f.tela.consultar("PCBA-1", timeout_s=.45, retries=1)


if __name__ == "__main__":
    unittest.main()
