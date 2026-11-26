"""Replay synthetic MES grids through the real reader, SQLite and dashboard in Chromium.

python -B scripts/install98/browser-3028-replay.py [path/to/ames-agent] [path/to/ui/ames]
Requires Playwright and Chromium. All browser traffic is fulfilled from this fixture.
"""
import argparse
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
args = parser.parse_args()
sys.path.insert(0, str(args.agent_dir.resolve()))
from canonical import export_revision

# No network MES. Each click on a real HTML button selects a different Ext record
# and dispatches the load events using the selected row's own proxy parameters.
FIXTURE = """({line,counts,group,units,split,fault,quantity,empty}) => {
  const names=Object.keys(counts), summaryNames=split?names:[names.join(',')];
  const buttons=summaryNames.map((_,i)=>document.body.appendChild(document.createElement('button')));
  let selected=null, native=false;
  const grids=[];
  const data=names.flatMap((name,model)=>Array.from({length:counts[name]},(_,i)=>({
    lineId:line,productModel:name,lotId:'LAB-'+model+'-'+Math.floor(i/2),
    defectOper:'OP'+(i%2),defectCode:i<10?'A':'B',defectDesc:'synthetic',
    defectTime:new Date(Date.UTC(2026,10,25,7,0,Math.floor(i/2))),repairComment:'lab'
  })));
  function grid(itemId){
    const events=new Set();
    const store={pageSize:20,currentPage:1,rows:[],proxy:{extraParams:{}},reads:{},
      getRange(){return this.rows},getTotalCount(){return this.total},getCount(){return this.rows.length},
      on(_,fn){events.add(fn)},un(_,fn){events.delete(fn)},isLoading(){return false},
      loadPage(n,options){
        const p=this.proxy.extraParams;
        const allowed=(p.prodModel||names.join(',')).split(',');
        const filtered=data.filter(r=>allowed.includes(r.productModel));
        let result=[];
        if(itemId==='grdListByConds'){
          native=false;
          result=empty?[]:summaryNames.map((name,i)=>({lineIdNew:line,prodModel:name,
            qty:split?counts[name]:quantity,totalDefectQty:split?0:units,fpy:95,checkFpy:96}));
        }else if(itemId==='grdListByConds2'){
          result=empty?[]:[{lineId:line,qty:quantity}];
        }else if(itemId==='grdListDetail'){
          result=filtered.map(r=>({...r}));
          if(fault==='nativeChanged' && native && result.length)result[0].repairComment='updated';
          if(fault==='foreign' && result.length)result[0].lineId='TAN10101';
        }else{
          const a=filtered.filter(r=>r.defectCode==='A').length;
          const q=split?group[names.indexOf(p.prodModel)]??0:group[0];
          if(q)result=[{defectCode:'A',qty:fault==='compensated'?a-1:a},
                       {defectCode:'B',qty:q-a+(fault==='compensated'?1:0)}];
        }
        this.total=result.length;this.currentPage=n;
        this.reads[n]=(this.reads[n]||0)+1;
        const start=fault==='repeatPage' && itemId==='grdListDetail' && n===2?0:(n-1)*20;
        const batch=result.slice(start,start+20);
        if (fault==='unstablePage' && itemId==='grdListDetail' && n===2 && this.reads[n]%2===0)
          batch[0]={...batch[0],repairComment:'mutation'};
        this.rows=batch.map(data=>({data}));const operation={page:n,params:{...p}};
        options.callback(this.rows,operation,true);
        for(const fn of events)fn(this,this.rows,true,operation);
      }
    };
    const instance={itemId,store,getStore:()=>store,getSelectionModel:()=>({
      select(i){selected=summary.store.rows[i]},getSelection:()=>selected?[selected]:[],
      deselectAll(){selected=null}
    }),getView:()=>({getNode:r=>buttons[summary.store.rows.indexOf(r)],focusRow(){}})};
    grids.push(instance);return instance;
  }
  const summary=grid('grdListByConds');grid('grdListByConds2');
  const details=grid('grdListDetail'),groups=grid('grdSum');
  buttons.forEach((btn,i)=>btn.onclick=()=>{
    selected=summary.store.rows[i];native=true;
    for(const table of [groups,details]){
      table.store.proxy.extraParams={...summary.store.proxy.extraParams,prodModel:selected.data.prodModel};
      table.store.loadPage(1,{callback(){}});
    }
  });
  window.Ext={ComponentManager:{all:{items:grids}},ComponentQuery:{query:()=>grids}};
}"""

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
            ("mixed",second,[241],224),("single",primary(293),[275],246),
            ("revised",primary(294),[274],245),("control",{"CPH2853BR":33,"CPH2783BR":2},[35],35),
            ("separate",second,[232,10],224),("empty",primary(40),[40],0),
            ("zero",primary(40),[0],0),("larger",primary(40),[41],0),
            ("compensated",primary(40),[40],0),("nativeChanged",primary(40),[38],0),
            ("repeatPage",primary(60),[60],0),("unstablePage",primary(60),[60],0),
            ("foreign",primary(40),[40],0)]
        revisions={}
        for name,counts,groups,units in cases:
            line="TAN10103" if name=="control" else "TAN10102"
            day=24 if name=="mixed" else 25
            quantity=1531 if day==24 else 1786
            page.goto("http://fixture.invalid/asymes/home#UAWIP.form.VwFpyInquireView")
            page.evaluate(FIXTURE,dict(line=line,counts=counts,group=groups,units=units,quantity=quantity,
                                      split=name=="separate",empty=name=="empty",fault=name))
            invalid=name in ("nativeChanged","repeatPage","unstablePage","foreign")
            with agent.STORE.connect() as db:
                before=db.execute("SELECT COUNT(*) FROM snapshots").fetchone()[0]
            try:
                # Run the synchronous production Playwright worker on its own thread.
                from concurrent.futures import ThreadPoolExecutor
                with ThreadPoolExecutor(max_workers=1) as pool:
                    result=pool.submit(agent.ingest_3028_live,mode="custom",lines=[line],
                          start_at=f"2026-11-{day}T07:00",end_at=f"2026-11-{day+1}T07:00").result()
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
            assert (validation["detail_occurrences"],validation["grouped_total"])==(total,sum(groups)),validation
            if name=="compensated":
                assert validation["verification_method"]=="native_selected_3028_grids"
                assert validation["grouped_matches_by_code"] is False
            payload=export_revision(agent.STORE,sid,line)
            from collections import Counter
            assert Counter(row["product_model"] for row in payload["datasets"]["defects"])==counts
            assert payload["summary"]["quantity"]==(None if name in ("separate","empty") else quantity)
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
            assert page.locator("#dashMesRecords .stat-value").inner_text()==str(total)
            for model,count in counts.items():
                page.locator("#dashMesProduct").select_option(model)
                assert page.locator("#dashMesRecords .stat-value").inner_text()==str(count)
            print(name,total,sum(groups),validation["verification_method"],"SQLite → revision → UI",flush=True)
        context.close()

if __name__=="__main__":
    run()
