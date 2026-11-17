"""Deterministic work budget, synthetic rows only; no MES/database needed."""
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'ames/agent'))
import production_shift as shift

class ContextWork(unittest.TestCase):
    def test_exact_projection_indexes_occurrences_instead_of_N_by_N_scan(self):
        rows = [{'pcba_sn': f'P{i}', 'line': 'TAN10101', 'defect_code': 'D',
                 'defect_time': '2026-11-03T12:00:00Z', 'defect_key': f'K{i}'} for i in range(200)]
        contexts = [{**r, 'source': '3022', 'reference_station_code': 'A5162',
                     'reference_event_time': '2026-11-03T11:00:00Z'} for r in rows]
        with patch.object(shift, 'same_occurrence', wraps=shift.same_occurrence) as compare:
            out = shift.project_contexts(contexts, rows)
            self.assertEqual(len(out), len(rows))
            self.assertTrue(all(r['production_shift_source'] == '3022' for r in out))
            self.assertLessEqual(compare.call_count, 8*len(rows), 'RED: exact context matching is quadratic')

if __name__ == '__main__':
    unittest.main()
