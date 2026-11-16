"""3074 proof matrix. Synthetic records; disposable SQLite; no agent/MES startup."""
from copy import deepcopy
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / 'ames/agent'), str(ROOT / 'ames/factory-engine')]
from store import Store
import canonical
from integrated_snapshot_history import recover_snapshot_line
from core.uso_pcba import reconstruir_usos_pcba
from core.temporal_3074 import pcbas_do_item_ate_a_falha, historico_completo_pcbas_do_item
from reports.relatorio_3028_3074 import extrair_linhas
from engine_bridge import build_trace_insights
from core.varredura_3074 import executar_varredura

LINE = 'TAN10103'
DEFECT = {'pcba_sn': 'P', 'line': LINE, 'defect_code': 'D',
          'defect_time': '2026-11-03 09:00:00'}  # 12:00 UTC


def mounting(n, status='N', **extra):
    return {'Barcode': 'P', 'Aut Cmf1': 'PCBA', 'Sn Type': 'PCBA',
            'Aut Cmf7': f'C{n}', 'Bind Time': f'2026-11-0{n} 10:00:00Z',
            'Unbind Time': None if status == 'Y' else f'2026-11-0{n} 14:00:00Z',
            'Iss Status': status, **extra}


def capture(rows, defect=None, results=None):
    d = deepcopy(defect or DEFECT)
    return {'pcba_sn': 'P', 'status': 'COMPLETE', 'current_defects': [d],
            'base_query': {'query_sn': 'P', 'query_confirmation': 'EXACT_QUERY_ROW', 'rows': rows},
            'defect_traces': [{'status': 'COMPLETE', 'defect': d,
                               'trace_3074': {'results': results or []}}]}


def payload(*items):
    return {'trace_3074': {'items': list(items)}, 'trace_2114': {'pcbas': []}}


def export_synthetic_fixture():
    """Raw 3074 -> scanner -> SQLite -> insights -> canonical, no live source."""
    with tempfile.TemporaryDirectory() as directory:
        store = Store(Path(directory) / 'fixture.sqlite')
        store.initialize()
        sid = store.create_snapshot(window_id=None, source_kind='synthetic')
        items = []
        for count in (1, 2, 3, 4):
            pcba, material = f'P{count}', f'M{count}'
            defect = {**DEFECT, 'pcba_sn': pcba, 'product_model': 'CPH-SYNTHETIC'}
            self_rows = [{**mounting(n, 'Y' if n == 3 else 'N'), 'Barcode': pcba}
                         for n in ([3] if count == 1 else [1, 3] if count == 2 else [1, 2, 3])]
            base = {'query_sn': pcba, 'query_confirmation': 'EXACT_QUERY_ROW', 'rows': self_rows + [
                {'Barcode': material, 'Sn Type': 'Camera', 'Bind Time': '2026-11-03 10:00:00Z', 'Iss Status': 'Y'}]}
            reverse = [{**mounting(n, 'Y' if n == count else 'N'),
                        'Barcode': pcba if n == count else f'OLD{count}-{n}'}
                       for n in range(1, min(count, 3) + 1)]
            if count == 4:
                # History exists, but reverse query has no current-PCBA binding.
                reverse = reverse[:2]
            class Synthetic3074:
                def consultar(self, sn):
                    assert sn == material
                    return {'query_sn': sn, 'query_confirmation': 'EXACT_QUERY_ROW',
                            'store_total_count': len(reverse), 'rows': deepcopy(reverse)}
            trace = executar_varredura(Synthetic3074(), pcba, defect['defect_time'], base_query=base, pause_s=0)
            item = capture(self_rows, defect)
            item.update(pcba_sn=pcba, base_query=base)
            item['defect_traces'][0]['trace_3074'] = trace
            items.append(item)
            store.ingest_defects(sid, [defect])
        data = payload(*items)
        store.save_snapshot_payload(sid, 'integrated_v016', data)
        store.ingest_material_reuse(sid, data['trace_3074'])
        stored = store.get_snapshot_payload(sid, ['integrated_v016'])
        def insights(**kw):
            return {**build_trace_insights(ROOT / 'ames/factory-engine', stored, line=LINE),
                    'ready': True, 'snapshot_id': sid}
        return canonical.export_revision(store, sid, LINE, insights)


class Physical3074(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.store = Store(Path(self.tmp.name) / 'synthetic.sqlite')
        self.store.initialize()
        self.sid = self.store.create_snapshot(window_id=None, source_kind='synthetic')
        self.store.ingest_defects(self.sid, [DEFECT])

    def test_first_second_third_use_Y_and_historical_N_deduplicate_operations(self):
        for count in (1, 2, 3):
            for status in ('Y', 'N'):
                with self.subTest(count=count, status=status):
                    rows = [mounting(n) for n in range(1, count + 1)]
                    rows[-1] = mounting(count, status)
                    rows += [{**r, 'Operation': 'A5150'} for r in rows]
                    result = reconstruir_usos_pcba(rows, 'P', f'2026-11-0{count} 09:00:00')
                    self.assertEqual(result['known_use_count'], count)
                    self.assertEqual(result['use_index_at_defect'], count)

    def test_no_self_link_missing_clock_future_and_invalid_dates_stay_unknown(self):
        for rows, clock in (([], DEFECT['defect_time']),
                            ([mounting(1, **{'Bind Time': None, 'Unbind Time': None})], DEFECT['defect_time']),
                            ([mounting(1, **{'Bind Time': 'invalid', 'Unbind Time': None})], DEFECT['defect_time']),
                            ([mounting(3)], '2026-11-01 09:00:00'), ([mounting(1)], None)):
            with self.subTest(rows=rows, clock=clock):
                self.assertIsNone(reconstruir_usos_pcba(rows, 'P', clock)['use_index_at_defect'])

    def test_ended_mounting_proves_history_but_not_use_in_gap_at_defect(self):
        r = reconstruir_usos_pcba([mounting(1)], 'P', DEFECT['defect_time'])
        self.assertEqual(r['known_use_count'], 1)
        self.assertIsNone(r['use_index_at_defect'])
        self.assertIsNone(r['reuses_before_defect'])

    def test_overlapping_different_mountings_cannot_choose_latest_ordinal(self):
        r = reconstruir_usos_pcba([mounting(1, 'Y'), mounting(2, 'Y')], 'P', DEFECT['defect_time'])
        self.assertEqual(r['known_use_count'], 2)
        self.assertIsNone(r['use_index_at_defect'])

    def test_sqlite_retains_valid_binding_but_larger_undated_revision_must_not_hide_it(self):
        old = payload(capture([mounting(3, 'Y')]))
        undated = [mounting(3, 'Y', **{'Bind Time': None, 'Operation': op}) for op in ('A', 'B', 'C')]
        new = payload(capture(undated))
        for value in (old, new):
            self.store.save_snapshot_payload(self.sid, 'integrated_v016', value)
        before = self.store.snapshot_payload_history(self.sid, 'integrated_v016')
        versions = [self.store.get_snapshot_payload_revision(self.sid, 'integrated_v016', r['revision']) for r in before]
        recovered, _ = recover_snapshot_line(versions, LINE, self.store.base_rows(self.sid, LINE))
        insights = build_trace_insights(ROOT / 'ames/factory-engine', recovered, line=LINE)
        self.assertEqual(insights['drilldowns']['pcba_analysis'][0]['_pcba_use_index'], 1)
        self.assertEqual(self.store.get_snapshot_payload_revision(self.sid, 'integrated_v016', 1), old)
        self.assertEqual(self.store.get_snapshot_payload(self.sid, ['integrated_v016']), new)
        self.assertEqual(self.store.snapshot_payload_history(self.sid, 'integrated_v016'), before)
        other = self.store.create_snapshot(window_id=None, source_kind='synthetic')
        self.assertEqual(self.store.snapshot_payload_history(other, 'integrated_v016'), [])

    def test_single_payload_same_sn_other_line_cannot_replace_current_base(self):
        other = {**DEFECT, 'line': 'TAN10101'}
        data = payload(capture([mounting(3, 'Y')]), capture([], other))
        insights = build_trace_insights(ROOT / 'ames/factory-engine', data, line=LINE)
        self.assertEqual(insights['drilldowns']['pcba_analysis'][0]['_pcba_use_index'], 1)

    def test_unknown_component_count_never_becomes_first_use_in_report(self):
        for confirmed in (True, False, None):
            r = {'item_sn': 'M', 'previous_pcba_count': None, 'current_pcba_confirmed': confirmed}
            _, materials, _ = extrair_linhas(payload(capture([], results=[r]))['trace_3074'])
            self.assertIsNone(materials[0]['Usos ate a falha'])
            self.assertIsNone(materials[0]['Reusos anteriores a falha'])

    def test_legacy_missing_current_confirmation_cannot_add_an_unproven_current_use(self):
        r = {'item_sn': 'M', 'previous_pcba_count': 0, 'previous_pcbas': []}
        _, materials, _ = extrair_linhas(payload(capture([], results=[r]))['trace_3074'])
        self.assertIsNone(materials[0]['Usos ate a falha'])
        self.assertIsNone(materials[0]['Usos totais conhecidos'])

    def test_known_component_history_without_temporal_proof_stays_unknown_in_insights(self):
        r = {'item_sn': 'M', 'item_type': 'Camera', 'previous_pcba_count': None,
             'current_pcba_confirmed': False, 'total_pcba_count_known_now': 2,
             'reuse_count_known_now': 1, 'previous_pcbas': ['OLD']}
        insights = build_trace_insights(ROOT / 'ames/factory-engine', payload(capture([], results=[r])), line=LINE)
        row = insights['drilldowns']['material_analysis'][0]
        self.assertEqual(row['Usos conhecidos material'], 2)
        self.assertEqual(row['Uso material na falha'], 'NÃO DETERMINADO')

    def test_component_first_second_third_transfer_preserves_inactive_bindings(self):
        for count in (1, 2, 3):
            rows = [{**mounting(n, 'Y' if n == count else 'N'), 'Barcode': 'P' if n == count else f'OLD{n}'}
                    for n in range(1, count + 1)]
            r = pcbas_do_item_ate_a_falha(rows, DEFECT['defect_time'], 'P')
            self.assertTrue(r['current_pcba_confirmed'])
            self.assertEqual(r['previous_pcba_count'], count - 1)
            hist = historico_completo_pcbas_do_item(rows)
            self.assertEqual(hist['distinct_pcba_count'], count)

    def test_explicit_PCBA_aut_tag_is_valid_when_sn_type_is_empty(self):
        rows = [mounting(1, **{'Barcode': 'OLD', 'Sn Type': ''}), mounting(3, 'Y', **{'Sn Type': ''})]
        r = pcbas_do_item_ate_a_falha(rows, DEFECT['defect_time'], 'P')
        self.assertTrue(r['current_pcba_confirmed'])
        self.assertEqual(r['previous_pcba_count'], 1)
        self.assertEqual(historico_completo_pcbas_do_item(rows)['distinct_pcba_count'], 2)

    def test_partial_zero_legacy_row_cannot_certify_first_use_in_canonical(self):
        r = {'item_sn': 'M', 'item_type': 'Camera', 'current_pcba_confirmed': True,
             'previous_pcba_count': 0, 'previous_pcbas': [], 'coverage': {'status': 'incomplete_page'}}
        self.store.ingest_material_reuse(self.sid, payload(capture([], results=[r]))['trace_3074'])
        # Simulate an already persisted legacy row too: a projector must defend
        # its boundary even after ingest has been corrected.
        with self.store.connect() as con:
            key = con.execute('SELECT defect_key FROM defect_observations WHERE snapshot_id=?', (self.sid,)).fetchone()[0]
            con.execute('INSERT OR REPLACE INTO material_reuse(snapshot_id,current_pcba_sn,current_defect_key,item_sn,previous_pcba_count,raw_json) VALUES(?,?,?,?,?,?)',
                        (self.sid, 'P', key, 'M', 0, json.dumps(r)))
        out = canonical.export_revision(self.store, self.sid, LINE)
        self.assertIsNone(out['datasets']['material_reuse'][0].get('material_use_index'))

    def test_classifier_upgrade_reprojects_without_new_mes_epoch_and_preserves_old_revision(self):
        current = canonical.PROJECTION_VERSION
        try:
            canonical.PROJECTION_VERSION = 11
            old = canonical.export_revision(self.store, self.sid, LINE, lambda **kw: {'ready': True, 'sentinel': 'OLD'})
        finally:
            canonical.PROJECTION_VERSION = current
        calls = []
        new = canonical.export_revision(self.store, self.sid, LINE, lambda **kw: calls.append(kw) or {'ready': True, 'sentinel': 'CORRECTED'})
        self.assertEqual(len(calls), 1)
        self.assertEqual(new['snapshot_revision'], old['snapshot_revision'] + 1)
        self.assertEqual(canonical.read_revision(self.store, self.sid, LINE, old['snapshot_revision']), old)


if __name__ == '__main__':
    if sys.argv[1:] == ['--fixture']:
        print(json.dumps(export_synthetic_fixture()))
    else:
        unittest.main()
