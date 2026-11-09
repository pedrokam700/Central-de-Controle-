from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import textwrap
import unittest
from datetime import datetime
from pathlib import Path
from urllib.parse import urlencode

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
for(const [parent,data] of [[startParent,startData],[endParent,endData]]){const base=parent.setValue.bind(parent);parent.setValue=v=>{base(v);if(scenario==='backing-empty')return;if(v instanceof Date)data.setValue(`${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}-${String(v.getDate()).padStart(2,'0')} ${String(v.getHours()).padStart(2,'0')}:${String(v.getMinutes()).padStart(2,'0')}:00`);else data.setValue(v)}}
const simpleIds=[['txtSnImei','textfield','snImei'],['cdvDefectType','codeviewfieldx','defectType'],['cdvRepairedCode','codeviewfieldx','repairedCode'],['cdvDepartmentNew','codeviewfieldx','department'],['cdvAreaNew','codeviewfieldx','area'],['cdvLineCodeNew','codeviewfieldx','lineCode'],['cdvProdModel','codeviewfieldx','prodModel'],['cdvDefectCode','codeviewfieldx','defectCode']];
const simple=Object.fromEntries(simpleIds.map(([id,xt,n])=>[id,field(id,xt,n)]));
let activeStore=makeStore([]);
const ajaxListeners=new Map();
const ajax={on(name,fn){ajaxListeners.set(name,fn)},un(name,fn){if(ajaxListeners.get(name)===fn)ajaxListeners.delete(name)},
  emit(options){ajaxListeners.get('beforerequest')?.(ajax,options)}};
const grid={itemId:'grdDefectRepair',xtype:'gridpanel',hidden:false,isVisible(){return true},getStore(){return activeStore}};
function validDate(){return /^2026-01-24 00:00:00$/.test(String(startData.getValue()))&&/^2026-10-17 23:59:00$/.test(String(endData.getValue()))&&simple.txtSnImei.getValue()==='002527TEST'}
function execute(){
  if(scenario==='stale')return;
  const params={procstep:'x',snImei:simple.txtSnImei.getValue(),fromDate:startData.getValue(),toDate:endData.getValue(),unDisassemble:false};
  if(scenario==='proxy-only'){activeStore.proxy.extraParams={...params};return;}
  const ajaxForm=scenario==='ajax-form-serialized'||scenario==='ajax-form-dom'||scenario==='ajax-form-dom-wrong-period'||scenario==='ajax-wrong-period'||scenario==='ajax-unrelated-sn';
  const before=ajaxForm||scenario==='wire-fallback'?{procstep:'x',snImei:simple.txtSnImei.getValue()}:
    scenario==='store-no-sn'?{fromDate:startData.getValue(),toDate:endData.getValue()}:params;
  if(ajaxForm){
    const dates=scenario==='ajax-wrong-period'||scenario==='ajax-form-dom-wrong-period'
      ?{'dteFromDate__Data':'2026-01-24 00:00:00','dteToDate__Data':'2026-03-31 23:59:00'}
      :{'dteFromDate__Data':startData.getValue(),'dteToDate__Data':endData.getValue()};
    const formFields=[{name:'snImei',value:scenario==='ajax-unrelated-sn'?'DIFFERENT-PCBA':simple.txtSnImei.getValue()},
      ...Object.entries(dates).map(([name,value])=>({name,value})),{name:'password',value:'must-not-leak'}];
    if(scenario.startsWith('ajax-form-dom'))ajax.emit({form:{dom:{elements:formFields}}});
    else ajax.emit({params:{queryCondition:JSON.stringify({filters:formFields.filter(f=>f.name!=='password')})}});
  }
  const rows=validDate()?[record({lotId:'002527TEST',defectCode:'X1',defectDesc:'x',repairCode:'R1',repairComment:'OK',repairTime:'2026-10-16 12:00:00',repairUser:'AT1'})]:[];
  if(scenario==='rebind'){
    const fresh=makeStore(rows);fresh.proxy.extraParams={...params};activeStore=fresh;
    setTimeout(()=>{fresh.loading=true;fresh.emit('beforeload',fresh,{getParams:()=>before});setTimeout(()=>{fresh.rows=rows;fresh.loading=false;fresh.emit('load',fresh,rows,true);fresh.emit('datachanged',fresh)},90)},20);
  }else{
    const s=activeStore;s.proxy.extraParams={...before};s.loading=true;s.emit('beforeload',s,{getParams:()=>before});setTimeout(()=>{s.rows=rows;s.loading=false;s.emit('load',s,rows,true);s.emit('datachanged',s)},80);
  }
}
const physical={tagName:'A',dispatchEvent(){},click(){if(scenario!=='ext-fallback'&&scenario!=='stale')execute()}};
const view={itemId:'btnView',xtype:'button',text:'View',isButton:true,hidden:false,isVisible(){return true},btnEl:{dom:physical},fireEvent(name){if(name==='click'&&scenario!=='stale')execute();return true},handler(){if(scenario!=='stale')execute()}};
const components=[...Object.values(simple),startParent,startData,startDate,startTime,endParent,endData,endDate,endTime,grid,view];
const ctx=vm.createContext({console,setTimeout,clearTimeout,Date,Promise,JSON,globalThis:null,Event:class{constructor(t,o){this.type=t}},MouseEvent:class{constructor(t,o){this.type=t}},document:{querySelectorAll(){return[]},getElementById(){return null}},window:null});ctx.window=ctx;ctx.globalThis=ctx;ctx.Ext={ComponentManager:{all:{items:components}},ComponentQuery:{query(){return components}}};
(async()=>{try{ctx.Ext.Ajax=ajax;const fn=vm.runInContext('('+querySource+')',ctx);const out=await fn({sn:'002527TEST',line:'',model:'',defectCode:'',repairCode:'',defectType:'',dateFrom:'2026-01-24',timeFrom:'00:00',dateTo:'2026-10-17',timeTo:'23:59',allowWirePeriodProof:scenario==='wire-fallback'});console.log(JSON.stringify({ok:true,out}));}catch(e){console.log(JSON.stringify({ok:false,error:String(e?.message||e)}));process.exitCode=0}})();
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
    def test_real_wire_date_shapes_distinguish_blank_epoch_and_unrecognized(self):
        expected = {'from':'2026-01-01 00:00','to':'2026-11-09 23:59'}

        class Request:
            url = 'http://172.29.185.215/asymes/home'
            resource_type = 'xhr'
            method = 'POST'
            def __init__(self, left, right):
                self.post_data = urlencode({'snImei':'002527TEST',
                                            'fromDate':left,'toDate':right,'start':0})

        outputs=[]
        for left, right in [('', ''), ('1762128000000', '1794268740000'),
                            ('1/1/2026', '9/11/2026')]:
            probe=collector.Wire3012Probe('172.29.185.215','002527TEST',expected)
            probe.on_request(Request(left,right))
            result=probe.counters()
            self.assertEqual((result['http'],result['sn'],result['dates'],result['period']), (1,1,0,0))
            self.assertEqual((result['from_text'],result['to_text']),(0,0))
            outputs.append(tuple(result['date_shapes']))
        self.assertEqual(len(set(outputs)),3,
                         'Diagnostic must distinguish the physical failure classes')
        self.assertTrue(any('empty' in v for v in outputs[0]))
        self.assertTrue(any('numeric_timestamp' in v for v in outputs[1]))
        self.assertTrue(any('br_day_only' in v for v in outputs[2]))

    def test_http_wire_rejects_conflicting_url_and_body_periods(self):
        expected={'from':'2026-01-01 00:00','to':'2026-11-09 23:59'}
        probe=collector.Wire3012Probe('172.29.185.215','002527TEST',expected)
        class Request:
            resource_type='xhr'
            method='POST'
            url='http://172.29.185.215/asymes/home?'+urlencode({
                'snImei':'002527TEST','fromDate':expected['from'],'toDate':expected['to']})
            post_data=urlencode({'snImei':'002527TEST','fromDate':'', 'toDate':''})
        req=Request()
        probe.on_request(req)
        class Response:
            status=200
            request=req
        probe.on_response(Response())
        probe.on_finished(req)
        self.assertFalse(probe.confirmed())
        self.assertEqual(probe.counters()['ambiguous'],1)
        self.assertEqual(probe.counters()['date_shapes'],[
            'body:from=empty','body:to=empty',
            'url:from=datetime_recognized','url:to=datetime_recognized'])
        self.assertNotIn('002527TEST',str(probe.counters()))
        self.assertNotIn('2026-01-01',str(probe.counters()))

    def test_wire_does_not_accept_date_prefix_with_opaque_suffix(self):
        self.assertEqual(collector._wire_stamp('2026-01-01 00:00UNVERIFIED'), '')
        self.assertEqual(collector._wire_stamp('2026-01-01T00:00:00Z'), '')
        self.assertEqual(collector._wire_split_stamp('2026-01-01Z','00:00'), '')
        self.assertEqual(collector._wire_split_stamp('2026-01-01','00:00UNVERIFIED'), '')
        self.assertEqual(collector._wire_value_shape('2026-01-01T00:00:00Z'), 'iso_timezone')

    def test_store_without_period_is_untrusted_until_http_wire_is_proved(self):
        result = run_fixture('wire-fallback')
        self.assertTrue(result['ok'], result)
        self.assertEqual(result['out']['total'], 1)
        self.assertFalse(result['out']['queryProof']['periodVerified'])
        self.assertEqual(result['out']['queryProof']['periodSource'], 'not_observed')

    def test_store_dates_without_exact_sn_cannot_certify_any_board(self):
        result = run_fixture('store-no-sn')
        self.assertFalse(result['ok'], result)
        self.assertIn('3012_QUERY_PERIOD_MISMATCH', result['error'])

    def test_empty_hidden_extnet_datetime_is_initialized_before_physical_view(self):
        # Production bug: visible dates change but parent.setValue does not
        # populate the __Data backing input. Earlier fixtures assumed it did.
        result = run_fixture('backing-empty')
        self.assertTrue(result['ok'], result)
        applied = result['out']['applied']
        self.assertEqual(applied['dateFrom']['data']['raw'], '2026-01-24 00:00:00')
        self.assertEqual(applied['dateTo']['data']['raw'], '2026-10-17 23:59:00')
        self.assertTrue(result['out']['queryProof']['periodVerified'])

    def test_passive_wire_probe_requires_same_request_sn_dates_and_completion(self):
        expected={'from':'2026-01-24 00:00','to':'2026-10-17 23:59'}
        probe=collector.Wire3012Probe('172.29.185.215','002527TEST',expected)
        body=urlencode({'queryCondition':json.dumps({'filters':[
            {'name':'txtSnImei','value':'002527TEST'},
            {'name':'dteFromDate__Data','value':'2026-01-24 00:00:00'},
            {'name':'dteToDate__Data','value':'2026-10-17 23:59:00'},
            {'name':'token','value':'SECRET-MUST-NOT-LEAK'}]})})
        class FakeRequest:
            url='http://172.29.185.215/asymes/home'
            resource_type='xhr'
            method='POST'
            post_data=body
        request=FakeRequest()
        probe.on_request(request)
        counts=probe.counters()
        self.assertEqual({k:counts[k] for k in ('http','sn','dates','period','finished','http_ok')},
                         {'http':1,'sn':1,'dates':1,'period':1,'finished':0,'http_ok':0})
        self.assertEqual(counts['from_text'], 1)
        self.assertEqual(counts['to_text'], 1)
        self.assertIn('dtefromdatedata',counts['date_keys'])
        self.assertNotIn('token',str(counts))
        self.assertFalse(probe.confirmed(),'outbound request alone is not a completed MES result')
        probe.on_finished(request)
        self.assertFalse(probe.confirmed(),'HTTP finish without success status cannot prove coverage')
        class FakeResponse:
            status=200
            def __init__(self, req):
                self.request=req
        probe.on_response(FakeResponse(request))
        self.assertTrue(probe.confirmed())
        self.assertNotIn('SECRET',repr(probe._requests))

    def test_wire_wrong_dates_other_sn_and_other_host_cannot_prove_coverage(self):
        expected={'from':'2026-01-24 00:00','to':'2026-10-17 23:59'}
        probe=collector.Wire3012Probe('172.29.185.215','002527TEST',expected)
        class FakeRequest:
            resource_type='xhr'
            method='POST'
            def __init__(self,url,data):
                self.url=url
                self.post_data=urlencode(data)
        for url,data in [
            ('http://172.29.185.215/asymes/home',{'snImei':'OTHER','fromDate':expected['from'],'toDate':expected['to']}),
            ('http://172.29.185.215/asymes/home',{'snImei':'002527TEST','fromDate':expected['from'],'toDate':'2026-03-31 23:59'}),
            ('http://other-host/asymes/home',{'snImei':'002527TEST','fromDate':expected['from'],'toDate':expected['to']}),
        ]:
            req=FakeRequest(url,data)
            probe.on_request(req)
            probe.on_finished(req)
        self.assertFalse(probe.confirmed())
        self.assertEqual(probe.counters()['period'],0)

    def test_wire_unknown_date_keys_expose_schema_without_promoting_coverage(self):
        expected={'from':'2026-01-01 00:00','to':'2026-11-09 23:59'}
        probe=collector.Wire3012Probe('172.29.185.215','002527TEST',expected)
        class FakeRequest:
            url='http://172.29.185.215/asymes/home'
            resource_type='xhr'
            method='POST'
            post_data=urlencode({'snImei':'002527TEST',
                'defectBeginCustom':'2026-01-01 00:00',
                'defectEndCustom':'2026-11-09 23:59',
                'sessionToken':'SHOULD-NOT-APPEAR',
                'password':'SHOULD-NOT-APPEAR'})
        req=FakeRequest()
        probe.on_request(req)
        counts=probe.counters()
        self.assertEqual(counts['sn'],1)
        self.assertEqual(counts['dates'],0)
        self.assertEqual(counts['date_keys'],['defectbegincustom','defectendcustom'])
        self.assertEqual((counts['from_text'],counts['to_text']),(1,1))
        self.assertFalse(probe.confirmed())
        self.assertNotIn('SHOULD-NOT-APPEAR',str(counts))

    def test_wire_split_extnet_date_and_time_fields_prove_actual_period(self):
        expected={'from':'2026-01-01 00:00','to':'2026-11-09 23:59'}
        probe=collector.Wire3012Probe('172.29.185.215','002527TEST',expected)
        class Request:
            url='http://172.29.185.215/asymes/home'
            resource_type='xhr'
            method='POST'
            post_data=urlencode({'txtSnImei':'002527TEST',
                'dteFromDate__Date':'2026-01-01','dteFromDate__Time':'00:00',
                'dteToDate__Date':'2026-11-09','dteToDate__Time':'23:59'})
        class Response:
            status=200
            def __init__(self,request):self.request=request
        req=Request()
        probe.on_request(req)
        probe.on_response(Response(req))
        probe.on_finished(req)
        self.assertTrue(probe.confirmed())
        self.assertEqual(probe.counters()['period'],1)
        self.assertIn('body:from=day_iso_day_only+time_recognized',probe.counters()['date_shapes'])

        wrong=collector.Wire3012Probe('172.29.185.215','002527TEST',expected)
        req.post_data=req.post_data.replace('23%3A59','00%3A00')
        wrong.on_request(req)
        wrong.on_response(Response(req))
        wrong.on_finished(req)
        self.assertFalse(wrong.confirmed())

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
        self.assertIn(proof["freshness"], {"STORE_LOAD_CONFIRMED", "STORE_DATASET_EVENT"})
        self.assertEqual(result["out"]["total"], 1)

    def test_nested_ext_ajax_form_fields_prove_period_when_store_has_only_sn(self):
        result = run_fixture('ajax-form-serialized')
        self.assertTrue(result['ok'], result)
        proof = result['out']['queryProof']
        self.assertEqual(proof['periodSource'], 'ajax_beforerequest')
        self.assertEqual(proof['actualWindow'], proof['requestedWindow'])

    def test_ext_ajax_html_form_proves_period_without_unrelated_password(self):
        result = run_fixture('ajax-form-dom')
        self.assertTrue(result['ok'], result)
        proof = result['out']['queryProof']
        self.assertEqual(proof['periodSource'], 'ajax_beforerequest')
        self.assertEqual(proof['actualWindow'], proof['requestedWindow'])
        self.assertNotIn('must-not-leak', json.dumps(result))

    def test_ext_ajax_html_form_with_wrong_period_is_blocked(self):
        result = run_fixture('ajax-form-dom-wrong-period')
        self.assertFalse(result['ok'], result)
        self.assertIn('3012_QUERY_PERIOD_MISMATCH', result['error'])
        self.assertIn('2026-03-31', result['error'])

    def test_outgoing_ajax_period_mismatch_fails_even_if_visible_dates_look_right(self):
        result = run_fixture('ajax-wrong-period')
        self.assertFalse(result['ok'], result)
        self.assertIn('3012_QUERY_PERIOD_MISMATCH', result['error'])
        self.assertIn('2026-03-31', result['error'])

    def test_unrelated_ajax_request_never_certifies_selected_sn_period(self):
        result = run_fixture('ajax-unrelated-sn')
        self.assertFalse(result['ok'], result)
        self.assertIn('3012_QUERY_PERIOD_MISMATCH', result['error'])
        self.assertIn('AUSENTE', result['error'])

    def test_view_that_never_starts_is_rejected(self):
        result = run_fixture("stale")
        self.assertFalse(result["ok"])
        self.assertIn("3012_VIEW_NOT_EXECUTED", result["error"])

    def test_proxy_parameter_changes_alone_do_not_claim_view_executed(self):
        result=run_fixture('proxy-only')
        self.assertFalse(result['ok'],result)
        self.assertIn('3012_VIEW_NOT_EXECUTED',result['error'])

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
