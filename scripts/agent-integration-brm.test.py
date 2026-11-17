"""Counterproofs for BRM eligibility. Synthetic rows only, no MES or SQLite."""
from copy import deepcopy
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT/'ames/agent'), str(ROOT/'ames/factory-engine')]
from process_r11 import _production_rows

LINE = 'TAN10101'


def end_lot(**changes):
    return {'Tran Time': '2026-11-16T12:00:00Z', 'Tran Desc': 'END LOT',
            'Working Oper Code': 'A5162', 'Working Oper': 'Camera assembly',
            'Current Oper Code': 'A7600', 'Line Id': LINE, **changes}


class OperatorEligibility(unittest.TestCase):
    def test_legitimate_non_at_end_lot_remains_eligible(self):
        for operator in ('PROD-001', ' prod-001 ', ''):
            row = end_lot(**{'Tran User Id': operator})
            self.assertEqual(_production_rows([row], LINE), [row])

    def test_current_operation_is_destination_not_the_work_just_completed(self):
        row = end_lot(**{'Current Oper': 'Repair station', 'Current Oper Code': 'A6900', 'Tran User Id': 'PROD-001'})
        self.assertEqual(_production_rows([row], LINE), [row])

    def test_repair_aliases_and_contradictory_explicit_lines_remain_blocked(self):
        for fields in ({'Working Operation': 'Repair station'}, {'Operation Name': 'Disassembly'},
                       {'TRAN CMF3': 'rework'}, {'Line Id': LINE, 'Line Code': 'TAN10102'},
                       {'Transaction User Id': ' BRM-001 '}):
            row = end_lot(**fields)
            if 'Working Operation' in fields:
                del row['Working Oper']
            self.assertEqual(_production_rows([row], LINE), [], fields)

    def test_known_brm_at_end_lot_remains_blocked(self):
        self.assertEqual(_production_rows([end_lot(**{'Tran User Id': 'BRM-001'})], LINE), [])

    def test_brm_prefix_alone_is_still_conservative_without_physical_role_proof(self):
        # A synthetic assembly label is not evidence that a BRM employee was
        # physically performing production. Do not relax AT protection here.
        self.assertEqual(_production_rows([end_lot(**{'Tran User Id': 'BRM-POSSIBLE-PRODUCTION'})], LINE), [])

    def test_whitespace_and_supported_header_alias_cannot_bypass_at_protection(self):
        for fields in ({'Tran User Id': ' BRM-001 '}, {'Tran User ID': 'BRM-001'}, {'User Id': 'BRM-001'}):
            with self.subTest(fields=fields):
                self.assertEqual(_production_rows([end_lot(**fields)], LINE), [])

    def test_transaction_and_repair_label_aliases_cannot_bypass_protection(self):
        row = end_lot(**{'Transaction Desc': 'END LOT', 'User Id': 'BRM-001'})
        del row['Tran Desc']
        self.assertEqual(_production_rows([row], LINE), [])

    def test_line_code_alias_cannot_borrow_another_line(self):
        row = end_lot(**{'Line Code': 'TAN10102'})
        del row['Line Id']
        self.assertEqual(_production_rows([row], LINE), [])

    def test_filter_preserves_input_and_keeps_full_raw_history_available(self):
        rows = [end_lot(), end_lot(**{'Tran User Id': 'BRM-001'})]
        original = deepcopy(rows)
        self.assertEqual(len(_production_rows(rows, LINE)), 1)
        self.assertEqual(rows, original)


if __name__ == '__main__':
    unittest.main()
