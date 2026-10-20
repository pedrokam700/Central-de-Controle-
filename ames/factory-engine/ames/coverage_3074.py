"""Audit of 3074 result completeness before declaring an SN fully captured."""
from __future__ import annotations

def classify_3074_page(grid):
    rows=grid.get("rows") or []
    raw_total=grid.get("store_total_count")
    actual=len(rows)
    try:
        total=int(raw_total) if raw_total not in (None,"") else None
    except (TypeError,ValueError):
        total=None
    if total is not None and total>=0 and total>actual:
        return {"status":"incomplete_page","returned":actual,"reported_total":total,"reason":"extjs_store_total_exceeds_loaded_rows"}
    return {"status":"returned","returned":actual,"reported_total":total,"reason":None}
