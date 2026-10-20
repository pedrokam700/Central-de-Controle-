"""Conservative, inspectable relation of workstation-wide 3012 history to 3028.

Reuse the PR #36 identity rule: PCBA + defect code + defect instant.
Even an exact match is a *candidate*, never a proven performed repair.
Timezone-less factory timestamps are interpreted at fixed -03:00,
independent of runner workstation locale. Date-only timestamps are invalid.
"""
from datetime import datetime, timedelta, timezone
import re

_FACTORY_TZ=timezone(timedelta(hours=-3))


def _text(value):
    return str(value or '').strip()


def _instant(value):
    raw=_text(value)
    if not re.match(r'^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:[Zz]|[+-]\d{2}:?\d{2})?$',raw):
        return None
    try:
        prepared=raw.replace(' ','T').replace('z','Z').replace('Z','+00:00')
        dt=datetime.fromisoformat(prepared)
        if dt.tzinfo is None:
            dt=dt.replace(tzinfo=_FACTORY_TZ)
        return dt.astimezone(timezone.utc)
    except (ValueError,TypeError):
        return None


def classify_3012_for_occurrence(occurrence,repair):
    """Enrich candidate provenance WITHOUT inventing the repair linkage.

    Distinct dated/code evidence remains visible at PCBA-history level, but
    cannot be counted as evidence of repair for this specific occurrence.
    """
    sn=_text(occurrence.get('pcba_sn'))
    other=_text(repair.get('pcba_sn'))
    if not sn or not other or sn!=other:
        return {
            'association':'unrelated','occurrence_match':'contradicted',
            'candidate_for_occurrence':False,'repair_confirmed':False,
            'identity_basis':[],'temporal_relation':'unknown',
            'correlation_reason':'pcba_mismatch'
        }
    code=_text(occurrence.get('defect_code')).upper()
    other_code=_text(repair.get('defect_code')).upper()
    at=_instant(occurrence.get('defect_time'))
    other_at=_instant(repair.get('defect_time'))
    completed=_instant(repair.get('repair_time'))
    basis=['pcba_sn']
    if code and other_code and code==other_code:
        basis.append('defect_code')
    if at is not None and other_at is not None and at==other_at:
        basis.append('defect_instant')
    if at is None or completed is None:
        relation='unknown'
    elif completed<at:
        relation='prior_to_occurrence'
    elif completed==at:
        relation='same_instant'
    else:
        relation='after_occurrence'
    mismatch=(bool(code and other_code and code!=other_code) or
              bool(at is not None and other_at is not None and at!=other_at) or
              relation=='prior_to_occurrence')
    exact='defect_code' in basis and 'defect_instant' in basis
    if mismatch:
        status='distinct_occurrence_candidate'
        reason='conflicting_defect_identity_or_prior_repair'
    elif exact:
        status='exact_identity_candidate'
        reason='same_pcba_code_defect_instant_not_repair_proof'
    else:
        status='same_pcba_candidate'
        reason='incomplete_defect_identity'
    return {
        'association':status,'occurrence_match':'candidate' if not mismatch else 'contradicted',
        'candidate_for_occurrence':not mismatch,'repair_confirmed':False,
        'identity_basis':basis,'temporal_relation':relation,
        'correlation_reason':reason,
        'raw_ref':'sqlite:3012:'+_text(repair.get('row_key')),
        'source_view':'3012',
    }
