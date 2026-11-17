"""Read-only diagnosis of saved 3022 evidence. Absence is never physical zero."""
import json

import production_shift
from partial_retry import confirmed_3022_response


def export_diagnostics(con, sid, line, source_id, observations, contexts):
    tables = {row[0] for row in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    raw_boards = {row[0] for row in con.execute(
        'SELECT DISTINCT pcba_sn FROM process_raw_events WHERE snapshot_id=?', (sid,))} if 'process_raw_events' in tables else set()
    queries = {}
    # Validate JSON as before, without materializing all old datasets in Python.
    # Parent identity is still read from its payload, never trusted from a
    # potentially contradictory column or from an unrelated revision.
    bad = con.execute('SELECT payload FROM mes_revisions WHERE snapshot_id=? AND line=? AND NOT json_valid(payload) LIMIT 1', (sid,line)).fetchone()
    if bad:
        json.loads(bad[0])
    parents = {}
    indexed = production_shift.occurrence_index(contexts)
    boards = {ctx.get('pcba_sn') for ctx in contexts}
    for row in con.execute("SELECT payload_json FROM snapshot_payload_revisions WHERE snapshot_id=? AND kind LIKE 'source_capture_%' ORDER BY revision", (sid,)):
        try:
            doc = json.loads(row[0])
        except (ValueError, TypeError):
            continue
        if (doc.get('schema') != 'ames-local-source-capture-v1' or doc.get('source_view') != '3022'
                or doc.get('line_id') != line or str(doc.get('snapshot_id')) != str(sid)
                or doc.get('source_id') not in (None, source_id)):
            continue
        revision = doc.get('parent_snapshot_revision')
        if revision is not None and revision not in parents:
            row = con.execute("SELECT json_extract(payload,'$.content_hash','$.summary.period') FROM mes_revisions WHERE snapshot_id=? AND line=? AND revision=?", (sid,line,revision)).fetchone()
            metadata = json.loads(row[0]) if row else None
            parents[revision] = {'content_hash':metadata[0],'summary':{'period':metadata[1]}} if metadata is not None else None
        parent = parents.get(revision)
        if doc.get('parent_snapshot_revision') is not None and (not parent
                or doc.get('parent_content_hash') not in (None, parent['content_hash'])
                or doc.get('period') is not None and doc['period'] != parent['summary']['period']):
            continue
        for item in (doc.get('result') or {}).get('pcbas') or []:
            sn = item.get('pcba_sn')
            if not sn:
                continue
            response = item.get('result') or {}
            verified = confirmed_3022_response(response, sn, source_id=source_id, snapshot_id=sid, line=line)
            state = 'CONFIRMED_EMPTY' if verified and not response['rows'] else 'CONFIRMED' if verified else 'PARTIAL'
            if verified or queries.get(sn) not in ('CONFIRMED', 'CONFIRMED_EMPTY'):
                queries[sn] = state
    result = []
    for rec in observations:
        sn = rec['pcba_sn']
        matched = [ctx for ctx in indexed.get(production_shift.occurrence_key(rec,required=True), ()) if production_shift.same_occurrence(rec, ctx) and ctx.get('defect_key') == rec.get('defect_key')]
        proven = production_shift.proven_context(matched)
        issues = [production_shift.reference_problem(ctx) for ctx in matched]
        query = queries.get(sn) or ('RAW_OBSERVED' if sn in raw_boards else 'UNKNOWN')
        if proven:
            code = 'PROVEN'
        elif any(issue is None for issue in issues):
            code = 'CONFLICTING_REFERENCES'
        elif matched:
            priority = ('TIMEZONE_CONFLICT', 'INVALID_DEFECT_TIME', 'INVALID_REFERENCE_TIME', 'FUTURE_REFERENCE', 'AT_REFERENCE')
            code = next((issue for issue in priority if issue in issues), issues[0])
        elif sn in boards:
            code = 'NO_EXACT_OCCURRENCE'
        elif query == 'PARTIAL':
            code = 'PARTIAL_QUERY'
        elif query != 'UNKNOWN':
            code = 'CONTEXT_NOT_LOADED'
        else:
            code = 'PCBA_NOT_QUERIED'
        result.append({k: rec.get(k) for k in ('defect_key', 'pcba_sn', 'defect_code', 'defect_time')} | {
            'source_id': source_id, 'snapshot_id': str(sid), 'line': line,
            'code': code, 'query_state': query, 'matched_contexts': len(matched),
            'identical_duplicates': max(0, len(matched) - len({(ctx.get('reference_station_code'), ctx.get('reference_event_time'), ctx.get('reference_status'), ctx.get('reference_rule_id')) for ctx in matched})),
            'physical_absence_proven': False})
    return result
