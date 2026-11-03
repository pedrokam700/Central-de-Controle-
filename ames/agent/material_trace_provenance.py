"""Exact, read-only 3028 occurrence binding for 3074 deep trace evidence.

The factory 3074 flow hashes a PCBA/occurrence/index into a 12-character
checkpoint key. SQLite 3028 uses a separate 20-character observation key.
Neither key can be substituted for the other without checking source facts.
"""


def _field(row, key):
    return str((row or {}).get(key) or '').strip()


def exact_observation(source, observations):
    """Require a unique same-line, same-defect 3028 record; never join by SN alone."""
    if not isinstance(source, dict) or not all(
        _field(source, k) for k in ('line', 'pcba_sn', 'defect_time', 'defect_code')
    ):
        return None
    fields = ('line', 'pcba_sn', 'defect_time', 'defect_code', 'defect_desc')
    matches = [row for row in observations if all(
        _field(row, k) == _field(source, k) for k in fields
    ) and (not _field(source, 'product_model') or
           _field(row, 'product_model').upper() == _field(source, 'product_model').upper())]
    return matches[0] if len(matches) == 1 else None


def trace_material_links(payload, observations):
    """Legacy 3074 checkpoint-key -> verified 3028 key, by exact Material SN.

    Only confirmed material reuse rows enter this lookup. When multiple source
    rows contradict each other, leave the link unattributed for investigation.
    """
    found = {}
    ambiguous = set()
    for item in ((payload or {}).get('trace_3074') or {}).get('items') or []:
        pcba = _field(item, 'pcba_sn')
        for trace in item.get('defect_traces') or []:
            occurrence = trace.get('defect') or {}
            if _field(occurrence, 'pcba_sn') != pcba:
                continue
            matched = exact_observation(occurrence, observations)
            if matched is None:
                continue
            checkpoint_key = _field(trace, 'defect_key')
            if not checkpoint_key:
                continue
            for component in (trace.get('trace_3074') or {}).get('results') or []:
                if component.get('current_pcba_confirmed') is not True or not (
                    component.get('previous_pcba_count') or 0
                ):
                    continue
                item_sn = _field(component, 'item_sn')
                if not item_sn:
                    continue
                key = (pcba, checkpoint_key, item_sn)
                canonical_key = _field(matched, 'defect_key')
                if key in found and found[key] != canonical_key:
                    ambiguous.add(key)
                found[key] = canonical_key
    return {key: value for key, value in found.items() if key not in ambiguous}
