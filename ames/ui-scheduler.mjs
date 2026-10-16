export function createDebouncedAction(action,delay=140,{schedule=setTimeout,cancel=clearTimeout}={}){
  let timer=null,disposed=false,lastArgs=[];
  const wait=Math.max(0,Math.min(1000,Number(delay)||0));
  function clear(){if(timer!==null){cancel(timer);timer=null;}}
  function run(){
    if(disposed)return;
    clear();
    action(...lastArgs);
  }
  return Object.freeze({
    schedule(...args){if(disposed)return;lastArgs=args;clear();timer=schedule(run,wait);},
    flush(){if(timer!==null)run();},
    cancel(){clear();lastArgs=[];},
    dispose(){disposed=true;clear();lastArgs=[];},
    pending(){return timer!==null;},
  });
}
