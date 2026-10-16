from __future__ import annotations

from datetime import datetime
from urllib.parse import urlsplit

ROUTE_3012 = "UAWIP.form.VwDefectRepairView"


def _surface(url: str) -> str:
    path = (urlsplit(str(url or "")).path or "").lower()
    if "/asymes/home" in path:
        return "home"
    if "/asymes/opc" in path:
        return "opc"
    return "other"


def _safe_url(url: str) -> dict:
    parts = urlsplit(str(url or ""))
    return {"path": parts.path or "", "fragment": parts.fragment or ""}


def _select_home_page(browser, ames_host: str):
    pages = [page for context in browser.contexts for page in context.pages]
    home = [page for page in pages if _surface(page.url) == "home" and str(ames_host) in str(page.url)]
    if not home:
        candidates = [page for page in pages if str(ames_host) in str(page.url) and _surface(page.url) != "opc"]
        if not candidates:
            raise RuntimeError("3012_MAP_HOME_NOT_FOUND: abra o A-MES pelo Chrome dedicado e mantenha a Home autenticada.")
        page = candidates[-1]
        base = str(page.url or "").split("#", 1)[0]
        parts = urlsplit(base)
        if "/asymes" not in (parts.path or "").lower():
            raise RuntimeError("3012_MAP_HOME_NOT_FOUND: sessao A-MES Home nao identificada.")
        if "/asymes/home" not in (parts.path or "").lower():
            home_url = f"{parts.scheme}://{parts.netloc}/asymes/home#{ROUTE_3012}"
            page = browser.contexts[0].new_page()
            page.goto(home_url, wait_until="domcontentloaded", timeout=25000)
            return page
        home = [page]
    page = home[-1]
    if ROUTE_3012.lower() not in str(page.url or "").lower():
        page.evaluate("route => { location.hash = '#' + route; }", ROUTE_3012)
    return page


INSPECT_JS = r"""
() => {
  if (!window.Ext || !Ext.ComponentQuery) throw new Error('ExtJS nao encontrado na 3012 Home.');
  const clean = value => String(value ?? '').trim();
  const components = [];
  try {
    const all = Ext.ComponentManager && Ext.ComponentManager.all;
    if (all?.items) components.push(...all.items);
    else if (all?.getArray) components.push(...all.getArray());
    else if (all?.each) all.each(item => components.push(item));
  } catch (_) {}
  if (!components.length) {
    try { components.push(...Ext.ComponentQuery.query('*')); } catch (_) {}
  }
  const visible = c => c && !c.hidden && (typeof c.isVisible !== 'function' || c.isVisible(true));
  const xtype = c => clean(c?.xtype || c?.getXType?.() || c?.getXTypes?.()?.split('/')?.at(-1));
  const identity = c => ({
    label: clean(c?.fieldLabel || c?.boxLabel || c?.text || c?.title),
    name: clean(c?.name),
    itemId: clean(c?.itemId),
    xtype: xtype(c),
  });
  const storeFields = store => {
    const names = [];
    try {
      const model = store?.getModel?.() || store?.model;
      const fields = model?.getFields?.() || model?.fields?.items || [];
      for (const field of fields) names.push(clean(field?.name || field?.getName?.()));
    } catch (_) {}
    try {
      const record = store?.getAt?.(0);
      const raw = record?.getData ? record.getData() : record?.data;
      if (raw && typeof raw === 'object') names.push(...Object.keys(raw));
    } catch (_) {}
    return [...new Set(names.filter(Boolean))].sort();
  };
  const fields = components.filter(c => visible(c) && (typeof c?.setValue === 'function' || /field|combo|date|time/i.test(xtype(c)))).map(c => {
    let optionCount = null, valueField = '', displayField = '', store_fields = [];
    try {
      const store = c?.getStore?.() || c?.store;
      if (store) {
        optionCount = Number(store?.getCount?.() ?? store?.getRange?.()?.length ?? 0);
        valueField = clean(c?.valueField);
        displayField = clean(c?.displayField);
        store_fields = storeFields(store);
      }
    } catch (_) {}
    return {...identity(c), inputType: clean(c?.inputType), allowBlank: c?.allowBlank !== false, optionCount, valueField, displayField, store_fields};
  });
  const buttons = components.filter(c => visible(c) && (c?.isButton || xtype(c) === 'button' || typeof c?.handler === 'function')).map(c => identity(c));
  const grids = [];
  for (const c of components.filter(visible)) {
    let store = null;
    try { store = c?.getStore?.() || c?.store; } catch (_) {}
    if (!store || !(c?.columns || c?.getColumnManager || /grid/i.test(xtype(c)))) continue;
    let columns = [];
    try {
      columns = (c?.getColumnManager?.()?.getColumns?.() || c?.columns || []).map(col => ({
        text: clean(col?.text || col?.header), dataIndex: clean(col?.dataIndex), itemId: clean(col?.itemId), hidden: !!col?.hidden
      })).filter(col => col.text || col.dataIndex || col.itemId);
    } catch (_) {}
    const proxy = store?.getProxy?.() || store?.proxy;
    let proxyPath = '';
    try {
      const rawUrl = clean(proxy?.url || proxy?.api?.read || '');
      if (rawUrl) {
        try { proxyPath = new URL(rawUrl, location.href).pathname; } catch (_) { proxyPath = rawUrl.split('?')[0]; }
      }
    } catch (_) {}
    grids.push({
      ...identity(c), columns,
      store_fields: storeFields(store),
      loaded_count: Number(store?.getCount?.() ?? 0),
      total_count: Number(store?.getTotalCount?.() ?? 0),
      page_size: Number(store?.pageSize ?? 0),
      proxy_path: proxyPath,
      proxy_param_keys: Object.keys(proxy?.extraParams || {}).sort(),
    });
  }
  return {
    component_count: components.length,
    fields,
    buttons,
    grids,
    viewport: {title: clean(document.title)},
  };
}
"""


def map_3012_structure(*, cdp_url: str, ames_host: str, timeout_s: float = 25.0) -> dict:
    """Read-only structural map of the canonical A-MES 3012 Home view.

    It never reads cookies/storage/auth headers and never submits the View/query button.
    Field values are deliberately excluded; only component/schema metadata is returned.
    """
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as exc:
        raise RuntimeError("Playwright nao instalado no agente local") from exc

    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp(cdp_url)
        page = _select_home_page(browser, ames_host)
        deadline = datetime.now().timestamp() + timeout_s
        while datetime.now().timestamp() < deadline:
            if _surface(page.url) == "opc":
                raise RuntimeError("3012_MAP_WRONG_SURFACE: a variante OPC foi recusada; use a 3012 da Home.")
            try:
                if _surface(page.url) == "home" and ROUTE_3012.lower() in str(page.url or "").lower():
                    ready = page.evaluate("() => !!(window.Ext && Ext.ComponentQuery && Ext.ComponentQuery.query('*').length)")
                    if ready:
                        break
            except Exception:
                pass
            page.wait_for_timeout(300)
        else:
            raise RuntimeError("3012_MAP_TIMEOUT: a 3012 Home nao confirmou a view ExtJS dentro do limite.")

        if _surface(page.url) != "home":
            raise RuntimeError("3012_MAP_WRONG_SURFACE: somente /asymes/home e aceita para mapeamento 3012.")
        structure = page.evaluate(INSPECT_JS)
        safe = _safe_url(page.url)
        return {
            "ok": True,
            "kind": "3012_home_structure",
            "surface": "home",
            "view": ROUTE_3012,
            "url": safe,
            "generated_at": datetime.now().isoformat(timespec="seconds"),
            "read_only": True,
            "query_executed": False,
            "privacy": {
                "field_values_included": False,
                "cookies_included": False,
                "storage_included": False,
                "headers_included": False,
            },
            "structure": structure,
        }
