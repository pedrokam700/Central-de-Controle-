"""Read-only recovery of selective 3074/2114 batches of ONE local 3028 snapshot.

Only exact current 3028 occurrence identities and the explicitly selected
physical line may contribute. Does not write SQLite or open MES.
"""
from copy import deepcopy


def _ident(row):
    if not isinstance(row, dict):
        return None
    return (str(row.get("pcba_sn") or "").strip(),
            str(row.get("defect_code") or "").strip(),
            str(row.get("defect_time") or "").strip())


def _complete(row):
    return str(row.get("status") or "").upper() == "COMPLETE"


def _old_pcbas(item):
    allowed = set()
    for trace in item.get("defect_traces") or []:
        for comp in (trace.get("trace_3074") or {}).get("results") or []:
            if comp.get("current_pcba_confirmed") is not True:
                continue
            for pcba in comp.get("previous_pcbas") or []:
                if isinstance(pcba, str) and pcba.strip():
                    allowed.add(pcba.strip())
    return allowed


def _confirmed_self_rows(query, pcba):
    """Only physical self-bindings from a proven, PCBA-scoped 3074 refresh.

    A second query may have different pagination and expose an older mounting.
    It does not prove an entire population or authorize copying other materials.
    """
    if not isinstance(query, dict) or query.get("query_sn") != pcba:
        return []
    if query.get("query_confirmation") not in {"STORE_REFRESH_AFTER_VIEW", "EXACT_QUERY_ROW"}:
        return []
    result = []
    for row in query.get("rows") or []:
        if not isinstance(row, dict) or str(row.get("Barcode") or "").strip() != pcba:
            continue
        if (str(row.get("Aut Cmf1") or "").strip().upper() != "PCBA"
                and "pcba" not in str(row.get("Sn Type") or "").lower()):
            continue
        if not str(row.get("Bind Time") or "").strip():
            continue
        result.append(row)
    return result


def _reconcile_self_mountings(selected_query, candidates, pcba):
    """Union verified PCBA mounting rows only; never fill missing components.

    An updated Unbind/status for the same mounting is one physical cycle.
    The latest verified row wins for a matching SN+Bind Time+operation, while
    station rows from separate operations may still describe one cycle.
    """
    selected_rows = _confirmed_self_rows(selected_query, pcba)
    if not selected_rows:
        return selected_query, 0
    selected_binds = {str(row.get("Bind Time") or "").strip() for row in selected_rows}
    confirmed = []
    revisions_with_proof = set()
    for revision, query in candidates:
        current_rows = _confirmed_self_rows(query, pcba)
        if current_rows:
            revisions_with_proof.add(revision)
        for row in current_rows:
            confirmed.append((revision, row))
    discovered_binds = {str(row.get("Bind Time") or "").strip() for _, row in confirmed}
    # Same-session pagination or a later status update to an existing bind is
    # not another use. Require independent proven captures and a genuinely
    # older/newer mounting not present in the selected response.
    if len(revisions_with_proof) < 2 or not (discovered_binds - selected_binds):
        return selected_query, 0

    merged = deepcopy(selected_query)
    original = merged.get("rows") or []
    # The unrelated material rows remain exactly those of the selected capture.
    others = [row for row in original if not (
        isinstance(row, dict) and str(row.get("Barcode") or "").strip() == pcba
        and (str(row.get("Aut Cmf1") or "").strip().upper() == "PCBA"
             or "pcba" in str(row.get("Sn Type") or "").lower()))]
    by_mounting = {}
    for revision, row in confirmed:
        key = (str(row.get("Barcode") or "").strip(),
               str(row.get("Bind Time") or "").strip(),
               str(row.get("Operation") or "").strip())
        # Prefer the latest proven observation; a later Unbind is an update,
        # not a second mounting or a reason to double-count the old active row.
        if key not in by_mounting or revision > by_mounting[key][0]:
            by_mounting[key] = (revision, deepcopy(row))
    merged["rows"] = others + [entry[1] for entry in by_mounting.values()]
    # Reconciled rows are an observation set, not a complete MES page.
    merged["recovered_self_mountings_only"] = True
    merged["coverage"] = {"status": "incomplete_page", "reason": "read_only_self_mounting_union"}
    return merged, len(discovered_binds - selected_binds)


def recover_snapshot_line(versions, line, base_rows):
    """Return conservative recovered payload and non-sensitive diagnostics.

    The caller must supply revisions from the SAME store and snapshot_id.
    An exact PCBA+defect_code+defect_time+line match is mandatory; no global
    search, similarity match, borrowing another day or fallback to other lines.
    """
    if not isinstance(line, str) or not line.strip():
        raise ValueError("The selected physical line is required")
    expected = {
        _ident(r) for r in base_rows
        if isinstance(r, dict) and str(r.get("line") or r.get("line_id") or "") == line
        and _ident(r) and all(_ident(r))
    }
    if not expected:
        return None, {"reason": "no_base_occurrences", "versions_checked": len(versions)}
    by_pcba = {}
    rejected = 0
    for version_index, payload in enumerate(versions):
        if not isinstance(payload, dict):
            continue
        for item in (payload.get("trace_3074") or {}).get("items") or []:
            if not isinstance(item, dict):
                rejected += 1
                continue
            sn = str(item.get("pcba_sn") or "").strip()
            if not sn or not any(x[0] == sn for x in expected):
                rejected += 1
                continue
            matches = []
            for trace in item.get("defect_traces") or []:
                d = trace.get("defect") or {}
                key = (sn, str(d.get("defect_code") or "").strip(),
                       str(d.get("defect_time") or "").strip())
                if str(d.get("line") or d.get("line_id") or "").strip() == line and key in expected:
                    matches.append((key, deepcopy(trace)))
            if not matches:
                rejected += 1
                continue
            board = by_pcba.setdefault(sn, {"traces": {}, "bases": [], "source": {}})
            source = deepcopy(item)
            for key, trace in matches:
                quality = (int(_complete(trace) and _complete(item)), version_index)
                if key not in board["traces"] or quality > board["traces"][key][0]:
                    board["traces"][key] = (quality, trace)
                    board["source"][key] = source
            # A 3074 base query is for the matched current PCBA, not for
            # arbitrary other identities discovered by the component query.
            if (item.get("base_query") or {}).get("rows"):
                board["bases"].append((version_index, deepcopy(item["base_query"])))
    if not by_pcba:
        return None, {"reason": "no_matching_integrated_items",
                      "versions_checked": len(versions), "rejected_items": rejected,
                      "expected_pcbas": len({x[0] for x in expected})}
    items = []
    self_linked = set()
    merged_self_pcbas = set()
    permitted_history = set()
    for sn, board in sorted(by_pcba.items()):
        traces = {k: value[1] for k, value in board["traces"].items()}
        source = next(reversed(board["source"].values()))
        item = deepcopy(source)
        item["defect_traces"] = list(traces.values())
        item["current_defects"] = [deepcopy(t.get("defect") or {}) for t in traces.values()]
        # Preserve all rows of the chosen latest base query as they are required
        # to recover PCBA self-use (Barcode + Aut Cmf1), not just material use.
        if board["bases"]:
            def base_score(pair):
                _, query = pair
                own_rows = [row for row in query.get("rows") or []
                            if str(row.get("Barcode") or "").strip() == sn]
                self_rows = [row for row in own_rows
                             if str(row.get("Aut Cmf1") or "").strip().upper() == "PCBA"
                             or "pcba" in str(row.get("Sn Type") or "").lower()]
                return (bool(self_rows), len(own_rows), pair[0])
            selected = max(board["bases"], key=base_score)[1]
            item["base_query"], merged_count = _reconcile_self_mountings(
                selected, board["bases"], sn)
            if merged_count and item["base_query"] is not selected:
                merged_self_pcbas.add(sn)
            for row in (item["base_query"].get("rows") or []):
                if str(row.get("Barcode") or "").strip() != sn:
                    continue
                if str(row.get("Aut Cmf1") or "").strip().upper() == "PCBA" or "pcba" in str(row.get("Sn Type") or "").lower():
                    self_linked.add(sn)
                    break
        item["status"] = ("COMPLETE" if (
            all(_complete(t) for t in item["defect_traces"])
            and all(_complete(board["source"][key]) for key in traces)
        ) else "PARTIAL")
        items.append(item)
        permitted_history.add(sn)
        permitted_history.update(_old_pcbas(item))
    # Prefer the richest verified 2114 read for this exact PCBA/snapshot.
    # A later selective/partial read can return fewer Hist Seq rows despite
    # status COMPLETE; it must not erase an earlier full history.
    def history_quality(entry, revision_index):
        rows = ((entry or {}).get("result") or {}).get("rows") or []
        ordered = {str(r.get("Defect Hist Seq")).strip()
                   for r in rows if isinstance(r, dict)
                   and r.get("Defect Hist Seq") is not None
                   and str(r.get("Defect Hist Seq")).strip()
                   and (r.get("Defect Code") or r.get("Defect Description"))}
        return (int(_complete(entry)), len(ordered), len(rows), revision_index)

    history = {}
    history_score = {}
    contexts = {}
    current_contexts = {}
    current_sns = {x["pcba_sn"] for x in items}
    for revision_index, payload in enumerate(versions):
        trace = (payload or {}).get("trace_2114") or {}
        for row in trace.get("pcbas") or []:
            sn = str(row.get("pcba_sn") or "").strip()
            if sn not in permitted_history:
                continue
            quality = history_quality(row, revision_index)
            if sn not in history or quality > history_score[sn]:
                history[sn] = deepcopy(row)
                history_score[sn] = quality
        for name, dest in (("contexts", contexts), ("current_contexts", current_contexts)):
            for row in trace.get(name) or []:
                if str(row.get("line") or row.get("line_id") or "").strip() != line:
                    continue
                if str(row.get("current_pcba") or "").strip() not in current_sns:
                    continue
                key = str(row.get("context_key") or "").strip()
                if key:
                    dest[key] = deepcopy(row)
    result = {
        "trace_3074": {"items": items, "source_status": "PARTIAL",
                       "requested_pcba_count": len({x[0] for x in expected}),
                       "processed_pcba_count": sum(_complete(i) for i in items),
                       "pcba_error_count": sum(str(i.get("status") or "").upper() == "ERROR" for i in items)},
        "trace_2114": {"pcbas": list(history.values()), "contexts": list(contexts.values()),
                       "current_contexts": list(current_contexts.values()), "source_status": "PARTIAL"},
        "read_only_reconstruction": True
    }
    return result, {"reason": "read_only_local_recovery", "versions_checked": len(versions),
        "recovered_pcbas": len(items), "expected_pcbas": len({x[0] for x in expected}),
        "pcbas_with_3074_self_binding": len(self_linked),
        "pcbas_with_reconciled_self_mountings": len(merged_self_pcbas),
        "line_pcbas": len({x[0] for x in expected}),
        "historical_pcbas_proven": len(history),
        "rejected_items": rejected, "source_complete": False}
