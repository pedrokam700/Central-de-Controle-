"""Bounded synthetic measurement, not a factory latency acceptance test."""
import json
from pathlib import Path
import sys
from time import perf_counter

sys.path.insert(0, str(Path(__file__).resolve().parents[2]/'ames/agent'))
import production_shift

result = []
for size in (500, 1000, 2000):
    rows = [{'pcba_sn': f'SYNTH-{i}', 'line': 'TAN10101', 'defect_code': 'D',
             'defect_time': '2026-11-03T12:00:00Z', 'defect_key': f'K{i}'} for i in range(size)]
    contexts = [{**r, 'source': '3022', 'reference_station_code': 'A5162',
                 'reference_event_time': '2026-11-03T11:00:00Z'} for r in rows]
    start = perf_counter()
    projected = production_shift.project_contexts(contexts, rows)
    elapsed = perf_counter()-start
    assert len(projected) == size
    assert all(r['production_shift_source'] == '3022' for r in projected)
    result.append({'occurrences': size, 'contexts': size, 'seconds': round(elapsed, 4)})
print(json.dumps({'schema': 'ames-synthetic-scale-v1', 'phase': 'project_contexts',
                  'factory_acceptance': 'PENDING', 'samples': result}))
