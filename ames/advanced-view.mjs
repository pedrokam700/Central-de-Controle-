import {LINE_IDS} from './data/contract.mjs';
import {escapeHtml as esc} from './evidence-view.mjs';

export function createAdvancedView(root,store,client){
  let mounted=false,last,lastConfig,page=0,disposed=false;
  function applyConfig(cfg={}){
    for(const key of ['day_start','ames_host','ames_port','ames_start_url','chrome_profile_dir','backup_retention','monitor_interval_minutes']){
      const input=root.querySelector('[name='+key+']');if(input&&cfg[key]!==undefined&&input!==document.activeElement)input.value=cfg[key];
    }
    const auto=root.querySelector('[name=auto_backup_on_start]');if(auto&&cfg.auto_backup_on_start!==undefined)auto.value=String(!!cfg.auto_backup_on_start);
  }
  function render(){
    if(!mounted){root.innerHTML=`<details class="mes-context-panel"><summary>Consulta SN, período e ferramentas</summary><p>Operações do agente local. Linha selecionada abaixo é contexto solicitado; a consulta SN não comprova por si só a linha ou o CPH de produção. A coleta 3022 em lote só é habilitada quando o agente declara capacidade; a consulta individual tenta 3022 quando disponível e retorna aviso explícito quando não houver evidência.</p><form><label>Linha de investigação<select name="line">${LINE_IDS.map(l=>`<option>${l}</option>`).join('')}</select></label><label>PCBA ou Material SN exato<input name="sn" autocomplete="off"></label><button type="button" class="button secondary" data-advanced="sn">Consultar SN · 3074/2114/3022</button><fieldset><legend>3028 por período / turno</legend><label>Início local do posto<input type="datetime-local" name="start_at"></label><label>Fim local do posto<input type="datetime-local" name="end_at"></label><label>Turno<select name="shift"><option value="Todos">Todos</option><option value="1st Shift">1st Shift · 07:30–17:30</option><option value="2nd Shift">2nd Shift · 17:30–07:30</option></select></label><button type="button" class="button secondary" data-advanced="custom">Coletar período nas linhas selecionadas acima</button></fieldset><div class="mes-pagination">${[['catalog','Catálogo'],['trends','Tendências da linha'],['repairs','Atualizar reparos 2114'],['backup','Backup local · criar agora'],['chrome','Abrir Chrome/CDP'],['jobs','Histórico de jobs'],['monitor','Status do monitor']].map(([id,label])=>`<button type="button" class="button secondary" data-advanced="${id}">${label}</button>`).join('')}</div><label><input type="checkbox" name="unresolved_only" checked>Atualizar somente reparos pendentes</label><label>Dataset do catálogo<select name="dataset"><option value="defects">Falhas atuais</option></select></label><button type="button" class="button secondary" data-advanced="dataset">Ler dataset da linha</button><label>Busca local na base<input name="q"></label><button type="button" class="button secondary" data-advanced="search">Pesquisar</button><fieldset><legend>Importações existentes</legend><label>Export detalhado 3028 (.xlsx) ou integrado (.json)<input type="file" name="file" accept=".xlsx,.xls,.json"></label><button type="button" class="button secondary" data-advanced="upload">Enviar export 3028</button><button type="button" class="button secondary" data-advanced="imported">Analisar export enviado · 3074/2114</button><button type="button" class="button secondary" data-advanced="import">Importar JSON integrado</button><p>A importação preserva o arquivo no agente; não grava nada no MES. Arquivos brutos não são enviados ao Firebase.</p></fieldset><fieldset><legend>Configuração do posto</legend><div class="mes-pagination"><button type="button" class="button secondary" data-advanced="loadsetup">Carregar configuração atual</button></div><label>Início do dia operacional<input type="time" name="day_start" value="07:00"></label><label>Intervalo padrão do monitor<input type="number" name="monitor_interval_minutes" min="5" max="1440" placeholder="30"></label><label>Host MES<input name="ames_host" value="172.29.185.215"></label><label>Porta MES<input name="ames_port" type="number" min="1" max="65535" value="80"></label><label>URL inicial MES<input name="ames_start_url" value="http://172.29.185.215/asymes"></label><label>Diretório do perfil Chrome (opcional)<input name="chrome_profile_dir"></label><label>Backups mantidos<input name="backup_retention" type="number" min="3" max="50" placeholder="10"></label><label>Backup ao iniciar<select name="auto_backup_on_start"><option value="">Manter configuração atual</option><option value="true">Ativado</option><option value="false">Desativado</option></select></label><button type="button" class="button secondary" data-advanced="setup">Salvar configuração do posto</button><p>Bootstrap, rota, Wi-Fi e migration helper continuam no pacote Windows. Nenhuma senha é solicitada ou salva aqui. O seletor antigo “Segundo plano / Chrome visível” não é reproduzido porque o agente auditado não consumia esse campo; abrir o Chrome dedicado continua sendo uma ação real acima.</p></fieldset></form><div data-advanced-status role="status"></div><section data-advanced-results></section><div class="mes-pagination"><button class="button secondary" data-advanced-page="prev">Anterior</button><button class="button secondary" data-advanced-page="next">Próxima</button><button class="button secondary" data-advanced-download>Baixar resultado JSON completo</button></div></details>`;mounted=true;}
    const a=store.agent();if(a.config&&a.config!==lastConfig){lastConfig=a.config;applyConfig(a.config);}for(const button of root.querySelectorAll('[data-advanced]'))button.disabled=a.status!=='connected';
    const result=a.resultSource==='sn'&&a.job?.result?{name:'SN · resultado disponível',result:a.job.result}:a.auxiliary;
    if(result===last)return;last=result;page=0;paint();
    if(a.auxiliary?.name==='catalog'){const select=root.querySelector('[name=dataset]');select.innerHTML=(a.auxiliary.result.datasets||[]).map(d=>`<option value="${esc(d.dataset)}">${esc(d.label)} · ${esc(d.rows)} registros</option>`).join('');}
  }
  function paint(){
    const result=last?.result,rows=Array.isArray(result?.rows)?result.rows:Array.isArray(result?.jobs)?result.jobs:Array.isArray(result?.results)?result.results:Array.isArray(result?.datasets)?result.datasets:result?[result]:[];
    page=Math.max(0,Math.min(page,Math.max(0,Math.ceil(rows.length/25)-1)));
    root.querySelector('[data-advanced-results]').innerHTML=`<h3>${esc(last?.name||'Resultados')}</h3><p>${rows.length} registros disponíveis · página ${page+1}. Leitura local; campos da fonte, sem inferência de causa. Dataset legado limitado a 100000 registros; export canônico usa cursor.</p>${rows.slice(page*25,(page+1)*25).map((r,i)=>`<details><summary>Registro ${page*25+i+1}</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(JSON.stringify(r,null,2).slice(0,12000))}</pre></details>`).join('')}<p>Registros grandes têm prévia limitada a 12000 caracteres; JSON completo preservado no download.</p>`;
    root.querySelector('[data-advanced-page=prev]').disabled=page===0;root.querySelector('[data-advanced-page=next]').disabled=(page+1)*25>=rows.length;
  }
  root.addEventListener('submit',e=>e.preventDefault());
  root.addEventListener('change',e=>{if(e.target.name==='file')root.querySelector('[data-advanced-status]').textContent=e.target.files[0]?.name||'Nenhum arquivo selecionado.';});
  root.addEventListener('click',async e=>{
    const paging=e.target.closest('[data-advanced-page]');if(paging){page+=paging.dataset.advancedPage==='next'?1:-1;paint();return;}
    if(e.target.closest('[data-advanced-download]')&&last){const url=URL.createObjectURL(new Blob([JSON.stringify(last.result,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='AMES_RESULTADO_LOCAL.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;}
    const button=e.target.closest('[data-advanced]');if(!button||button.disabled)return;
    const values=Object.fromEntries(new FormData(root.querySelector('form'))),name=button.dataset.advanced;
    const collection=root.closest('#mesConsole')?.querySelector('[data-agent-form]');
    const scope=collection?Object.fromEntries(new FormData(collection)):{};scope.lines=collection?[...collection.querySelectorAll('[name=lines]:checked')].map(x=>x.value):[values.line];scope.defect_codes=[];
    button.disabled=true;
    try{
      if(['sn','custom','imported'].includes(name))await client.collect(name,{...scope,...values,source_path:store.agent().upload_path});
      else if(['upload','import'].includes(name)){
        const file=root.querySelector('[name=file]').files[0];if(!file||file.size>25*1024*1024)throw Error('Selecione arquivo até 25 MB.');
        if(name==='import'){const payload=JSON.parse(await file.text());if(disposed)return;await client.auxiliary('import',{filename:file.name,payload});}
        else{const bytes=new Uint8Array(await file.arrayBuffer());if(disposed)return;let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));const r=await client.auxiliary('upload',{filename:file.name,data_b64:btoa(binary)});if(!disposed)store.updateAgent({upload_path:r.path});}
      }else if(name==='loadsetup'){
        const r=await client.auxiliary('config');applyConfig(r||{});root.querySelector('[data-advanced-status]').textContent='Configuração atual carregada do agente sem alterar o posto.';return;
      }else if(name==='setup'){
        const config={day_start:values.day_start,ames_host:values.ames_host,ames_port:Number(values.ames_port),ames_start_url:values.ames_start_url,chrome_profile_dir:values.chrome_profile_dir,setup_complete:true};
        if(values.monitor_interval_minutes)config.monitor_interval_minutes=Number(values.monitor_interval_minutes);
        if(values.backup_retention)config.backup_retention=Number(values.backup_retention);
        if(values.auto_backup_on_start!=='')config.auto_backup_on_start=values.auto_backup_on_start==='true';
        await client.auxiliary('setup',{config});
      }else await client.auxiliary(name,{...values,snapshot_id:store.read(values.line).snapshot?.snapshot_id,unresolved_only:!!values.unresolved_only});
      if(!disposed)root.querySelector('[data-advanced-status]').textContent='Operação respondida pelo agente.';
    }catch(error){if(!disposed)root.querySelector('[data-advanced-status]').textContent=error.message;}
    finally{if(!disposed){render();button.focus();}}
  });
  return {render,clear(){disposed=true;}};
}
