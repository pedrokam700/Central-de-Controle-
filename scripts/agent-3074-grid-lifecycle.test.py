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
const stores=[],pageCalls=[];
function store(rows){
  const handlers=new Map();
  const s={rows,loading:false,
    getProxy(){return {extraParams:this.extraParams||{}};},
    loadPage(n,options){
      pageCalls.push({page:n,params:options.params});
      const p=(this.pagePlans||[])[n-2]||{mode:'failed'};
      this.loading=true;this.emit('beforeload',this,{page:n});
      if(p.mode==='timeout')return;
      if(p.mode==='input_changed')input='OTHER-QUERY';
      if(p.mode==='params_changed')this.lastOptions.params.custom='changed';
      if(p.mode==='store_changed')grids=[grid('3074-grid-1',store([]))];
      this.currentPage=n;this.rows=p.rows||[];
      if(p.total!==undefined)this.total=p.total;
      this.loading=false;const success=p.mode!=='failed';
      this.emit('load',this,this.rows,success);
      options.callback(this.rows.map(data=>({data})),{page:p.wrongPage||n,params:options.params},success);
    },
    on(n,f){handlers.set(n,[...(handlers.get(n)||[]),f]);},
    un(n,f){handlers.set(n,(handlers.get(n)||[]).filter(v=>v!==f));},
    emit(n,...args){for(const f of [...(handlers.get(n)||[])])f(...args);},
    each(fn){this.rows.forEach(data=>fn({data}));},
    isLoading(){return this.loading;},getCount(){return this.rows.length;},
    getTotalCount(){return this.total??this.rows.length;},
    listenerCount(){return [...handlers.values()].reduce((n,v)=>n+v.length,0);}
  }; stores.push(s);return s;
}
const columns=['Barcode','Sn Type','Batch Id','Line Id','Whether to use','Create Time','Operation'].map(t=>({text:t,dataIndex:t}));
let current=store([]);
const rectangle={getBoundingClientRect:()=>({width:600,height:300})};
const grid=(id,s)=>({id,columns,getStore:()=>s,el:{dom:rectangle},isVisible:()=>true});
let grids=[grid('3074-grid-1',current)];
const ctx=vm.createContext({});
Object.assign(ctx,{window:ctx,Ext:{ComponentQuery:{query:t=>t==='gridpanel'?grids:[]},getCmp:id=>grids.find(g=>g.id===id)},setTimeout,clearTimeout,document:{querySelector:()=>({get value(){return input;}})},getComputedStyle:()=>({display:'block',visibility:'visible'})});
function complete(){
  if(!pending)return;
  const p=pending;pending=null;
  if(p.mode==='replace'){
    revision++;current=store(p.rows||[]);grids=[grid('3074-grid-'+(revision+1),current)];return;
  }
  if(p.mode==='rebind'){
    current=store(p.rows||[]);grids=[grid('3074-grid-1',current)];return;
  }
  current.rows=p.rows||[];current.total=p.total;current.loading=false;
  if(p.paging){current.pageSize=p.pageSize||1;current.currentPage=p.currentPage||1;
    current.lastOptions={params:{sn:p.query||input,start:0,limit:current.pageSize,custom:'keep'}};
    current.pagePlans=p.pages||[];current.buffered=p.buffered||false;}
  if(p.mode==='failed')current.emit('load',current,current.rows,false);
  else if(p.mode==='loadData')current.emit('datachanged',current);
  else {current.emit('load',current,current.rows,true);current.emit('datachanged',current);}
}
function handle(r){
  if(r.op==='setup'){plans=r.plans;current.rows=r.rows||[];if(r.previous){current.loading=true;pending={...r.previous,at:r.previous.delay};}return true;}
  if(r.op==='eval')return vm.runInContext('('+r.code+')',ctx)(r.arg);
  if(r.op==='fill'){input=r.value;return true;}
  if(r.op==='value')return input;
  if(r.op==='click'){
    const p=plans.shift();submitted.push(input);
    if(p&&p.mode!=='stale'){
      if(p.mode!=='replace'&&p.mode!=='rebind'&&p.mode!=='loadData'){
        current.loading=true;current.emit('beforeload',current,{});
      }
      pending={...p,at:now+(p.delay||0)};if(pending.at<=now)complete();
    }
    return true;
  }
  if(r.op==='advance'){now+=r.ms;if(pending&&now>=pending.at)complete();return now;}
  if(r.op==='state')return {submitted,pageCalls,listeners:stores.reduce((n,s)=>n+s.listenerCount(),0)};
  if(r.op==='empty')return current.rows.length===0;
  throw new Error('unsupported '+r.op);
}
readline.createInterface({input:process.stdin}).on('line',async l=>{
  try{process.stdout.write(JSON.stringify({result:(await handle(JSON.parse(l)))??null})+'\n');}
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

    def __init__(self, plans, initial=(), previous=None):
        self.clock = 0
        self.frames = [self]
        self.tmp = tempfile.TemporaryDirectory()
        path = Path(self.tmp.name) / "fixture.cjs"
        path.write_text(NODE, encoding="utf-8")
        self.process = subprocess.Popen(["node", str(path)], stdin=subprocess.PIPE,
                                        stdout=subprocess.PIPE, text=True, encoding="utf-8")
        self.call(op="setup", plans=plans, rows=list(initial), previous=previous)
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

    def test_stale_rows_with_same_query_sn_still_require_refresh(self):
        with Fixture([{"mode": "stale"}], initial=rows("PCBA-1")) as f:
            with self.assertRaises(RuntimeError):
                f.tela.consultar("PCBA-1", timeout_s=.45, retries=1)

    def test_local_store_datachanged_after_view_can_prove_fresh_rows(self):
        with Fixture([{"mode": "loadData", "rows": rows("CAMERA-LOCAL"), "delay": 110}]) as f:
            result = f.tela.consultar("PCBA-1", timeout_s=.7, retries=1)
            self.assertEqual(result["rows"][0]["Barcode"], "CAMERA-LOCAL")

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

    def test_reported_pagination_total_survives_query_result(self):
        with Fixture([{"rows": rows("CAMERA-1"), "total": 4}]) as f:
            result = f.tela.consultar("PCBA-1", timeout_s=.7, retries=1)
            self.assertEqual(result.get("store_total_count"), 4)
            self.assertEqual(result["coverage"]["status"], "incomplete_page")
            self.assertEqual(result["coverage"]["returned"], 1)
            self.assertEqual(len(result["rows"]), 1, "keep observed rows")

    def test_reported_total_smaller_than_visible_grid_keeps_rows_but_not_completion(self):
        with Fixture([{"rows": rows("CAMERA-1", "LCD-2"), "total": 1}]) as f:
            result = f.tela.consultar("PCBA-1", timeout_s=.7, retries=1)
            self.assertEqual(len(result["rows"]), 2)
            self.assertFalse(result["no_data"])
            self.assertEqual(result["coverage"]["status"], "incomplete_page")
            self.assertEqual(result["coverage"]["reason"], "extjs_store_total_below_loaded_rows")
            self.assertEqual(result["pagination"]["status"], "partial")
            self.assertEqual(f.call(op="state")["listeners"], 0)

    def test_empty_page_with_positive_total_is_partial_not_no_data(self):
        with Fixture([{"rows": [], "total": 4}]) as f:
            result = f.tela.consultar("PCBA-1", timeout_s=.7, retries=1,
                                      empty_confirm_s=.05, empty_fallback_s=.12)
            self.assertFalse(result["no_data"])
            self.assertEqual(result["coverage"]["status"], "incomplete_page")

    def test_collects_supported_pages_without_losing_query_parameters(self):
        plan={"rows":rows("M1"),"total":3,"paging":True,
              "pages":[{"rows":rows("M2")},{"rows":rows("M3")}]}
        with Fixture([plan]) as f:
            result=f.tela.consultar("PCBA-1",timeout_s=.7,retries=1)
            self.assertEqual([r["Barcode"] for r in result["rows"]],["M1","M2","M3"])
            self.assertEqual(result["coverage"]["status"],"returned")
            self.assertEqual(result["pagination"]["completed_pages"],[1,2,3])
            self.assertEqual([v["page"] for v in f.call(op="state")["pageCalls"]],[2,3])
            self.assertTrue(all(v["params"]=={"sn":"PCBA-1","custom":"keep"} for v in f.call(op="state")["pageCalls"]))
            self.assertEqual(f.call(op="state")["listeners"],0)

    def test_kit_rows_keep_same_physical_sn_at_different_operations(self):
        first=[{**rows("KIT-SN")[0],"Operation":"A1"}]
        second=[{**rows("KIT-SN")[0],"Operation":"A2"}]
        with Fixture([{"rows":first,"total":2,"paging":True,"pages":[{"rows":second}]}]) as f:
            result=f.tela.consultar("PCBA-1",timeout_s=.7,retries=1)
            self.assertEqual(len(result["rows"]),2)
            self.assertEqual(len(collector.componentes_serializados(result["rows"],"PCBA-1")),1)
            self.assertEqual(result["coverage"]["status"],"returned")

    def test_page_failure_preserves_confirmed_previous_pages(self):
        plan={"rows":rows("M1"),"total":3,"paging":True,
              "pages":[{"rows":rows("M2")},{"mode":"failed"}]}
        with Fixture([plan]) as f:
            result=f.tela.consultar("PCBA-1",timeout_s=.7,retries=1)
            self.assertEqual([r["Barcode"] for r in result["rows"]],["M1","M2"])
            self.assertEqual(result["coverage"]["status"],"incomplete_page")
            self.assertEqual(result["pagination"]["reason"],"page_load_failed")
            self.assertFalse(result["no_data"])

    def test_unconfirmed_query_or_page_never_advances(self):
        for patch,reason in [({"query":"OTHER"},"query_parameters_unconfirmed"),
                             ({"currentPage":2},"first_page_unconfirmed"),
                             ({"buffered":True},"unsupported_store"),
                             ({"total":1001},"pagination_limit")]:
            with self.subTest(reason=reason),Fixture([{"rows":rows("M1"),"total":3,"paging":True,**patch}]) as f:
                result=f.tela.consultar("PCBA-1",timeout_s=.7,retries=1)
                self.assertEqual(result["pagination"]["reason"],reason)
                self.assertEqual(f.call(op="state")["pageCalls"],[])
                self.assertEqual(result["coverage"]["status"],"incomplete_page")

    def test_changed_total_input_or_repeated_page_never_becomes_complete(self):
        for page,reason in [({"rows":rows("M1")},"repeated_page"),
                            ({"rows":rows("M2"),"total":4},"total_changed"),
                            ({"rows":rows("M2"),"mode":"input_changed"},"query_changed"),
                            ({"rows":rows("M2"),"mode":"params_changed"},"query_changed"),
                            ({"rows":rows("M2"),"mode":"store_changed"},"store_changed"),
                            ({"rows":rows("M2"),"wrongPage":4},"page_identity_unconfirmed"),
                            ({"rows":[]},"page_count_mismatch")]:
            with self.subTest(reason=reason),Fixture([{"rows":rows("M1"),"total":2,"paging":True,"pages":[page]}]) as f:
                result=f.tela.consultar("PCBA-1",timeout_s=.7,retries=1)
                self.assertEqual(result["coverage"]["status"],"incomplete_page")
                self.assertEqual(result["pagination"]["reason"],reason)
                self.assertEqual([r["Barcode"] for r in result["rows"]],["M1"])

    def test_page_timeout_retains_partial_rows_and_pending_store_barrier(self):
        with Fixture([{"rows":rows("M1"),"total":2,"paging":True,"pages":[{"mode":"timeout"}]}]) as f:
            result=f.tela.consultar("PCBA-1",timeout_s=.05,retries=1)
            self.assertEqual(result["pagination"]["reason"],"page_timeout")
            self.assertEqual(result["coverage"]["status"],"incomplete_page")
            with self.assertRaisesRegex(RuntimeError,"3074_PREVIOUS_QUERY_PENDING"):
                f.tela.consultar("PCBA-2",timeout_s=.05,retries=1)

    def test_previous_inflight_response_cannot_confirm_next_query(self):
        # View can be ignored by the MES while its previous request is pending.
        # A subsequent successful load then belongs to the OLD query.
        with Fixture([{"mode": "stale"}], initial=rows("OLD-CAMERA"),
                     previous={"rows": rows("OLD-CAMERA"), "delay": 100}) as f:
            with self.assertRaisesRegex(RuntimeError, "3074_PREVIOUS_QUERY_PENDING"):
                f.tela.consultar("PCBA-NEW", timeout_s=.45, retries=1)
            self.assertEqual(f.call(op="state")["submitted"], [])
            self.assertEqual(f.call(op="state")["listeners"], 0)

    def test_retry_after_previous_load_ends_requires_its_own_view(self):
        with Fixture([{"rows": rows("NEW-CAMERA"), "delay": 100}],
                     previous={"rows": rows("OLD-CAMERA"), "delay": 100}) as f:
            result = f.tela.consultar("PCBA-NEW", timeout_s=.45, retries=2)
            self.assertEqual(result["attempt"], 2)
            self.assertEqual(result["rows"][0]["Barcode"], "NEW-CAMERA")
            self.assertEqual(f.call(op="state")["submitted"], ["PCBA-NEW"])
            self.assertEqual(f.call(op="state")["listeners"], 0)

    def test_failed_load_must_not_confirm_stale_components(self):
        with Fixture([{"mode": "failed", "rows": rows("CAMERA-2"), "delay": 100}]) as f:
            with self.assertRaises(RuntimeError):
                f.tela.consultar("PCBA-1", timeout_s=.45, retries=1)


if __name__ == "__main__":
    unittest.main()
