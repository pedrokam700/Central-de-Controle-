import { createOccurrenceView } from './occurrence-view.mjs';
import { createCentralMesContext } from './central-mes-context.mjs';

export function createDashboardView(root, store, options = {}) {
  let overview,detail;
  function render(){
    if(!root)return;
    if(!overview){
      root.innerHTML='<section data-dashboard-mes-overview></section><details class="central-mes-details"><summary>Explorar registros MES da linha</summary><section data-dashboard-mes-detail class="ames-occurrence-view"></section></details>';
      overview=createCentralMesContext(root.querySelector('[data-dashboard-mes-overview]'),store,{title:'MES · saúde das linhas',subtitle:'FPY, Check FPY, Quantity, CPH e falhas disponíveis sem misturar o Dashboard geral com os Dashboards de reuso.',mode:'dashboard'});
      detail=createOccurrenceView(root.querySelector('[data-dashboard-mes-detail]'),store,{...options,mode:'dashboard'});
    }
    overview.render();detail.render();
  }
  return Object.freeze({render,clear(){overview?.clear();detail?.clear();overview=undefined;detail=undefined;root?.replaceChildren();}});
}
