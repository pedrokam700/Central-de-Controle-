"""Plan a local-only retry for missing 3074/2114/3022 evidence.

All identities and captured results come from a single workstation snapshot,
never from a different day, line or remote Firebase revision.  A source marked
partial does not invalidate independently completed PCBA reads.
"""
import json
import re
from copy import deepcopy


def confirmed_3022_response(response, pcba, *, source_id=None, snapshot_id=None, line=None, period=None, revisions=None):
    """A confirmation cannot override contradictory explicit response facts.

    Legacy responses can lack optional metadata; individual confirmed reads in
    a partial batch remain reusable. A partial page is not a complete response.
    """
    if not isinstance(response, dict) or not isinstance(response.get('rows'), list):
        return False
    status = (response.get('query_diagnostics') or {}).get('status')
    if status not in ('CONFIRMED', 'CONFIRMED_EMPTY'):
        return False
    if status == 'CONFIRMED_EMPTY' and response['rows']:
        return False
    if (response.get('coverage') or {}).get('status') in ('incomplete_page', 'partial'):
        return False
    if period is not None and response.get('period') is not None and json.dumps(response['period'], sort_keys=True) != json.dumps(period, sort_keys=True):
        return False
    revision = response.get('snapshot_revision', response.get('revision'))
    if revisions is not None and revision is not None and (type(revision) is not int or revision not in revisions):
        return False
    for keys, expected in ((('query_sn', 'pcba_sn'), pcba), (('source_id',), source_id),
                           (('snapshot_id',), snapshot_id), (('line', 'line_id'), line)):
        values = {str(response[k]).strip() for k in keys if response.get(k) not in (None, '')}
        if len(values) > 1 or expected is not None and any(v != str(expected).strip() for v in values):
            return False
    # Same primary PCBA aliases as the collector. Do not compare Material SN or IMEI.
    identifiers = {'lotid', 'pcba', 'pcbasn', 'pcbaid', 'pcbaserialnumber', 'sn', 'serialnumber'}
    for row in response['rows']:
        if not isinstance(row, dict):
            return False
        for key, value in row.items():
            key = re.sub(r'[^a-z0-9]', '', str(key).split('__', 1)[0].lower())
            if key in identifiers and value not in (None, '') and str(value).strip() != pcba:
                return False
    return True


def _complete(status):
    return str(status or '').strip().upper() in ('COMPLETE', 'COMPLETED', 'DONE', 'COLLECTED')


def _bad_page(item):
    if not isinstance(item, dict):
        return True
    for key in ('coverage', 'base_coverage'):
        coverage = item.get(key)
        if isinstance(coverage, dict) and (
                coverage.get('status') == 'incomplete_page'
                or type(coverage.get('reported_total')) is not int
                or coverage.get('returned') != coverage.get('reported_total')):
            return True
    for key in ('base_query', 'query', 'trace_3074'):
        nested = item.get(key)
        if isinstance(nested, dict) and _bad_page(nested):
            return True
    for key in ('defect_traces', 'component_usage'):
        for nested in item.get(key) or []:
            if isinstance(nested, dict) and _bad_page(nested):
                return True
    return False


def _has_page_proof(item):
    if not isinstance(item, dict):
        return False
    if isinstance(item.get('coverage'), dict) or isinstance(item.get('base_coverage'), dict):
        return True
    return any(_has_page_proof(item.get(k)) for k in ('base_query', 'query', 'trace_3074'))


def verified_3074_items(captures, wanted=None):
    """Find independently completed 3074 PCBAs, including crash checkpoints.

    Never use a 2114 progress sample as complete graph evidence. A 3074 board
    is reusable only when its own item includes a completed, paged MES read;
    a list of processed SNs or a source-level 'done' is insufficient.
    """
    allowed = set(wanted) if wanted is not None else None
    verified = {}
    for envelope in captures or []:
        if envelope.get('source_view') != '3074':
            continue
        result = envelope.get('result') or {}
        for entry in result.get('items') or []:
            # Legacy bounded progress captures wrap the raw result in 'item'.
            item = entry.get('item') if isinstance(entry, dict) and entry.get('event_kind') == 'pcba_result' else entry
            if not isinstance(item, dict):
                continue
            sn = str(item.get('pcba_sn') or '').strip()
            if not sn or (allowed is not None and sn not in allowed):
                continue
            if not _complete(item.get('status')) or _bad_page(item) or not _has_page_proof(item):
                continue
            previous = verified.get(sn)
            # Prefer the richer complete record when a prior stage supplied
            # a fuller own-PCBA query; never replace it with an empty result.
            def quality(row):
                base = row.get('base_query') or {}
                return (len(base.get('rows') or []),len(row.get('defect_traces') or []))
            if previous is None or quality(item) >= quality(previous):
                verified[sn] = item
    return verified


def verified_3022_items(captures, wanted=None):
    """Only full per-PCBA responses from an identified 3022 MES query."""
    allowed=set(wanted) if wanted is not None else None
    verified={}
    for envelope in captures or []:
        if envelope.get('source_view')!='3022':continue
        result=envelope.get('result') or {}
        if result.get('checkpoint_kind')!='per_pcba_complete_v1':continue
        for item in result.get('pcbas') or []:
            if not isinstance(item,dict) or not _complete(item.get('status')):continue
            sn=str(item.get('pcba_sn') or '').strip()
            rr=item.get('result') or {}
            diagnostics=rr.get('query_diagnostics') or {}
            if sn and (allowed is None or sn in allowed) and confirmed_3022_response(rr, sn):
                previous = verified.get(sn)
                # A later empty read cannot retract a positively observed
                # historical passage. Reuse that complete response as-is;
                # never union pages or fabricate another MES confirmation.
                if previous is None or rr['rows'] or not previous['rows']:
                    verified[sn]=rr
    return verified


def pending_pcbas(base_sns, captures):
    """Return per-view pending lists, preserving earlier independently good SNs.

    A missing capture means that source has never been collected for the scope,
    so it remains pending. Unknown or malformed status is never certified.
    """
    ordered = list(dict.fromkeys(str(sn).strip() for sn in base_sns if str(sn).strip()))
    wanted = set(ordered)
    verified = {view: set() for view in ('3074', '2114', '3022')}
    observed = {view: False for view in verified}
    failed_related_history, recovered_related_history = set(), set()
    verified['3074'].update(verified_3074_items(captures, wanted))
    verified['3022'].update(verified_3022_items(captures, wanted))
    for envelope in captures or []:
        view = str(envelope.get('source_view') or '')
        if view not in verified:
            continue
        result = envelope.get('result') or {}
        observed[view] = True
        # A bounded 2114 event has no proof that the historical-PCBA graph
        # was exhausted. Only its *final source capture* can skip that read.
        if view == '2114' and result.get('checkpoint_kind') == 'bounded_partial_progress':
            continue
        rows = (result.get('items') if view == '3074' else result.get('pcbas')) or []
        for item in rows:
            if not isinstance(item, dict):
                continue
            sn = str(item.get('pcba_sn') or '').strip()
            if view == '2114' and sn and sn not in wanted:
                (recovered_related_history if _complete(item.get('status'))
                 else failed_related_history).add(sn)
            if sn not in wanted or not _complete(item.get('status')):
                continue
            if view == '3074' and (_bad_page(item) or not _has_page_proof(item)):
                continue
            if view == '3022':
                # A terminal label from a legacy source response is NOT a
                # query-response checkpoint. Only the independently verified
                # per-PCBA rows with CONFIRMED/CONFIRMED_EMPTY MES diagnostics
                # may suppress a new 3022 query (see verified_3022_items).
                # Never override those proofs by trusting a generic COMPLETE.
                continue
            verified[view].add(sn)
        # Per-board proof takes precedence. A source-level COMPLETE with no
        # per-board records is not proof of which PCBAs were queried.
    if failed_related_history - recovered_related_history:
        # A failed historical PCBA was reached through a component query, not
        # directly from 3028. Without a proven reverse parent mapping, redo
        # the selected base PCBAs so the 2114 graph can be rebuilt safely.
        verified['2114'].clear()
    return {'pending': {view: [sn for sn in ordered if sn not in verified[view]]
                        for view in verified},
            'verified': {view: len(verified[view]) for view in verified},
            'capture_seen': observed, 'total_pcbas': len(ordered),
            'historical_2114_retry_requires_parent_discovery': bool(
                failed_related_history - recovered_related_history)}


def load_captures(store, snapshot_id, line):
    """Read only recorded captures belonging to this exact local line/snapshot."""
    with store.connect() as con:
        owner = con.execute("SELECT value FROM schema_meta WHERE key='ames_source_id'").fetchone()[0]
        parents = {r['revision']: json.loads(r['payload']) for r in con.execute(
            'SELECT revision,payload FROM mes_revisions WHERE snapshot_id=? AND line=?', (int(snapshot_id), line))}
        rows = con.execute("""SELECT r.payload_json FROM snapshot_payload_revisions r
            WHERE r.snapshot_id=? AND r.kind LIKE 'source_capture_%'
            ORDER BY r.revision ASC""", (int(snapshot_id),)).fetchall()
    results = []
    for raw in rows:
        try:
            doc = json.loads(raw['payload_json'])
        except (ValueError, TypeError, KeyError):
            continue
        if (doc.get('schema') == 'ames-local-source-capture-v1'
                and doc.get('line_id') == line
                and str(doc.get('snapshot_id')) == str(snapshot_id)
                and doc.get('source_id') in (None, owner)
                and isinstance(doc.get('result'), dict)):
            parent = parents.get(doc.get('parent_snapshot_revision'))
            if doc.get('parent_snapshot_revision') is not None and (not parent
                    or doc.get('parent_content_hash') not in (None, parent['content_hash'])
                    or doc.get('period') is not None and doc['period'] != parent['summary']['period']):
                continue
            results.append(doc)
    return results


def merge_integrated(previous, retry, summarize_3074):
    """Retain successful older evidence when a bounded retry returns fewer SNs.

    This is a local, explicitly labeled union of verified *read observations*;
    it must not certify a full 3074 MES page or create additional use cycles.
    """
    if not isinstance(previous, dict) or not previous.get('trace_3074'):
        return retry
    merged = deepcopy(retry)
    old3074 = previous.get('trace_3074') or {}
    new3074 = retry.get('trace_3074') or {}
    older = {str(x.get('pcba_sn') or ''): x for x in old3074.get('items') or [] if isinstance(x, dict)}
    for row in new3074.get('items') or []:
        sn = str(row.get('pcba_sn') or '')
        old = older.get(sn)
        if (old is None or
                (_complete(row.get('status')) and not _bad_page(row)) or
                not (_complete(old.get('status')) and not _bad_page(old))):
            older[sn] = row
    merged3074 = {**old3074, **new3074, 'items': list(older.values()),
                  'union_of_local_observations': True}
    count = len(older)
    merged3074['requested_pcba_count'] = count
    merged3074['processed_pcba_count'] = sum(_complete(x.get('status')) for x in older.values())
    merged3074['pcba_error_count'] = sum(not _complete(x.get('status')) for x in older.values())
    merged3074['unique_pcba_count'] = count
    merged3074.update(summarize_3074(merged3074))
    merged['trace_3074'] = merged3074
    old2114 = previous.get('trace_2114') or {}
    new2114 = retry.get('trace_2114') or {}
    histories = {str(x.get('pcba_sn') or ''): x for x in old2114.get('pcbas') or [] if isinstance(x, dict)}
    for row in new2114.get('pcbas') or []:
        sn = str(row.get('pcba_sn') or '')
        old = histories.get(sn)
        if old is None or _complete(row.get('status')) or not _complete(old.get('status')):
            histories[sn] = row
    merged2114 = {**old2114, **new2114, 'pcbas': list(histories.values()),
                  'union_of_local_observations': True}
    merged2114['requested_pcba_count'] = len(histories)
    merged2114['processed_pcba_count'] = sum(_complete(x.get('status')) for x in histories.values())
    merged2114['pcba_error_count'] = len(histories)-merged2114['processed_pcba_count']
    merged2114['source_status'] = ('COMPLETE' if not merged2114['pcba_error_count'] else 'PARTIAL')
    merged2114['status'] = merged2114['source_status']
    for key in ('contexts', 'current_contexts'):
        seen = set()
        both = []
        for context in [*(old2114.get(key) or []), *(new2114.get(key) or [])]:
            marker = json.dumps(context, sort_keys=True, ensure_ascii=False, default=str)
            if marker not in seen:
                seen.add(marker)
                both.append(context)
        merged2114[key] = both
    merged['trace_2114'] = merged2114
    merged['union_of_local_observations'] = True
    return merged
