"""One synthetic SQLite evidence set for timeline/names/3074/3022/SN consumers."""
import json
from pathlib import Path
import runpy
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
fixture = runpy.run_path(str(ROOT/'scripts/agent-3074-physical-classification.test.py'))
import canonical
import local_sn
import process_r11
import repair_3012
from ames import browser

extras = {}


def augment(store, sid):
    line = fixture['LINE']
    process_r11.patch_store(store)
    extras['old'] = canonical.export_revision(store, sid, line)
    repair_3012.ingest(store, {'rows': [{
        'row_key': 'SYNTHETIC-REPAIR', 'pcba_sn': 'P1', 'line': line,
        'defect_code': 'D', 'defect_time': '2026-11-03 09:00:00',
        'repair_time': '2026-11-03 10:00:00', 'repair_user': 'BRM-SYNTHETIC',
        'repair_comment': 'Comentário sintético preservado'}]})
    store.ingest_2114(sid, [{'pcba_sn': 'P1', 'result': {'rows': [
        {'Defect Hist Seq': 0, 'Defect Code': 'HIST', 'Defect Time': '2026-11-01 08:00:00',
         'Defect User Name': 'Autor sintético', 'Defect Type': 'MainBoard'},
        {'Defect Hist Seq': 1, 'Defect Code': 'UNDATED', 'Defect Type': 'Phone Disassembly'}]}}])
    seeds = {}
    for sn in ('P1', 'P2', 'P3', 'P4'):
        seeds[sn] = {'query_sn': sn, 'query_diagnostics': {'status': 'CONFIRMED'}, 'rows': [
            {'Hist Seq': 1, 'Tran Time': '2026-11-03T11:00:00Z', 'Tran Desc': 'END LOT',
             'Working Oper Code': 'A5162', 'Working Oper': 'Camera assembly',
             'Current Oper Code': 'A7600', 'Line Code': line, 'Tran User Id': 'PROD-SYNTHETIC'},
            {'Hist Seq': 2, 'Tran Time': '2026-11-03T11:50:00Z', 'Transaction Desc': 'END LOT',
             'Working Oper Code': 'A6900', 'Working Oper': 'Repair station',
             'Current Oper Code': 'A6900', 'Line Code': line,
             'Tran User ID': ' BRM-SYNTHETIC ', 'Tran User Name': 'Pessoa sintética'}]}
    with patch.object(browser.AmesBrowser, 'connect', side_effect=AssertionError('NO MES')) as connect:
        process_r11.collect_and_persist(store, ROOT/'ames/factory-engine', store.base_rows(sid, line),
                                      snapshot_id=sid, line=line, seed_3022_items=seeds)
        connect.assert_not_called()
    extras['sn'] = local_sn.lookup(store, 'P1')
    assert canonical.read_revision(store, sid, line, extras['old']['snapshot_revision']) == extras['old']


if __name__ == '__main__':
    current = fixture['export_synthetic_fixture'](augment)
    print(json.dumps({'current': current, **extras}))
