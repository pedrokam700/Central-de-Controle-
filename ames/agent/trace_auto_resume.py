"""Conservative automatic continuation for interrupted A-MES deep traces.

An operator repeating *the same* immutable 3028 selection should reuse
independently completed per-PCBA source captures.  A different source, day,
line, snapshot, mode, or filter is a new collection and cannot inherit that
decision.  3028 revision/content hashes may advance after local enrichment.
"""


def _identity(target):
    if not isinstance(target, dict):
        return None
    period = target.get('period') or {}
    if not isinstance(period, dict) or not period.get('start_at') or not period.get('end_at'):
        return None
    return (target.get('source_id'), str(target.get('snapshot_id') or ''),
            tuple(sorted(period.items())))


def same_scope(previous, current):
    if not isinstance(previous, dict) or not isinstance(current, dict):
        return False
    lines = previous.get('lines') or []
    if not lines or len(lines) != len(set(lines)) or set(lines) != set(current.get('lines') or []):
        return False
    prior_targets = previous.get('snapshot_targets') or {}
    new_targets = current.get('snapshot_targets') or {}
    if set(prior_targets) != set(lines) or set(new_targets) != set(lines):
        return False
    if any(not _identity(prior_targets[line]) or
           _identity(prior_targets[line]) != _identity(new_targets[line]) for line in lines):
        return False
    for key, default in (('trace_mode', 'full'), ('include_3012', True),
                         ('max_failures', 0), ('max_pcbas', 0)):
        old = previous.get(key, default)
        new = current.get(key, default)
        if key in ('max_failures', 'max_pcbas'):
            old, new = int(old or 0), int(new or 0)
        if old != new:
            return False
    codes = lambda cfg: sorted({str(c).strip() for c in (cfg.get('defect_codes') or []) if str(c).strip()})
    return codes(previous) == codes(current)


def needs_continuation(job):
    status = str(job.get('status') or '').lower()
    if status in ('error', 'cancelled', 'interrupted'):
        return True
    if status != 'done':
        return False
    stages = (job.get('result') or {}).get('stages') or {}
    # A finished job with partial sources is *not* a completed trace.
    return any(stage in ('partial', 'error', 'not_run') for source, stage in stages.items()
               if source != '3028')


def candidate(current, jobs):
    """Return the last incomplete SAME-scope job, never an older superseded one."""
    if current.get('force_new_run'):
        return None
    for job in sorted(jobs, key=lambda item: str(item.get('created_at') or ''), reverse=True):
        if job.get('kind') != 'deep_trace' or not same_scope(job.get('config'), current):
            continue
        return job if needs_continuation(job) else None
    return None
