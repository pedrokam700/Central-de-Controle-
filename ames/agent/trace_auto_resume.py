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
    result = job.get('result') or {}
    stages = result.get('stages') or {}
    scope = job.get('scope') or {}
    completed_scope = result.get('scope') or {}
    config = job.get('config') or {}
    mode = (scope.get('trace_mode') or completed_scope.get('trace_mode')
            or config.get('trace_mode') or 'full')
    required = {
        'full': {'3074', '2114', '3022'},
        'reuse_only': {'3074', '2114'},
        'process_only': {'3022'},
        'history_only': {'3012'},
    }.get(mode)
    if required is None:
        return True  # Unknown job contract is not proof of completion.
    # The historic 3012 was intentionally excluded from Full/Reuso by the
    # explicit opt-in. Its "not_run" status must not trigger another recovery.
    # Legacy jobs with no flag did include it by default; preserve that scope.
    include_3012 = next((src['include_3012'] for src in (scope, completed_scope, config)
                         if 'include_3012' in src), mode in {'full', 'reuse_only', 'history_only'})
    if include_3012 or mode == 'history_only':
        required.add('3012')
    # Missing required stages are unproven, even when the scheduler says done.
    return any(stages.get(source) not in ('done', 'preserved') for source in required)


def candidate(current, jobs):
    """Return the last incomplete SAME-scope job, never an older superseded one."""
    if current.get('force_new_run'):
        return None
    for job in sorted(jobs, key=lambda item: str(item.get('created_at') or ''), reverse=True):
        if job.get('kind') != 'deep_trace' or not same_scope(job.get('config'), current):
            continue
        return job if needs_continuation(job) else None
    return None
