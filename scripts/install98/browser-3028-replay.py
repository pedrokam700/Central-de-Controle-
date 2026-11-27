"""Replay synthetic MES grids through the real reader, SQLite and dashboard in Chromium.

python -B scripts/install98/browser-3028-replay.py [path/to/ames-agent] [path/to/ui/ames]
Requires Playwright and Chromium. All browser traffic is fulfilled from this fixture.
"""
import argparse
from collections import Counter
import json
import importlib.util
import os
from pathlib import Path
import shutil
import sys
import tempfile

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument("agent_dir", type=Path, nargs="?", default=ROOT / "ames/agent")
parser.add_argument("ui_dir", type=Path, nargs="?", default=ROOT / "ames")
parser.add_argument("--case")
args = parser.parse_args()
sys.path.insert(0, str(args.agent_dir.resolve()))
from canonical import export_revision

# ExtJS-shaped stores return fixtures for the supplied line/period/model filters.
# The summary has no selectable DOM node. The active path must never need one.
FIXTURE = """({line,counts,summary,group,units,fault,quantity}) => {
  const grids=[];
  const data=Object.entries(counts).flatMap(([name,count],model)=>Array.from({length:count},(_,i)=>({
    lineId:line,productModel:name,lotId:'LAB-'+model+'-'+Math.floor(i/2),
    defectOper:i<2?'OP0':'OP'+(i%2),defectCode:i<10?'A':'B',defectDesc:'synthetic',
    defectTime:new Date(Date.UTC(2026,10,26,14,0,Math.floor(i/2))),repairComment:'lab'
  })));
  const requests=[];
  function grid(itemId){
    const store={pageSize:20,currentPage:1,rows:[],total:0,proxy:{extraParams:{}},reads:{},
      getRange(){return this.rows},getTotalCount(){return this.total},getCount(){return this.rows.length},
      isLoading(){return false},
      loadPage(page,options){
        const p=this.proxy.extraParams;
        requests.push({itemId,page,...p});
        const allowed=String(p.prodModel||'').split(',').filter(Boolean);
        const filtered=data.filter(r=>!allowed.length||allowed.includes(r.productModel));
        let result=[];
        if(itemId==='grdListByConds'){
          result=summary.map(name=>({lineIdNew:line,prodModel:name,qty:quantity,totalDefectQty:units,fpy:95,checkFpy:96}));
        }else if(itemId==='grdListByConds2'){
          result=summary.length?[{lineId:line,qty:quantity}]:[];
        }else if(itemId==='grdListDetail'){
          result=filtered.map(r=>({...r}));
          if(fault==='foreign'&&result.length)result[0].lineId='TAN10101';
          if(fault==='missingLine'&&result.length)delete result[0].lineId;
          if(fault==='blankUnsupported'&&!p.prodModel)result=[];
        }else{
          result=fault==='unpagedGrouping'
            ? Array.from({length:group},(_,i)=>({defectCode:'D'+i,qty:1}))
            : group? [{defectCode:'A',qty:group}]:[];
        }
        // Each response has its own captured request, independent of extraParams.
        const opParams={...p};
        if(itemId==='grdListDetail'&&fault==='foreignPeriod')opParams.endTimeZone='08';
        if(itemId==='grdListDetail'&&fault==='foreignModel')opParams.prodModel='ANOTHER';
        if(itemId==='grdListDetail'&&fault==='wrongRequestPage')opParams.page=page+1;
        this.total=result.length;this.currentPage=page;
        this.reads[page]=(this.reads[page]||0)+1;
        const start=fault==='repeatPage'&&itemId==='grdListDetail'&&page===2?0:(page-1)*20;
        const batch=fault==='unpagedGrouping'&&itemId==='grdSum'?result:result.slice(start,start+20);
        if((fault==='unstablePage'&&page===2||fault==='unstableSingle'&&page===1)&&
           itemId==='grdListDetail'&&this.reads[page]%2===0&&batch.length)
          batch[0]={...batch[0],repairComment:'mutation'};
        if(fault==='incomplete'&&itemId==='grdListDetail'&&page===2)batch.pop();
        this.rows=batch.map(data=>({data}));
        options.callback(this.rows,{page,request:{params:opParams},resultSet:{total:this.total}},true);
      }
    };
    const instance={itemId,store,getStore:()=>store};
    grids.push(instance);return instance;
  }
  grid('grdListByConds');grid('grdListByConds2');grid('grdSum');
  const detail=grid('grdListDetail').store;
  window.Ext={ComponentManager:{all:{items:grids}},ComponentQuery:{query:()=>grids}};
  window.requests=requests;
  window.byModel=scope=>Object.keys(counts).flatMap(model=>{
    const rows=[];
    detail.proxy.extraParams={...scope,prodModel:model};
    for(let page=1;page===1||page<=Math.ceil(detail.total/detail.pageSize);page++)
      detail.loadPage(page,{callback(records){rows.push(...records.map(r=>r.data));}});
    return JSON.parse(JSON.stringify(rows));
  });
}"""

def multiset(rows):
    return Counter(json.dumps(row,sort_keys=True) for row in rows)

def run():
    with tempfile.TemporaryDirectory(ignore_cleanup_errors=True) as directory, sync_playwright() as pw:
        # Launch in a private lab profile. The application attaches via its normal CDP path.
        profile=Path(directory)/"browser"
        context=pw.chromium.launch_persistent_context(str(profile),executable_path=os.environ.get("CHROME_BIN") or shutil.which("chromium"),
            headless=True,args=["--remote-debugging-port=0"])
        port=(profile/"DevToolsActivePort").read_text().splitlines()[0]
        entry=Path(directory)/"agent.py"
        shutil.copy(args.agent_dir/"agent.py",entry)
        spec=importlib.util.spec_from_file_location("lab_agent",entry)
        agent=importlib.util.module_from_spec(spec)
        spec.loader.exec_module(agent)
        agent.CONFIG.update(chrome_cdp="http://127.0.0.1:"+port,ames_host="fixture.invalid")
        def route(request):
            from urllib.parse import urlsplit
            url=urlsplit(request.request.url)
            if url.hostname=="fixture.invalid" and url.path.startswith("/ames/") and url.path.endswith(".mjs"):
                path=(args.ui_dir/url.path[len("/ames/"):]).resolve()
                assert path.is_relative_to(args.ui_dir.resolve())
                return request.fulfill(path=path,content_type="text/javascript")
            if url.hostname=="fixture.invalid":
                return request.fulfill(body="<html><body></body></html>",content_type="text/html")
            request.abort()
        context.route("**/*",route)
        page=context.pages[0]
        second={"CPH2817BR":233,"CPH2815BR":12}
        primary=lambda n:{"CPH2817BR":n}
        cases=[
            ("emptySummary15",{"CPH2817BR":8,"CPH2815BR":7},11,[],None),
            ("emptySummary11",{"CPH2817BR":10,"CPH2815BR":1},9,[],None),
            ("missingModel",second,241,["CPH2817BR"],224),
            ("single",primary(293),275,["CPH2817BR"],246),
            ("revised",primary(294),274,["CPH2817BR"],245),
            ("separate",second,241,list(second),224),
            ("control",{"CPH2853BR":33,"CPH2783BR":2},35,["CPH2853BR,CPH2783BR"],35),
            ("zeroGrouped",primary(15),0,[],None),
            ("unpagedGrouping",primary(48),40,[],None),
            ("greaterGrouped",primary(15),16,[],None),
            ("long",{"CPH2817BR":3000,"CPH2815BR":775},3639,["CPH2817BR"],3300),
            *((name, primary(60 if name in ("repeatPage","unstablePage","incomplete") else 15),11,[],None)
              for name in ("repeatPage","unstablePage","unstableSingle","incomplete","foreign","missingLine",
                           "foreignPeriod","foreignModel","blankUnsupported","wrongRequestPage"))
        ]
        invalid_cases={"repeatPage","unstablePage","unstableSingle","incomplete","foreign","missingLine",
                       "foreignPeriod","foreignModel","blankUnsupported","wrongRequestPage"}
        revisions={}
        for name,counts,group,summary,units in cases:
            if args.case and args.case != name:
                continue
            line="TAN10103" if name=="control" else "TAN10102"
            quantity=1786
            start,end={
                "emptySummary15":("2026-11-26T11:00","2026-11-26T12:00"),
                "emptySummary11":("2026-11-27T13:00","2026-11-27T14:00"),
                "long":("2026-09-01T07:00","2026-10-31T07:00"),
            }.get(name,("2026-11-25T07:00","2026-11-26T07:00"))
            page.goto("http://fixture.invalid/asymes/home#UAWIP.form.VwFpyInquireView")
            page.evaluate(FIXTURE,dict(line=line,counts=counts,group=group,units=units,quantity=quantity,
                                      summary=summary,fault=name))
            invalid=name in invalid_cases
            with agent.STORE.connect() as db:
                before=db.execute("SELECT COUNT(*) FROM snapshots").fetchone()[0]
            try:
                # Run the synchronous production Playwright worker on its own thread.
                from concurrent.futures import ThreadPoolExecutor
                with ThreadPoolExecutor(max_workers=1) as pool:
                    result=pool.submit(agent.ingest_3028_live,mode="custom",lines=[line],
                          start_at=start,end_at=end).result()
            except ValueError:
                if not invalid:
                    raise
                with agent.STORE.connect() as db:
                    assert db.execute("SELECT COUNT(*) FROM snapshots").fetchone()[0]==before
                print(name,"rejected before publication",flush=True)
                continue
            assert not invalid,name
            sid=result["snapshot_id"]; total=sum(counts.values())
            validation=result["live"]["validations"][0]
            assert (validation["detail_occurrences"],validation["grouped_total"])==(total,group),validation
            assert validation["summary_defective_units"]==(units*len(summary) if units is not None else None)
            captured=result["live"]["captures"][0]
            native_calls=page.evaluate("requests.filter(r=>r.itemId==='grdListDetail'&&r.lineId)")
            assert len(native_calls)==2*((total+19)//20)
            assert all(r["prodModel"]=="" for r in native_calls)
            integral=captured["detail"]["records"]
            individual=page.evaluate("scope=>byModel(scope)",captured["filters"]["detail"])
            assert multiset(integral)==multiset(individual)
            assert max(multiset(integral).values())==2
            with agent.STORE.connect() as db:
                stored=[json.loads(r[0])["raw"] for r in db.execute(
                    "SELECT raw_json FROM defect_observations WHERE snapshot_id=?",(sid,))]
                assert multiset(stored)==multiset(individual)
            payload=export_revision(agent.STORE,sid,line)
            assert Counter(row["product_model"] for row in payload["datasets"]["defects"])==counts
            assert payload["summary"]["quantity"]==(quantity if len(summary)==1 else None)
            if name=="single":
                revisions[sid]=payload
            if name=="revised":
                for old_id,old in revisions.items():
                    assert export_revision(agent.STORE,old_id,line)==old
            page.goto("http://fixture.invalid/ui")
            page.evaluate("""async payload=>{
              const {createAmesStore}=await import('/ames/data/store.mjs');
              const {createOccurrenceView}=await import('/ames/occurrence-view.mjs');
              const store=createAmesStore();
              const errors=store.replaceLocalSnapshots([payload]); if(errors.length)throw Error(JSON.stringify(errors));
              store.setLocalConnected(true);createOccurrenceView(document.body,store).render();
            }""",payload)
            page.locator("#dashMesLine").select_option(line)
            assert page.locator("#dashMesRecords .stat-value").inner_text().replace(".","")==str(total)
            for model,count in counts.items():
                page.locator("#dashMesProduct").select_option(model)
                assert page.locator("#dashMesRecords .stat-value").inner_text().replace(".","")==str(count)
            print(name,total,group,validation["verification_method"],"SQLite → revision → UI",flush=True)
        context.close()

if __name__=="__main__":
    run()
