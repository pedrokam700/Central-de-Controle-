"""Local-only regression: transient classifier failures cannot poison a revision forever."""
from contextlib import contextmanager
import json
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'ames' / 'agent'))
import canonical


class RecomputeReached(Exception):
    pass


class FakeConnection:
    def __init__(self, cached):
        self.cached = cached
        self.read_statements = []

    def execute(self, statement, params=()):
        self.read_statements.append(statement)
        if statement == 'BEGIN IMMEDIATE':
            return None
        if statement.startswith('SELECT * FROM snapshots'):
            return FakeResult({'id': 1})
        if statement.startswith('SELECT epoch FROM mes_source_clock'):
            return FakeResult((4,))
        if statement.startswith('SELECT * FROM mes_revisions'):
            return FakeResult({'epoch': 4, 'payload': json.dumps(self.cached)})
        if statement.startswith('SELECT value FROM schema_meta'):
            raise RecomputeReached('export must recompute failed insights')
        raise AssertionError(statement)


class FakeResult:
    def __init__(self, result):
        self.result = result

    def fetchone(self):
        return self.result


class FakeStore:
    def __init__(self, cached):
        self.conn = FakeConnection(cached)

    @contextmanager
    def connect(self):
        yield self.conn


class FailedInsightRetryTests(unittest.TestCase):
    def test_classifier_failure_code_does_not_include_sensitive_exception_text(self):
        def fail_projection():
            raise KeyError('A-MES-SENSITIVE-PCBA-SECRET')
        try:
            fail_projection()
        except KeyError as exc:
            code=canonical.insight_failure_code(exc)
        self.assertIn('KEYERROR_FAIL_PROJECTION_L',code)
        self.assertNotIn('SENSITIVE',code)

    def cached(self, ready):
        return {'projection_version': canonical.PROJECTION_VERSION,
                'insights': {'schema': 'ames-insights-v1', 'ready': ready}}

    def test_successful_unchanged_revision_is_reused(self):
        original = self.cached(True)
        store = FakeStore(original)
        self.assertEqual(canonical.export_revision(store, 1, 'TAN10103', lambda **kw: {}), original)
        self.assertFalse(any('schema_meta' in s for s in store.conn.read_statements))

    def test_failed_insight_is_retried_even_when_mes_epoch_is_unchanged(self):
        store = FakeStore(self.cached(False))
        with self.assertRaises(RecomputeReached):
            canonical.export_revision(store, 1, 'TAN10103', lambda **kw: {})

    def test_missing_insight_is_retried_instead_of_frozen(self):
        original = self.cached(True)
        original.pop('insights')
        store = FakeStore(original)
        with self.assertRaises(RecomputeReached):
            canonical.export_revision(store, 1, 'TAN10103', lambda **kw: {})

    def test_failed_insight_is_immutable_when_no_builder_is_available(self):
        original = self.cached(False)
        self.assertEqual(canonical.export_revision(FakeStore(original), 1, 'TAN10103'), original)


if __name__ == '__main__':
    unittest.main()
