"""Explicit 3022 field mapping. Never infer a person from an ID or event text."""
import re

ID_FIELDS = ('Tran User Id', 'Transaction User Id', 'Operator ID', 'Employee ID', 'User Id')
NAME_FIELDS = ('Tran User Name', 'Transaction User Name', 'Operator Name', 'Employee Name', 'User Name', 'Tran User Desc', 'User Full Name', 'tran_user_name')

def _field(raw, aliases):
    normalize = lambda s: re.sub(r'[^a-z0-9]', '', str(s).lower())
    for alias in aliases:
        matches = [(key, value) for key, value in raw.items() if normalize(key) == normalize(alias) and value is not None and str(value).strip()]
        if len(matches) == 1:
            key, value = matches[0]
            return str(value).strip(), key
    return None, None

def operator_evidence(raw):
    raw = raw if isinstance(raw, dict) else {}
    ident, ik = _field(raw, ID_FIELDS)
    name, nk = _field(raw, NAME_FIELDS)
    station, _ = _field(raw, ('Working Oper Code', 'Station', 'Station Code', 'Current Oper Code'))
    operation, _ = _field(raw, ('Working Oper', 'Operation Name', 'Current Oper'))
    event_time, _ = _field(raw, ('Tran Time', 'Transaction Time', 'Event Time'))
    return {'operator_id': ident, 'operator_name': name, 'station': station,
            'operation_name': operation, 'event_time': event_time, 'source': '3022',
            'operator_fields': {k: v for k, v in {'operator_id': ik, 'operator_name': nk}.items() if v}}
