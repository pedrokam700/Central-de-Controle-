"""Defect evidence -> SQLite -> immutable canonical revision. Synthetic data only."""
import json
from pathlib import Path
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT/'ames'/'agent'), str(ROOT/'ames'/'factory-engine')]
from store import Store
import canonical
import production_shift
import process_r11
import repair_3012
import ames_3012_live
from ames.tela_3022 import analisar_ciclo_reparo_apos_falha


def verify():
    assert all(v is None for v in production_shift.classify(None, '2026-10-14T22:00:00Z').values())
    assert production_shift.classify_passage('2026-10-14T22:00:00Z')['production_shift_basis'] == 'process_passage'
    original = ames_3012_live.normalize_3012_row({'lotId':'P1','defectCode':'D'})
    reason = ames_3012_live.normalize_3012_row({'lotId':'P1','defectCode':'D','reasonDesc':'Diagnosis'})
    assert original['row_key'] == reason['row_key'], 'new optional field must not duplicate existing identities'
    assert reason['reason_desc'] == 'Diagnosis'
    rows = [
        {'Hist Seq':'1','Tran Time':'2026-10-14 10:05:00','Tran Desc':'REPAIR','TRAN CMF3':'MainBoard repair'},
        {'Hist Seq':'2','Tran Time':'2026-10-14 10:10:00','Tran Desc':'END LOT','Working Oper Code':'A5240','Working Oper':'Return route','Current Oper Code':'A5162'},
        {'Hist Seq':'3','Tran Time':'2026-10-14 10:20:00','Tran Desc':'CHANGE CMF','Tran Desc English':'Manually enter bad'},
    ]
    cycle = lambda data: analisar_ciclo_reparo_apos_falha(data, '2026-10-14 10:00:00', defect_local_offset_hours=0, event_naive_offset_hours=0)
    assert cycle(rows)['return_process']['operation_code'] == 'A5240'
    assert cycle(rows)['return_a5201'] is None
    assert cycle(rows[1:])['return_process'] is None, 'passage without repair is not a return'
    later = {**rows[1], 'Tran Time':'2026-10-14 10:25:00'}
    assert cycle([rows[0], rows[2], later])['return_process'] is None, 'next failure bounds this repair cycle'

    with tempfile.TemporaryDirectory() as directory:
        store = Store(Path(directory)/'ames.sqlite3'); store.initialize()
        # Evidence tables are initialized AFTER canonical, as on an existing workstation.
        process_r11.patch_store(store); repair_3012.ensure_schema(store)
        window = store.ensure_window('custom', '2026-10-14T07:00:00', '2026-10-15T07:00:00', None, ['TAN10101'])
        sid = store.create_snapshot(window_id=window, source_kind='test')
        rec = {'line':'TAN10101','pcba_sn':'P1','product_model':'CPH2819','defect_code':'D','defect_desc':'Test failure','defect_time':'2026-10-14T19:30:00-03:00'}
        store.ingest_defects(sid, [rec], reconcile_window=False)
        first = canonical.export_revision(store, sid, 'TAN10101')
        rec['defect_key'] = first['datasets']['defects'][0]['defect_key']
        corr = {'reference_process':{'operation_code':'A5162','event_time_utc':'2026-10-14T22:23:09Z'},
                'previous_process':{'operation_code':'A5100','event_time_utc':'2026-10-14T22:20:00Z'},
                'reference_stations':['A5100','A5162'], 'reference_selection':{'prior_count':1},
                'repair_cycle':{'return_process':{'operation_code':'A5240','operation_name':'Return route','event_time_utc':'2026-10-14T23:00:00Z'}}}
        ctx = process_r11._context_from_correlation(rec, corr)
        assert ctx['reference_station_code'] == 'A5162', 'actual passage, not first mapped station'
        assert ctx['production_shift_source'] == '3022' and ctx['production_shift_basis'] == 'reference_process'
        assert ctx['production_shift'] == '2nd Shift'
        for mutation in ({'reference_event_time':None}, {'reference_station_code':None}, {'source':'2114'}, {'reference_event_time':'2026-10-15T22:00:00Z'}):
            assert all(v is None for v in production_shift.from_context({**ctx, **mutation}).values())
        mapped = process_r11._context_from_correlation(rec, {**corr, 'reference_process':{}})
        assert mapped['production_shift'] is None and mapped['reference_event_time'] is None
        process_r11._persist_contexts(store, sid, [ctx])
        second = canonical.export_revision(store, sid, 'TAN10101')
        assert second['snapshot_revision'] == first['snapshot_revision'] + 1
        assert second['datasets']['defects'][0]['production_shift'] == '2nd Shift'
        assert second['process_contexts'][0]['return_station_code'] == 'A5240'
        assert second['process_contexts'][0]['return_operation_name'] == 'Return route'
        assert second['process_contexts'][0]['return_event_time'] == '2026-10-14T23:00:00Z'
        assert 'details_json' not in second['process_contexts'][0]
        # Existing persisted fallback must be reclassified, not trusted on source/basis alone.
        with store.connect() as con:
            con.execute("UPDATE process_defect_contexts SET reference_event_time=NULL,production_shift='1st Shift',production_shift_basis='reference_process' WHERE snapshot_id=?", (sid,))
        unknown = canonical.export_revision(store, sid, 'TAN10101')
        assert unknown['snapshot_revision'] == second['snapshot_revision'] + 1
        assert unknown['datasets']['defects'][0]['production_shift'] is None
        assert store.dataset_rows('process_defect_contexts', sid)[0]['production_shift'] is None
        process_r11._persist_contexts(store, sid, [ctx])
        before_repair = canonical.export_revision(store, sid, 'TAN10101')
        with store.connect() as con:
            con.execute("INSERT INTO repair_history_3012(row_key,pcba_sn,defect_code,repair_comment,repair_desc,repaired_location,reason_desc,first_seen_at,last_seen_at) VALUES('R1','P1','D','Technical comment','MainBoard repair','Station R','Reason','2026-10-15','2026-10-15')")
        repaired = canonical.export_revision(store, sid, 'TAN10101')
        assert repaired['snapshot_revision'] == before_repair['snapshot_revision'] + 1
        evidence = repaired['datasets']['defects'][0]['repair_evidence_3012'][0]
        assert evidence['repair_comment'] == 'Technical comment' and evidence['source_view'] == '3012'
        assert evidence['reason_desc'] == 'Reason' and evidence['repaired_location'] == 'Station R'
        assert evidence['association'] == 'same_pcba_candidate'
        assert canonical.page(store, sid, 'TAN10101', first['snapshot_revision'], 'defects')['rows'][0]['production_shift'] is None
        assert canonical.page(store, sid, 'TAN10101', before_repair['snapshot_revision'], 'defects')['rows'][0]['repair_evidence_3012'] == []
        with store.connect() as con:
            con.execute("UPDATE repair_history_3012 SET repair_comment='Updated comment' WHERE row_key='R1'")
        updated = canonical.export_revision(store, sid, 'TAN10101')
        assert updated['snapshot_revision'] == repaired['snapshot_revision'] + 1
        assert canonical.page(store, sid, 'TAN10101', repaired['snapshot_revision'], 'defects')['rows'][0]['repair_evidence_3012'][0]['repair_comment'] == 'Technical comment'
        assert updated['datasets']['defects'][0]['occurrence_id'] == first['datasets']['defects'][0]['occurrence_id']
        restarted = Store(store.path); restarted.initialize(); process_r11.patch_store(restarted); repair_3012.ensure_schema(restarted)
        assert canonical.export_revision(restarted, sid, 'TAN10101') == updated
        # A new collection in another period does not destroy the old revision.
        other = store.create_snapshot(window_id=None, source_kind='test')
        store.ingest_defects(other, [{**rec, 'defect_time':'2026-10-15T19:30:00-03:00'}], reconcile_window=False)
        assert canonical.page(store, sid, 'TAN10101', first['snapshot_revision'], 'defects')['rows']
        assert canonical.manifest(updated)['process_contexts'] == updated['process_contexts']
        return updated


if __name__ == '__main__':
    result = verify()
    print(json.dumps(result) if '--json' in sys.argv else 'PASS production evidence, generic return, SQLite revisions and manifest')
