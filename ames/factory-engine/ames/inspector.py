import json
import re
from datetime import datetime
from pathlib import Path


def _safe_text(locator, limit=120):
    try:
        txt = locator.inner_text(timeout=700).strip()
    except Exception:
        try:
            txt = locator.get_attribute("value") or ""
        except Exception:
            txt = ""
    txt = re.sub(r"\s+", " ", txt)
    return txt[:limit]


def _collect_frame(frame):
    data = {
        "name": frame.name,
        "url": frame.url,
        "inputs": [],
        "buttons": [],
        "links": [],
        "tables": [],
        "extjs": {}
    }
    try:
        loc = frame.locator("input, textarea, select")
        for i in range(min(loc.count(), 300)):
            el = loc.nth(i)
            data["inputs"].append({
                "index": i,
                "tag": el.evaluate("e => e.tagName"),
                "type": el.get_attribute("type"),
                "id": el.get_attribute("id"),
                "name": el.get_attribute("name"),
                "placeholder": el.get_attribute("placeholder"),
                "value": el.get_attribute("value"),
                "visible": el.is_visible()
            })
    except Exception as exc:
        data["inputs_error"] = str(exc)

    try:
        loc = frame.locator("button, input[type=button], input[type=submit]")
        for i in range(min(loc.count(), 300)):
            el = loc.nth(i)
            data["buttons"].append({
                "index": i,
                "id": el.get_attribute("id"),
                "name": el.get_attribute("name"),
                "value": el.get_attribute("value"),
                "text": _safe_text(el),
                "visible": el.is_visible()
            })
    except Exception as exc:
        data["buttons_error"] = str(exc)

    try:
        tables = frame.locator("table")
        for i in range(min(tables.count(), 80)):
            table = tables.nth(i)
            data["tables"].append({
                "index": i,
                "rows": table.locator("tr").count(),
                "headers": [
                    _safe_text(table.locator("th").nth(j))
                    for j in range(min(table.locator("th").count(), 80))
                ]
            })
    except Exception as exc:
        data["tables_error"] = str(exc)

    for sel in [".x-grid3-row", ".x-grid-item", ".x-grid-row", ".x-grid3-hd-inner", ".x-column-header-text"]:
        try:
            data["extjs"][sel] = frame.locator(sel).count()
        except Exception:
            data["extjs"][sel] = 0
    return data


def inspecionar_tela(browser, log_dir: Path, hint="3074"):
    log_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    page = browser.choose_active_page(hint)
    payload = {
        "captured_at": stamp,
        "hint": hint,
        "page_title": page.title(),
        "page_url": page.url,
        "frames": [_collect_frame(frame) for frame in page.frames]
    }

    base = f"estrutura_{hint}_{stamp}"
    json_path = log_dir / f"{base}.json"
    json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    try:
        page.screenshot(path=str(log_dir / f"{base}.png"), full_page=True)
    except Exception:
        pass

    for idx, frame in enumerate(page.frames):
        try:
            (log_dir / f"{base}_frame_{idx}.html").write_text(frame.content(), encoding="utf-8")
        except Exception:
            pass
    return json_path
