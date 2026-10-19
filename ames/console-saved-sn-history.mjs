const t=(pt,en)=>document.documentElement.lang.startsWith('en')?en:pt;
const elem=(tag,text='',className='')=>{
  const el=document.createElement(tag);
  if(text!==null)el.textContent=String(text);
  if(className)el.className=className;
  return el;
};
const button=(text,callback)=>{
  const b=elem('button',text,'button secondary');b.type='button';b.addEventListener('click',callback);return b;
};
const instant=(value)=>{
  if(!value)return null;
  const date=new Date(value);
  if(!Number.isFinite(date.getTime()))throw Error('Invalid query time');
  return date.toISOString();
};
const clock=value=>{
  const date=new Date(value);
  if(!Number.isFinite(date.getTime()))return String(value||'—').slice(0,48);
  return new Intl.DateTimeFormat(document.documentElement.lang.startsWith('en')?'en-US':'pt-BR',{
    day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',
    timeZone:'America/Sao_Paulo',timeZoneName:'short'
  }).format(date);
};

// B3.3: browse SQLite jobs WITHOUT modifying Today, triggering MES or
// transmitting raw saved results to Firebase. Query time != production day.
export function createSavedSnHistoryView(root,client,store){
  let disposed=false,revision=0,visible=false,loading=false;
  let filters={sn:'',start:'',end:''},cursors=[null],pageIndex=0,page=null,error='',detail=null;
  const online=()=>store.agent().status==='connected';
  const readTime=value=>value?instant(value):null;
  function draw(){
    if(disposed)return;
    root.replaceChildren();root.dataset.savedSnHistory='true';root.dataset.savedSnLang=document.documentElement.lang;
    const panel=elem('section',null,'mes-context-panel');panel.dataset.savedSnHistory='';
    root.append(panel);
    const head=elem('div',null,'section-head'),intro=elem('div');
    intro.append(elem('h3',t('Consultas por SN salvas neste posto','Saved SN queries on this workstation')));
    intro.append(elem('p',t('Consultas anteriores, armazenadas no SQLite. O horário da busca não determina o dia de produção e não altera Hoje.','Previous queries stored in SQLite. Query time does not determine production day and does not change Today.')));
    const toggle=button(visible?t('Ocultar','Hide'):t('Ver consultas salvas','View saved queries'),()=>{visible=!visible;draw();});
    toggle.dataset.snSavedToggle='';toggle.setAttribute('aria-expanded',String(visible));
    head.append(intro,toggle);panel.append(head);
    if(!visible)return;
    const body=elem('div');body.dataset.snSavedBody='';panel.append(body);
    const form=elem('form',null,'mes-filters');form.dataset.snSavedSearch='';
    const fields={};
    for(const [key,label,type] of [['sn','SN','text'],['start',t('Consulta a partir de','Query from'),'datetime-local'],['end',t('Consulta até','Query until'),'datetime-local']]){
      const wrapper=elem('label',label);
      const input=elem('input');input.name=key;input.type=type;input.value=filters[key];
      if(key==='sn')input.maxLength=128;wrapper.append(input);form.append(wrapper);fields[key]=input;
    }
    const submit=elem('button',t('Pesquisar consultas salvas','Search saved queries'),'button secondary');
    submit.type='submit';submit.disabled=loading;form.append(submit);body.append(form);
    form.addEventListener('submit',event=>{
      event.preventDefault();
      const next=Object.fromEntries(Object.entries(fields).map(([key,input])=>[key,input.value.trim()]));
      try{
        const start=readTime(next.start),end=readTime(next.end);
        if(start&&end&&start>=end)throw Error(t('Início posterior ao fim.','Start must precede end.'));
        filters=next;cursors=[null];pageIndex=0;page=null;detail=null;
        void load(0);
      }catch(e){error=String(e.message||e);draw();}
    });
    body.append(elem('p',t('Origem: somente o agente deste computador; não é um histórico por dia produtivo.','Source: this workstation agent only; this is not production-day history.'),'mes-context'));
    const status=elem('p','');status.dataset.snSavedStatus='';status.setAttribute('role','status');
    status.textContent=error||(!online()?t('Agente local desconectado.','Local agent disconnected.'):
      loading?t('Consultando dados armazenados…','Loading stored queries…'):
      !page?t('Selecione Pesquisar para consultar o histórico sem acessar o MES.','Select Search to browse stored history without accessing MES.'):
      page.items.length===0?t('Nenhuma consulta salva encontrada.','No saved query found.'):
      String(page.items.length)+' '+t('consulta(s) nesta página','queries on this page'));
    body.append(status);
    const list=elem('div',null,'mes-record-list');list.dataset.snSavedResults='';
    body.append(list);
    for(const entry of page?.items||[]){
      const card=elem('article',null,'ames-evidence-card');
      const heading=elem('strong',entry.query_sn||'—');
      const stamp=elem('p',clock(entry.query_created_at)+' · '+(entry.query_status||'—'));
      const provenance=elem('p',t('Dados locais · cobertura não comprovada','Local data · unverified coverage'),'mes-context');
      const open=button(t('Abrir resultado salvo','Open saved result'),()=>void openResult(entry));
      open.dataset.snSavedOpen='';open.disabled=loading;
      card.append(heading,stamp,provenance,open);list.append(card);
    }
    const pagination=elem('div',null,'mes-pagination');
    const prev=button(t('Anterior','Previous'),()=>void load(pageIndex-1));
    prev.dataset.snSavedPrev='';prev.disabled=loading||pageIndex===0;
    const next=button(t('Próxima','Next'),()=>void load(pageIndex+1));
    next.dataset.snSavedNext='';next.disabled=loading||!page?.next_cursor;
    pagination.append(prev,elem('span',t('Página','Page')+' '+(pageIndex+1)),next);body.append(pagination);
    const detailRoot=elem('section');detailRoot.dataset.snSavedDetail='';body.append(detailRoot);
    if(detail)drawDetail(detailRoot,detail);
  }
  function drawDetail(root,value){
    root.append(elem('h4',t('Resultado original da consulta · somente leitura','Original query result · read only')+' · '+value.job_id));
    root.append(elem('p',t('Horário da consulta: ','Query time: ')+clock(value.query_created_at)+' · '+t('linha e dia de produção não determinados','production line and date not determined'),'mes-context'));
    const sources=value.result&&typeof value.result==='object'&&!Array.isArray(value.result)
      ?Object.entries(value.result):[['result',value.result]];
    for(const [key,data] of sources){
      const details=elem('details',null,'ames-evidence-card'),summary=elem('summary',key);
      details.append(summary);
      details.addEventListener('toggle',()=>{
        if(!details.open||details.querySelector('pre'))return;
        const pre=elem('pre');pre.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;overflow:auto;max-height:24rem';
        // Never inject raw MES/AT data into innerHTML.
        pre.textContent=JSON.stringify(data,null,2)??'null';details.append(pre);
      });
      root.append(details);
    }
  }
  async function load(index){
    if(disposed||loading||!online()||index<0||index>=cursors.length)return;
    loading=true;error='';const seq=++revision;draw();
    try{
      const response=await client.savedSnHistory({
        sn:filters.sn,start:readTime(filters.start),end:readTime(filters.end),
        before:cursors[index],limit:15
      });
      if(disposed||seq!==revision)return;
      page=response;pageIndex=index;detail=null;
      cursors=cursors.slice(0,index+1);
      if(response.next_cursor)cursors.push(response.next_cursor);
    }catch(e){if(!disposed&&seq===revision){error=String(e?.message||e);page=null;detail=null;}}
    finally{if(!disposed&&seq===revision){loading=false;draw();}}
  }
  async function openResult(entry){
    if(disposed||loading||!online())return;
    loading=true;error='';detail=null;const seq=++revision;draw();
    try{
      const value=await client.openSavedSnHistory(entry);
      if(disposed||seq!==revision)return;
      if(value.job_id!==entry.job_id||value.entry_hash!==entry.entry_hash)
        throw Error(t('Identidade da consulta divergente.','Saved query identity mismatch.'));
      detail=value;
    }catch(e){if(!disposed&&seq===revision){error=String(e?.message||e);detail=null;}}
    finally{if(!disposed&&seq===revision){loading=false;draw();}}
  }
  return Object.freeze({
    render(){if(!root.querySelector('[data-saved-sn-history]')||root.dataset.savedSnLang!==document.documentElement.lang)draw();},
    clear(){disposed=true;revision++;page=null;detail=null;root.replaceChildren();}
  });
}
