from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import textwrap
import unittest
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AGENT = ROOT / "ames" / "agent"
sys.path.insert(0, str(AGENT))

import ames_3012_live as collector  # noqa: E402
import repair_3012  # noqa: E402
from store import Store  # noqa: E402


HARNESS = r'''const fs=require('fs'),vm=require('vm');
const querySource=fs.readFileSync(process.argv[2],'utf8');
const scenario=process.argv[3]||'ext-fallback';
function record(data){return {data,getData(){return data}}}
function makeStore(rows=[]){
  const listeners=new Map();
  const store={rows:[...rows],pageSize:100,currentPage:1,loading:false,proxy:{extraParams:{procstep:'x',snImei:'',unDisassemble:false}},
    getProxy(){return this.proxy},getModel(){return {getFields(){return ['lotId','defectCode','defectDesc','repairCode','repairComment','repairTime','repairUser'].map(name=>({name}))}}},
    getAt(i){return this.rows[i]||null},getRange(){return this.rows},getCount(){return this.rows.length},getTotalCount(){return this.rows.length},isLoading(){return this.loading},
    on(n,f){if(!listeners.has(n))listeners.set(n,[]);listeners.get(n).push(f)},un(n,f){listeners.set(n,(listeners.get(n)||[]).filter(x=>x!==f))},
    emit(n,...a){for(const f of [...(listeners.get(n)||[])])f(...a)},
    loadPage(p,{callback}={}){setTimeout(()=>callback?.(this.rows,null,true),5)}
  };return store;
}
function field(itemId,xtype,name=''){
  let value='',raw='';
  return {itemId,xtype,name,hidden:false,isVisible(){return true},isXType(x){return x===xtype},
    setValue(v){value=v;raw=v instanceof Date?`${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}-${String(v.getDate()).padStart(2,'0')} ${String(v.getHours()).padStart(2,'0')}:${String(v.getMinutes()).padStart(2,'0')}`:String(v??'')},
    getValue(){return value},getRawValue(){return raw},setRawValue(v){raw=String(v);value=v},isValid(){return true},fireEvent(){return true},checkChange(){},focus(){},inputEl:{dom:{value:'',dispatchEvent(){}}}};
}
const startParent=field('dteFromDate','udc_datetimefield','fromDate'),startData=field('dteFromDate__Data','hiddenfield','fromDate'),startDate=field('dteFromDate__Date','datefield','_fromDate__Date'),startTime=field('dteFromDate__Time','timefield','_fromDate__Time');
const endParent=field('dteToDate','udc_datetimefield','toDate'),endData=field('dteToDate__Data','hiddenfield','toDate'),endDate=field('dteToDate__Date','datefield','_toDate__Date'),endTime=field('dteToDate__Time','timefield','_toDate__Time');
for(const [parent,data] of [[startParent,startData],[endParent,endData]]){const base=parent.setValue.bind(parent);parent.setValue=v=>{base(v);if(v instanceof Date)data.setValue(`${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}-${String(v.getDate()).padStart(2,'0')} ${String(v.getHours()).padStart(2,'0')}:${String(v.getMinutes()).padStart(2,'0')}:00`);else data.setValue(v)}}
const simpleIds=[['txtSnImei','textfield','snImei'],['cdvDefectType','codeviewfieldx','defectType'],['cdvRepairedCode','codeviewfieldx','repairedCode'],['cdvDepartmentNew','codeviewfieldx','department'],['cdvAreaNew','codeviewfieldx','area'],['cdvLineCodeNew','codeviewfieldx','lineCode'],['cdvProdModel','codeviewfieldx','prodModel'],['cdvDefectCode','codeviewfieldx','defectCode']];
const simple=Object.fromEntries(simpleIds.map(([id,xt,n])=>[id,field(id,xt,n)]));
let activeStore=makeStore([]);
const grid={itemId:'grdDefectRepair',xtype:'gridpanel',hidden:false,isVisible(){return true},getStore(){return activeStore}};
function validDate(){return /^2026-01-24 00:00:00$/.test(String(startData.getValue()))&&/^2026-10-17 23:59:00$/.test(String(endData.getValue()))&&simple.txtSnImei.getValue()==='002527TEST'}
function execute(){
  if(scenario==='stale')return;
  const params={procstep:'x',snImei:simple.txtSnImei.getValue(),fromDate:startData.getValue(),toDate:endData.getValue(),unDisassemble:false};
  const rows=validDate()?[record({lotId:'002527TEST',defectCode:'X1',defectDesc:'x',repairCode:'R1',repairComment:'OK',repairTime:'2026-10-16 12:00:00',repairUser:'AT1'})]:[];
  if(scenario==='rebind'){
    const fresh=makeStore(rows);fresh.proxy.extraParams={...params};activeStore=fresh;
    setTimeout(()=>{fresh.loading=true;fresh.emit('beforeload',fresh,{getParams:()=>params});setTimeout(()=>{fresh.rows=rows;fresh.loading=false;fresh.emit('load',fresh,rows,true);fresh.emit('datachanged',fresh)},90)},20);
  }else{
    const s=activeStore;s.proxy.extraParams={...params};s.loading=true;s.emit('beforeload',s,{getParams:()=>params});setTimeout(()=>{s.rows=rows;s.loading=false;s.emit('load',s,rows,true);s.emit('datachanged',s)},80);
  }
}
const physical={tagName:'A',dispatchEvent(){},click(){if(scenario!=='ext-fallback'&&scenario!=='stale')execute()}};
const view={itemId:'btnView',xtype:'button',text:'View',isButton:true,hidden:false,isVisible(){return true},btnEl:{dom:physical},fireEvent(name){if(name==='click'&&scenario!=='stale')execute();return true},handler(){if(scenario!=='stale')execute()}};
const components=[...Object.values(simple),startParent,startData,startDate,startTime,endParent,endData,endDate,endTime,grid,view];
const ctx=vm.createContext({console,setTimeout,clearTimeout,Date,Promise,JSON,globalThis:null,Event:class{constructor(t,o){this.type=t}},MouseEvent:class{constructor(t,o){this.type=t}},document:{querySelectorAll(){return[]},getElementById(){return null}},window:null});ctx.window=ctx;ctx.globalThis=ctx;ctx.Ext={ComponentManager:{all:{items:components}},ComponentQuery:{query(){return components}}};
(async()=>{try{const fn=vm.runInContext('('+querySource+')',ctx);const out=await fn({sn:'002527TEST',line:'',model:'',defectCode:'',repairCode:'',defectType:'',dateFrom:'2026-01-24',timeFrom:'00:00',dateTo:'2026-10-17',timeTo:'23:59'});console.log(JSON.stringify({ok:true,out}));}catch(e){console.log(JSON.stringify({ok:false,error:String(e?.message||e)}));process.exitCode=0}})();
'''


def run_fixture(scenario: str) -> dict:
    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        query = td / "query.js"
        harness = td / "fixture.cjs"
        query.write_text(collector.QUERY_3012_JS, encoding="utf-8")
        harness.write_text(HARNESS, encoding="utf-8")
        proc = subprocess.run(["node", str(harness), str(query), scenario], text=True, capture_output=True, timeout=10)
        if proc.returncode != 0:
            raise AssertionError(proc.stderr or proc.stdout)
        return json.loads(proc.stdout.strip())


class Runtime3012Tests(unittest.TestCase):
    def test_exact_mapping_and_view_fallback_execute_real_query(self):
        result = run_fixture("ext-fallback")
        self.assertTrue(result["ok"], result)
        out = result["out"]
        self.assertEqual(out["total"], 1)
        self.assertEqual(out["viewAction"], "ext_click_event")
        self.assertEqual(out["gridItemId"], "grdDefectRepair")
        self.assertEqual(out["applied"]["dateFrom"]["time"]["itemId"], "dteFromDate__Time")
        params = out["queryProof"]["requestParams"]
        self.assertEqual(params["snImei"], "002527TEST")
        self.assertEqual(params["fromDate"], "2026-01-24 00:00:00")
        self.assertEqual(params["toDate"], "2026-10-17 23:59:00")

    def test_store_rebind_after_view_is_followed(self):
        result = run_fixture("rebind")
        self.assertTrue(result["ok"], result)
        proof = result["out"]["queryProof"]
        self.assertTrue(proof["storeRebound"])
        self.assertIn(proof["freshness"], {"STORE_LOAD_CONFIRMED", "STORE_DATASET_EVENT", "STORE_REBOUND_AFTER_VIEW"})
        self.assertEqual(result["out"]["total"], 1)

    def test_view_that_never_starts_is_rejected(self):
        result = run_fixture("stale")
        self.assertFalse(result["ok"])
        self.assertIn("3012_VIEW_NOT_EXECUTED", result["error"])

    def test_legacy_false_coverage_does_not_suppress_first_v2_query(self):
        with tempfile.TemporaryDirectory() as td:
            store = Store(Path(td) / "local.sqlite3")
            store.initialize()
            repair_3012.ensure_schema(store)
            start = datetime(2026, 1, 24, 0, 0, 0)
            end = datetime(2026, 10, 17, 23, 59, 59)
            with store.connect() as con:
                con.execute(
                    "INSERT INTO repair_coverage_3012(sn,start_at,end_at,source,completed_at) VALUES(?,?,?,?,?)",
                    ("002527TEST", start.isoformat(timespec="seconds"), end.isoformat(timespec="seconds"), "AWIP3012_HOME_DIRECT_EXTJS", "2026-10-16T12:00:00"),
                )
            gaps = repair_3012.missing_windows(store, "002527TEST", start, end)
            self.assertEqual(gaps, [(start, end)])
            with store.connect() as con:
                con.execute(
                    "INSERT OR REPLACE INTO repair_coverage_3012(sn,start_at,end_at,source,completed_at) VALUES(?,?,?,?,?)",
                    ("002527TEST", start.isoformat(timespec="seconds"), end.isoformat(timespec="seconds"), repair_3012.TRUSTED_COVERAGE_SOURCE, "2026-10-16T12:01:00"),
                )
            self.assertEqual(repair_3012.missing_windows(store, "002527TEST", start, end), [])


if __name__ == "__main__":
    unittest.main()
