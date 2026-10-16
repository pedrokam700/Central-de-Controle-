"""Focused hardening from the 2026-10-16 physical factory RED.

This module deliberately does not touch bootstrap/8765 or production 3022
waits/selectors/acceptance. It fixes three failures evidenced on the exact
1dbfaf63 candidate: cooperative cancellation granularity, 2114 visible-PCBA
confirmation, and 3012 ExtJS field discovery for grouped date/time controls.
"""
from __future__ import annotations

import importlib
import sys


_LABEL_OLD = "  const label = c => fold([c?.fieldLabel, c?.boxLabel, c?.text, c?.itemId, c?.name, c?.id].filter(Boolean).join(' '));"
_LABEL_NEW = r"""  // factory-redfix-3012: grouped ExtJS fields often keep the human label
  // on an owner container while the actual date/time child has no fieldLabel.
  const compact = v => fold(v).replace(/[^a-z0-9]+/g,'');
  const label = c => {
    const parts=[c?.fieldLabel,c?.boxLabel,c?.text,c?.title,c?.itemId,c?.name,c?.id];
    try { parts.push(c?.inputEl?.dom?.name,c?.inputEl?.dom?.id,c?.inputEl?.dom?.placeholder,c?.inputEl?.dom?.getAttribute?.('aria-label')); } catch(e) {}
    let owner=c?.ownerCt,depth=0;
    while(owner && depth<4){
      parts.push(owner?.fieldLabel,owner?.boxLabel,owner?.text,owner?.title,owner?.itemId,owner?.name,owner?.id);
      owner=owner?.ownerCt; depth+=1;
    }
    return fold(parts.filter(Boolean).join(' '));
  };"""

_FIND_OLD = r"""    const pats = patterns.map(fold);
    let best=null, score=-1;
    for (const c of fields) {
      const date = c.isXType?.('datefield') || c.xtype === 'datefield';
      const clock = c.isXType?.('timefield') || c.xtype === 'timefield';
      if(kind === 'date' ? !date : date) continue;
      if(kind === 'time' && !clock && !/time/.test(label(c))) continue;
      const s=label(c); let cur=0;
      for (const p of pats) {
        if (!p) continue;
        if (s === p) cur=Math.max(cur,100);
        else if (s.startsWith(p+' ')) cur=Math.max(cur,80);
        else if (s.includes(p)) cur=Math.max(cur,55);
      }"""
_FIND_NEW = r"""    const pats = patterns.map(fold), compactPats = patterns.map(compact);
    let best=null, score=-1;
    for (const c of fields) {
      const xtype=fold(c?.xtype || c?.getXType?.() || '');
      const date = c.isXType?.('datefield') || c.xtype === 'datefield' || xtype.includes('datefield') || xtype.includes('date field');
      const clock = c.isXType?.('timefield') || c.xtype === 'timefield' || xtype.includes('timefield') || xtype.includes('time field');
      if(kind === 'date' ? !date : date) continue;
      if(kind === 'time' && !clock && !/time/.test(label(c))) continue;
      const s=label(c), sc=compact(s); let cur=0;
      for (let i=0;i<pats.length;i++) {
        const p=pats[i], cp=compactPats[i];
        if (!p) continue;
        if (s === p || (cp && sc === cp)) cur=Math.max(cur,120);
        else if (s.startsWith(p+' ')) cur=Math.max(cur,90);
        else if (s.includes(p)) cur=Math.max(cur,70);
        else if (cp && cp.length>=3 && sc.includes(cp)) cur=Math.max(cur,65);
      }"""


def _install_cancel_checkpoint(a):
    """Observe the existing cancel token at structured progress boundaries."""
    if getattr(a, "_factory_cancel_checkpoint_installed", False):
        return
    original = a._job_live_event

    def cancel_aware_live_event(job_id, *args, **kwargs):
        state = original(job_id, *args, **kwargs)
        with a.JOBS_LOCK:
            token = a.JOB_CANCEL.get(job_id)
        if token is not None and token.is_set():
            raise a.Cancelled()
        return state

    a._job_live_event = cancel_aware_live_event
    a._factory_cancel_checkpoint_installed = True


def _verify_2114_result(module, instance, pcba_sn, result):
    """Never call 2114 COMPLETE if the visible query field belongs to another PCBA."""
    target = module.normalizar_sn(pcba_sn)
    visible = module.normalizar_sn(module._safe_input_value(instance._page(), "snImei"))
    if not visible:
        raise RuntimeError(
            f"2114_VISIBLE_PCBA_UNCONFIRMED: campo SN/IMEI visível ficou vazio após consultar {target}."
        )
    if visible != target:
        raise RuntimeError(
            f"2114_VISIBLE_PCBA_MISMATCH: esperado {target}, campo visível confirmou {visible}. "
            "A grade não será aceita como evidência desta PCBA."
        )
    if isinstance(result, dict):
        result = dict(result)
        result["visible_query_sn"] = visible
        result["visible_query_confirmed"] = True
    return result


def _install_2114_visible_confirmation(a):
    engine = a.ENGINE_DIR or a.discover_engine(a.CONFIG, a.BASE_DIR)
    if not engine:
        return
    engine = str(engine)
    if engine not in sys.path:
        sys.path.insert(0, engine)
    module = importlib.import_module("ames.tela_2114")
    cls = module.Tela2114
    if getattr(cls, "_factory_visible_pcba_guard_installed", False):
        return
    original = cls.consultar

    def guarded(self, pcba_sn, *args, **kwargs):
        result = original(self, pcba_sn, *args, **kwargs)
        return _verify_2114_result(module, self, pcba_sn, result)

    cls.consultar = guarded
    cls._factory_visible_pcba_guard_installed = True


def _install_3012_field_resolution():
    module = importlib.import_module("ames_3012_live")
    js = module.QUERY_3012_JS
    if "factory-redfix-3012" in js:
        return
    if _LABEL_OLD not in js or _FIND_OLD not in js:
        raise RuntimeError("3012_REDFIX_CONTRACT_MISMATCH: QUERY_3012_JS mudou; patch físico não aplicado.")
    js = js.replace(_LABEL_OLD, _LABEL_NEW, 1).replace(_FIND_OLD, _FIND_NEW, 1)
    module.QUERY_3012_JS = js


def install(entry_module):
    """Install only the focused physical-RED guards on the canonical runtime."""
    a = entry_module.a
    if getattr(a, "_factory_redfix_installed", False):
        return
    _install_cancel_checkpoint(a)
    _install_2114_visible_confirmation(a)
    _install_3012_field_resolution()
    a._factory_redfix_installed = True
