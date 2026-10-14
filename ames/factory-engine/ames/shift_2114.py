"""Select and confirm the real AWIP2114 Shift lookup without coordinates.

The factory MES has at least two UI variants:
- a normal ExtJS combobox/field;
- a lookup trigger that opens a small ExtJS grid with Name / Time / Desc rows.

Never treat visible text alone as proof.  Success requires the parent Shift field
(`input[name="desc"]`) to contain the expected label after the ExtJS record is
selected.  Rich diagnostics are returned on failure so a physical regression is
observable instead of looking like a generic timeout.
"""
import time
from datetime import datetime, timezone, timedelta


SELECT_SHIFT_JS = r'''args => {
  const norm=v=>String(v??'').trim().toLowerCase();
  const visible=el=>!!el && el.offsetParent!==null;
  const expected=norm(args.label);
  const labels=(args.labels||[]).map(norm);
  const descInputs=[...document.querySelectorAll('input[name="desc"]')].filter(visible);
  const desc=descInputs.length===1?descInputs[0]:descInputs.find(el=>norm(el.value)===expected)||descInputs[0]||null;
  const domValue=()=>norm(desc?.value);
  const out=(extra={})=>({
    ok:false,
    expected:args.label,
    desc_value:desc?.value||'',
    desc_inputs:descInputs.length,
    ...extra,
  });

  // A manual selection made by the operator is already a valid committed state.
  if(domValue()===expected)return out({ok:true,strategy:'existing_dom',reason:'confirmed'});
  if(!globalThis.Ext?.ComponentQuery)return out({reason:'ext_unavailable'});

  const fields=[...new Set([
    ...Ext.ComponentQuery.query('combobox'),
    ...Ext.ComponentQuery.query('field'),
    ...Ext.ComponentQuery.query('triggerfield')
  ])];
  const owner=fields.find(f=>desc&&f.inputEl?.dom===desc) || null;

  const fieldRaw=f=>norm(f?.getRawValue?.() ?? f?.getValue?.() ?? '');
  if(owner && fieldRaw(owner)===expected && domValue()===expected){
    return out({ok:true,strategy:'owner_field',reason:'confirmed',owner_xtype:owner.xtype||''});
  }

  // Legacy/alternate variant: the Shift field itself is a combobox.
  const combos=fields.filter(f=>f?.getStore && (f===owner || /shift/i.test(String(f.fieldLabel||'')) || /desc/i.test(String(f.name||''))));
  for(const combo of combos){
    try{
      const store=combo.getStore();
      if(!store || store.isLoading?.())continue;
      const records=store.getRange?store.getRange():[];
      const matches=records.filter(r=>Object.values(r.data||{}).some(v=>norm(v)===expected));
      if(matches.length!==1)continue;
      const rec=matches[0], vf=combo.valueField, df=combo.displayField;
      const value=vf?rec.get(vf):undefined, label=df?rec.get(df):args.label;
      if(args.apply){
        const old=combo.getValue?.();
        if(combo.select)combo.select(rec);else if(value!==undefined)combo.setValue?.(value);
        const major=Number(Ext.getVersion?.()?.major||4);
        combo.fireEvent?.('select',combo,major>=5?rec:[rec]);
        combo.fireEvent?.('change',combo,combo.getValue?.(),old);
        combo.checkChange?.();
        combo.fireEvent?.('blur',combo);
        combo.collapse?.();
      }
      const confirmed=domValue()===expected || (combo===owner && fieldRaw(combo)===expected && norm(label)===expected);
      if(confirmed)return out({ok:true,strategy:'combobox',reason:'confirmed',record:rec.data||{},owner_xtype:combo.xtype||''});
    }catch(_){ }
  }

  const gridInfo=[];
  const grids=[...new Set([
    ...Ext.ComponentQuery.query('gridpanel'),
    ...Ext.ComponentQuery.query('grid'),
    ...Ext.ComponentQuery.query('tablepanel')
  ])];
  let chosen=null;
  for(const grid of grids){
    try{
      if(grid.isVisible && !grid.isVisible())continue;
      const store=grid.getStore?.();
      if(!store || store.isLoading?.())continue;
      const records=store.getRange?store.getRange():[];
      const values=records.map(r=>Object.values(r.data||{}).map(norm));
      const matches=records.map((r,i)=>({r,i,vals:values[i]})).filter(x=>x.vals.includes(expected));
      const hasShiftSignature=labels.length<2 || labels.every(lbl=>values.some(vals=>vals.includes(lbl)));
      gridInfo.push({
        id:grid.getId?.()||grid.id||'', itemId:grid.itemId||'', xtype:grid.xtype||'',
        records:records.length, matches:matches.length, shift_signature:hasShiftSignature,
        sample:records.slice(0,4).map(r=>r.data||{})
      });
      if(hasShiftSignature && matches.length===1){
        if(chosen)return out({reason:'multiple_shift_grids',grids:gridInfo});
        chosen={grid,rec:matches[0].r,index:matches[0].i};
      }
    }catch(_){ }
  }

  if(chosen){
    const {grid,rec,index}=chosen;
    if(args.apply){
      try{
        const sm=grid.getSelectionModel?.();
        sm?.select?.(rec,false,true);
        const view=grid.getView?.();
        const node=view?.getNode?.(rec) || view?.getNode?.(index) || null;
        view?.focusRow?.(index);
        // Real DOM events hit the same delegated handlers used by a human click.
        if(node){
          for(const type of ['mousedown','mouseup','click','dblclick']){
            try{node.dispatchEvent(new MouseEvent(type,{bubbles:true,cancelable:true,view:window,button:0}));}catch(_){ }
          }
        }
        const evt=globalThis.Ext?.EventObject||null;
        view?.fireEvent?.('itemclick',view,rec,node,index,evt);
        grid.fireEvent?.('itemclick',grid,rec,node,index,evt);
        view?.fireEvent?.('itemdblclick',view,rec,node,index,evt);
        grid.fireEvent?.('itemdblclick',grid,rec,node,index,evt);
      }catch(exc){
        return out({reason:'grid_select_exception',error:String(exc),grids:gridInfo});
      }
    }
    const confirmed=domValue()===expected;
    return out({
      ok:confirmed,
      strategy:'lookup_grid',
      reason:confirmed?'confirmed':'grid_selected_waiting_commit',
      record:rec.data||{},
      grid:{id:grid.getId?.()||grid.id||'',itemId:grid.itemId||'',xtype:grid.xtype||'',index},
      grids:gridInfo
    });
  }

  // If no shift grid is visible yet, explicitly open the lookup trigger.  This is
  // the read-only Shift selector, not the page Confirm/Update buttons.
  if(args.apply){
    let requested=false;
    try{
      if(owner?.onTriggerClick){owner.onTriggerClick();requested=true;}
      else if(owner?.getTrigger){
        const triggers=owner.getTrigger();
        const list=Array.isArray(triggers)?triggers:Object.values(triggers||{});
        const trigger=list.find(t=>!t?.isVisible || t.isVisible());
        if(trigger?.handler){trigger.handler.call(trigger.scope||owner,owner,trigger);requested=true;}
        else if(trigger?.el?.dom){trigger.el.dom.click();requested=true;}
      }
    }catch(_){ }
    if(!requested && desc){
      const wrap=desc.closest('.x-form-item,.x-field,.x-form-field-wrap,.x-form-trigger-wrap')||desc.parentElement;
      const trigger=wrap?.querySelector?.('.x-form-trigger:not(.x-item-disabled),.x-form-arrow-trigger:not(.x-item-disabled)');
      if(trigger){try{trigger.click();requested=true;}catch(_){ }}
    }
    if(requested)return out({reason:'lookup_open_requested',owner_xtype:owner?.xtype||'',grids:gridInfo});
  }

  return out({reason:'shift_control_not_found',owner_xtype:owner?.xtype||'',grids:gridInfo});
}'''


def current_shift(now=None):
    now = now or datetime.now(timezone(timedelta(hours=-3)))
    minute = now.hour * 60 + now.minute
    return ('1', '1st Shift') if 450 <= minute < 1050 else ('2', '2nd Shift')


def ensure_shift(page, now=None, timeout_s=8.0):
    """Select the current shift and prove the parent 2114 field committed it.

    The OPC page can take a few seconds to create/populate the lookup window, so
    this uses bounded state polling instead of a blind long sleep.
    """
    code, label = current_shift(now)
    labels = ['1st Shift', '2nd Shift']
    deadline = time.time() + max(2.0, float(timeout_s or 8.0))
    last = None
    attempts = 0
    while time.time() < deadline:
        attempts += 1
        frames = getattr(page, 'frames', None) or [page]
        for frame in frames:
            try:
                last = frame.evaluate(SELECT_SHIFT_JS, {
                    'code': code,
                    'label': label,
                    'labels': labels,
                    'apply': True,
                })
                if last and last.get('ok'):
                    # Re-read without applying anything: this is the proof that the
                    # parent 2114 field actually retained the chosen shift.
                    time.sleep(.08)
                    confirmed = frame.evaluate(SELECT_SHIFT_JS, {
                        'code': code,
                        'label': label,
                        'labels': labels,
                        'apply': False,
                    })
                    if confirmed and confirmed.get('ok'):
                        return label
                    last = confirmed or last
            except Exception as exc:
                last = {'reason': type(exc).__name__, 'error': str(exc)}
        time.sleep(.2)
    raise RuntimeError(
        f'2114: Shift {label} não confirmado após {attempts} tentativas em {timeout_s:.1f}s. '
        f'Diagnóstico: {last}. Consulta 2114 não executada.'
    )
