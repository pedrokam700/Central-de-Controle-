"""Reproducible local history timings; synthetic temporary SQLite, never MES."""
import json
import math
import platform
import statistics
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'ames' / 'agent'))
from store import Store
import canonical
import source_capture


def measure(call, samples=30):
    values = []
    for _ in range(samples):
        start = time.perf_counter()
        call()
        values.append((time.perf_counter() - start) * 1000)
    ordered = sorted(values)
    return {'samples': samples, 'p50_ms': round(statistics.median(values), 3),
            'p95_ms': round(ordered[math.ceil(len(ordered) * .95) - 1], 3)}


def main():
    line = 'TAN10101'
    with tempfile.TemporaryDirectory(prefix='ames-issue66-synthetic-') as tmp:
        store = Store(Path(tmp) / 'synthetic.sqlite')
        store.initialize()
        window = store.ensure_window('previous_day', '2026-10-22T07:00-03:00',
                                     '2026-10-23T07:00-03:00', None, [line])
        sid = store.create_snapshot(window_id=window, source_kind='synthetic_benchmark')
        store.ingest_defects(sid, [{'line': line, 'pcba_sn': f'SYNTHETIC-{i}',
            'product_model': 'SYNTHETIC', 'defect_code': 'SYNTHETIC',
            'defect_time': '2026-10-22T10:00-03:00'} for i in range(200)])
        frozen = canonical.export_revision(store, sid, line)
        target = {k: frozen[k] for k in ('source_id', 'snapshot_id', 'snapshot_revision', 'content_hash')}
        target['period'] = frozen['summary']['period']
        payload = {'status': 'partial', 'items': [
            {'item_sn': f'SYNTHETIC-MATERIAL-{i}', 'previous_pcbas': [f'SYNTHETIC-BOARD-{i}']}
            for i in range(200)]}
        for index in range(100):
            source_capture.capture_source(store, target=target, line=line, job_id=f'SYNTHETIC_{index}',
                                          view='3074', result=payload, status='partial')
        capture = lambda: source_capture.capture_source(store, target=target, line=line,
            job_id='SYNTHETIC_0', view='3074', result=payload, status='partial')
        measurements = {
            'replay_identical_capture': measure(capture),
            'read_immutable_revision': measure(lambda: canonical.read_revision(store, sid, line, 1)),
            'list_capture_history': measure(lambda: source_capture.capture_index(store, sid, line)),
        }
        versions = store.snapshot_payload_history(sid, 'source_capture_3074_SYNTHETIC_0')
        entries = source_capture.capture_index(store, sid, line)
        if len(versions) != 1 or len(entries) != 100:
            raise AssertionError('Identical replay duplicated evidence revisions')
        if canonical.read_revision(store, sid, line, 1) != frozen:
            raise AssertionError('Original immutable canonical revision changed')
        sha = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
        clean = not subprocess.check_output(['git', 'status', '--porcelain'], cwd=ROOT, text=True).strip()
        print(json.dumps({'schema': 'ames-issue66-history-benchmark-v1', 'sha': sha,
            'worktree_clean': clean, 'isolation': 'temporary_synthetic_sqlite_no_mes',
            'environment': {'system': platform.system(), 'python': platform.python_version()},
            'dataset': {'occurrences': 200, 'capture_jobs': 100, 'items_per_capture': 200},
            'measurements': measurements, 'identical_capture_revisions': len(versions),
            'preserved_history_entries': len(entries), 'original_revision_preserved': True,
            'source_complete': False, 'factory_physical': 'PENDING'}))


if __name__ == '__main__':
    main()
