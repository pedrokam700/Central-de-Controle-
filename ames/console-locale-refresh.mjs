export function withLocaleRefresh(view){
  let observer=null;
  const refresh=()=>view.render();
  return Object.freeze({
    render(){view.render();if(!observer){observer=new MutationObserver(refresh);observer.observe(document.documentElement,{attributes:true,attributeFilter:['lang']});}},
    clear(){observer?.disconnect();observer=null;view.clear?.();}
  });
}
