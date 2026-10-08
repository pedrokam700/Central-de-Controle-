import { LINE_IDS, LEGACY_SCHEMA } from '../ames/data/contract.mjs';

// Synthetic fixtures: these counts are not factory evidence.
export function fixture(line = LINE_IDS[0], count = 60) {
  const at = '2026-10-08T14:00:00-03:00';
  const payload = { schema: LEGACY_SCHEMA, line, generated_at: at,
    summary: { line, snapshot_id: `TEST-${line}`, collected_at: at, fpy: 98, check_fpy: 0, quantity: 1000, defect_rows: 200 },
    defects: Array.from({ length: count }, (_, i) => ({ line, pcba_sn: `SYNTHETIC-PCBA-${i}`, product_model: i % 2 ? 'CPH3028V' : 'CPH3028',
      defect_code: i % 3 ? 'D1' : 'D2', defect_desc: 'Synthetic defect', defect_time: at })) };
  return { kind: 'ames_shared_snapshot', line, schema: LEGACY_SCHEMA, payload };
}

export function productFixture(line = LINE_IDS[0], count = 60) {
  const doc = fixture(line, count);
  doc.payload.defects.forEach((row, index) => { row.product_model = index % 2 ? 'CPH2859' : 'CPH2859V'; });
  return doc;
}
