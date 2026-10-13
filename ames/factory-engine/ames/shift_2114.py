"""Confirm the ExtJS record and submitted value, never just the displayed text."""
import time
from datetime import datetime, timezone, timedelta

SELECT_SHIFT_JS = r'''args => {
  if (!globalThis.Ext?.ComponentQuery) return {ok:false,reason:'ext_unavailable'};
  const norm=v=>String(v??'').trim().toLowerCase();
  const dom=[...document.querySelectorAll('input[name="desc"]')].find(e=>e.offsetParent!==null);
  const fields=[...new Set([...Ext.ComponentQuery.query('combobox'),...Ext.ComponentQuery.query('field')])];
  const combo=fields.find(f=>dom&&f.inputEl?.dom===dom) || fields.find(f=>f.isVisible?.()&&/shift/i.test(f.fieldLabel||''));
  if(!combo?.getStore) return {ok:false,reason:'combo_missing'};
  const store=combo.getStore();
  if(!store || store.isLoading?.())return {ok:false,reason:'store_loading'};
  const records=store.getRange?store.getRange():[];
  const matches=records.filter(r=>Object.values(r.data||{}).some(v=>norm(v)===norm(args.label)));
  if(matches.length!==1){if(args.apply)combo.expand?.();return {ok:false,reason:'record_missing_or_ambiguous'};}
  const rec=matches[0], vf=combo.valueField, df=combo.displayField;
  const value=rec.get(vf), label=rec.get(df);
  if(value==null || value==='' || !label)return {ok:false,reason:'record_identity_missing'};
  if(args.apply){
    const old=combo.getValue();
    if(combo.select)combo.select(rec);else combo.setValue(value);
    const major=Number(Ext.getVersion?.()?.major||4);
    combo.fireEvent?.('select',combo,major>=5?rec:[rec]);
    combo.fireEvent?.('change',combo,value,old);
    combo.checkChange?.();combo.fireEvent?.('blur',combo);
    combo.collapse?.();
  }
  const actual=combo.getValue(), submitted=combo.getSubmitValue?combo.getSubmitValue():actual;
  const found=combo.findRecordByValue?combo.findRecordByValue(actual):records.find(r=>norm(r.get(vf))===norm(actual));
  const selection=combo.getSelection?.();
  const selectionOk=!selection || (Array.isArray(selection)?selection.includes(rec):selection===rec);
  const ok=norm(actual)===norm(value)&&norm(submitted)===norm(value)&&found===rec&&selectionOk&&norm(combo.getRawValue())===norm(label)&&(!combo.isValid||combo.isValid());
  return {ok,value:actual,submitted,raw:combo.getRawValue(),record:rec.data,reason:ok?'confirmed':'not_committed'};
}'''


def current_shift(now=None):
    now = now or datetime.now(timezone(timedelta(hours=-3)))
    minute = now.hour * 60 + now.minute
    return ('1', '1st Shift') if 450 <= minute < 1050 else ('2', '2nd Shift')


def ensure_shift(page, now=None):
    code, label = current_shift(now)
    last = None
    for attempt in range(3):
        for frame in getattr(page, 'frames', None) or [page]:
            try:
                last = frame.evaluate(SELECT_SHIFT_JS, {'code': code, 'label': label, 'apply': True})
                if last and last.get('ok'):
                    time.sleep(.2)
                    confirmed = frame.evaluate(SELECT_SHIFT_JS, {'code': code, 'label': label, 'apply': False})
                    if confirmed and confirmed.get('ok'):
                        return label
            except Exception as exc:
                last = {'reason': type(exc).__name__}
        time.sleep(.35)
    raise RuntimeError(f'2114: Shift {label} não confirmado pela store/valor efetivo: {last}. Consulta não executada.')
