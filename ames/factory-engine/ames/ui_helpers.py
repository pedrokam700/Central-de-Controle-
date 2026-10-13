import re
from core.normalizacao import normalizar_texto

def _visible(locator):
    try:
        return locator.is_visible(timeout=500)
    except Exception:
        return False

def frame_score(frame, hints):
    score = 0
    try:
        text = frame.locator("body").inner_text(timeout=1200)
    except Exception:
        text = ""
    text_n = normalizar_texto(text)
    for hint in hints:
        if normalizar_texto(hint) in text_n:
            score += 1
    return score

def ranked_frames(page, hints=()):
    frames = list(page.frames)
    return sorted(frames, key=lambda f: frame_score(f, hints), reverse=True)

def find_text_input(page, labels=(), name_contains=(), frame_hints=()):
    encontrados = []
    for frame in ranked_frames(page, frame_hints):
        for label in labels:
            try:
                loc = frame.get_by_label(label, exact=False)
                if loc.count() and _visible(loc.first):
                    encontrados.append((frame, loc.first, f"label:{label}"))
            except Exception:
                pass
        try:
            inputs = frame.locator("input:not([type=hidden]), textarea")
            for i in range(min(inputs.count(), 120)):
                el = inputs.nth(i)
                if not _visible(el):
                    continue
                attrs = " ".join([
                    el.get_attribute("id") or "",
                    el.get_attribute("name") or "",
                    el.get_attribute("placeholder") or "",
                ])
                attrs_n = normalizar_texto(attrs)
                if any(normalizar_texto(x) in attrs_n for x in name_contains):
                    encontrados.append((frame, el, f"attrs:{attrs}"))
        except Exception:
            pass

    unicos, vistos = [], set()
    for frame, el, origem in encontrados:
        key = (frame.url, el.get_attribute("id") or "", el.get_attribute("name") or "")
        if key not in vistos:
            vistos.add(key)
            unicos.append((frame, el, origem))
    if len(unicos) == 1:
        return unicos[0]
    if not unicos:
        raise RuntimeError("Nenhum campo de entrada compativel foi localizado.")
    return unicos[0]

def find_button(page, texts, frame_hints=()):
    candidatos = []
    for frame in ranked_frames(page, frame_hints):
        for text in texts:
            try:
                loc = frame.get_by_role("button", name=re.compile(rf"^{re.escape(text)}$", re.I))
                if loc.count() and _visible(loc.first):
                    candidatos.append((frame, loc.first, f"text:{text}"))
            except Exception:
                pass
    if not candidatos:
        raise RuntimeError(f"Nenhum botao compativel com {texts} foi localizado.")
    return candidatos[0]

def _clean_headers(values):
    return [re.sub(r"\s+", " ", (v or "")).strip() for v in values]

def _unique_headers(headers):
    counts, out = {}, []
    for h in _clean_headers(headers):
        base = h or "col"
        counts[base] = counts.get(base, 0) + 1
        out.append(base if counts[base] == 1 else f"{base}__{counts[base]}")
    return out

def _score_headers(headers, expected):
    hn = [normalizar_texto(h.split("__")[0]) for h in headers]
    en = [normalizar_texto(e) for e in expected]
    return sum(1 for e in en if any(e == h or e in h or h in e for h in hn if h))

def extract_extjs_store_grid(page, expected_headers=()):
    candidates = []
    js = r"""
    () => {
      if (!window.Ext || !Ext.ComponentQuery) return [];
      const grids = Ext.ComponentQuery.query('gridpanel');
      return grids.map(g => {
        let cols = [];
        try {
          const gc = g.headerCt && g.headerCt.getGridColumns ? g.headerCt.getGridColumns() : (g.columns || []);
          cols = gc.map(c => ({
            text: String(c.text || c.header || ''),
            dataIndex: String(c.dataIndex || '')
          }));
        } catch(e) {}
        let records = [];
        let storeLoading = null;
        let storeCount = null;
        let storeTotalCount = null;
        try {
          const s = g.getStore && g.getStore();
          if (s) {
            if (s.isLoading) storeLoading = !!s.isLoading();
            if (s.getCount) storeCount = s.getCount();
            if (s.getTotalCount) storeTotalCount = s.getTotalCount();
            s.each(r => records.push(Object.assign({}, r.data)));
          }
        } catch(e) {}
        return {
          id: g.id || '',
          columns: cols,
          records: records,
          storeLoading: storeLoading,
          storeCount: storeCount,
          storeTotalCount: storeTotalCount
        };
      });
    }
    """
    for frame in page.frames:
        try:
            grids = frame.evaluate(js)
        except Exception:
            continue
        for g in grids or []:
            headers = [c.get("text", "") for c in g.get("columns", [])]
            score = _score_headers(headers, expected_headers)
            if score <= 0:
                continue
            unique = _unique_headers(headers)
            rows = []
            for rec in g.get("records", []):
                row = {}
                for i, col in enumerate(g.get("columns", [])):
                    di = col.get("dataIndex", "")
                    row[unique[i]] = rec.get(di) if di else None
                rows.append(row)
            candidates.append((score, len(rows), {
                "kind": "extjs_store",
                "grid_id": g.get("id", ""),
                "headers": unique,
                "rows": rows,
                "frame_url": frame.url,
                "store_loading": g.get("storeLoading"),
                "store_count": g.get("storeCount"),
                "store_total_count": g.get("storeTotalCount"),
            }))
    if not candidates:
        raise RuntimeError("Nenhuma grid ExtJS compativel encontrada.")
    candidates.sort(key=lambda x: (x[0], x[1]), reverse=True)
    return candidates[0][2]

def _rows_to_dict(headers, rows):
    headers = _unique_headers(headers)
    out = []
    for row in rows:
        vals = [re.sub(r"\s+", " ", (v or "")).strip() for v in row]
        if not any(vals):
            continue
        if len(vals) < len(headers):
            vals += [""] * (len(headers) - len(vals))
        out.append({headers[i]: vals[i] for i in range(min(len(headers), len(vals)))})
    return out

def extract_grids_from_frame(frame):
    grids = []
    try:
        tables = frame.locator("table")
        for ti in range(min(tables.count(), 50)):
            table = tables.nth(ti)
            trs = table.locator("tr")
            if trs.count() < 2:
                continue
            cells0 = trs.nth(0).locator("th")
            if not cells0.count():
                cells0 = trs.nth(0).locator("td")
            headers = [cells0.nth(i).inner_text(timeout=500) for i in range(cells0.count())]
            rows = []
            for ri in range(1, min(trs.count(), 5000)):
                cells = trs.nth(ri).locator("td")
                rows.append([cells.nth(ci).inner_text(timeout=500) for ci in range(cells.count())])
            if headers and rows:
                grids.append({"kind":"table","headers":_unique_headers(headers),"rows":_rows_to_dict(headers,rows)})
    except Exception:
        pass
    return grids

def extract_best_grid(page, expected_headers=(), frame_hints=()):
    # V0.4: prioriza o STORE do ExtJS. Isso evita menu lateral,
    # cabecalhos duplicados e grids virtualizadas.
    try:
        grid = extract_extjs_store_grid(page, expected_headers)
        grid["score"] = _score_headers(grid["headers"], expected_headers)
        return grid
    except Exception:
        pass

    candidatos = []
    for frame in ranked_frames(page, frame_hints):
        for grid in extract_grids_from_frame(frame):
            score = _score_headers(grid["headers"], expected_headers)
            candidatos.append((score, len(grid["rows"]), grid, frame.url))
    if not candidatos:
        raise RuntimeError("Nenhuma grade/tabela de dados foi localizada na tela.")
    candidatos.sort(key=lambda x: (x[0], x[1]), reverse=True)
    score, _, grid, frame_url = candidatos[0]
    grid["frame_url"] = frame_url
    grid["score"] = score
    return grid
