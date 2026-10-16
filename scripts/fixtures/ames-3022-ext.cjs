// Executable ExtJS contract fixture. No PCBA column is required in history rows.
// Runs the collector's actual evaluate() scripts, including selection and listeners.
const vm = require('node:vm');
const readline = require('node:readline');
let now = 0, pending = null, plans = [], submitted = [], value = '';
const rect = visible => ({ getBoundingClientRect: () => ({width:visible ? 800 : 0,height:visible ? 300 : 0}) });
function store(rows) {
  const listeners = new Map();
  return {
    rows, loading:false,
    on(name, fn, scope, options) { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push({fn,options}); },
    un(name, fn) { listeners.set(name, (listeners.get(name)||[]).filter(x => x.fn !== fn)); },
    emit(name, ...args) { for (const x of [...(listeners.get(name)||[])]) { x.fn(...args); if(x.options?.single) this.un(name,x.fn); } },
    each(fn) { this.rows.forEach(data => fn({data})); },
    isLoading() { return this.loading; }, getCount() { return this.rows.length; }, getTotalCount() { return this.rows.length; },
    listenerCount() { return [...listeners.values()].reduce((n, a) => n+a.length,0); }
  };
}
const columns = ['Hist Seq','Working Oper Code','Working Oper','Current Oper Code','Current Oper','Station','Tran Desc','Tran Time','Tran User Id','Shift','Cutoff Date','Lot Id','TRAN CMF3'].map(text => ({text,dataIndex:text}));
const historyStore = store([]), hiddenStore = store([]);
const grid = (id, s, visible) => ({id, columns, getStore:()=>s, el:{dom:rect(visible)}, isVisible:()=>visible});
const grids = [grid('hidden-history',hiddenStore,false),grid('history',historyStore,true)];
const input = rect(true);
const field = {id:'sn-field',inputId:'sn-input',name:'sn',fieldLabel:'SN / IMEI / A-S',inputEl:{dom:input},isVisible:()=>true,getValue:()=>value,getRawValue:()=>value};
const ctx = vm.createContext({});
Object.assign(ctx,{window:ctx,document:{getElementById:()=>input},getComputedStyle:()=>({display:'block',visibility:'visible'}),Ext:{ComponentQuery:{query:type=>type==='gridpanel'?grids:[field]},getCmp:id=>grids.find(g=>g.id===id)}});
function finish() {
  const plan = pending.plan;
  pending = null;
  if (plan.mode !== 'failed') {
    historyStore.rows = plan.rows;
    historyStore.emit('datachanged',historyStore);
    historyStore.emit('refresh',historyStore);
  }
  historyStore.loading = false;
  if(plan.mode !== 'loadData') historyStore.emit('load',historyStore,historyStore.rows,plan.mode !== 'failed');
}
function handle(req) {
  if (req.op === 'eval') return vm.runInContext(`(${req.code})`,ctx)(req.arg);
  if (req.op === 'setup') { plans=req.plans; historyStore.rows=req.rows||[]; hiddenStore.rows=req.hidden||[]; return true; }
  if (req.op === 'fill') { value=req.value; return true; }
  if (req.op === 'value') return value;
  if (req.op === 'click') {
    const plan = plans.shift(); submitted.push(value);
    if (!plan || plan.mode === 'stale') return true;
    if (plan.mode !== 'loadData') {historyStore.loading=true;historyStore.emit('beforeload',historyStore,{});}
    pending={at:now+(plan.delay||0),plan};
    if(pending.at<=now) finish();
    return true;
  }
  if (req.op === 'advance') {now+=req.ms;if(pending && now>=pending.at) finish();return now;}
  if (req.op === 'state') return {submitted,listeners:historyStore.listenerCount()+hiddenStore.listenerCount()};
  throw Error('Unknown operation');
}
readline.createInterface({input:process.stdin}).on('line', line=>{
  try {process.stdout.write(JSON.stringify({result:handle(JSON.parse(line))??null})+'\n');}
  catch(e) {process.stdout.write(JSON.stringify({error:e.stack})+'\n');}
});
