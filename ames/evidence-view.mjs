export const EVIDENCE_PAGE_SIZE = 25;
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Shared record presentation. It neither fetches nor owns operational state.
export function occurrenceList(rows, start = 1) {
  const esc = escapeHtml;
  return `<ol class="mes-record-list" start="${start}">${rows.map(row => `<li><strong>${esc(row.pcba_sn)}</strong><dl><dt>CPH</dt><dd>${esc(row.product_model || 'Não informado')}</dd><dt>Defeito</dt><dd>${esc(row.defect_code || 'Não informado')} · ${esc(row.defect_desc)}</dd><dt>Defect Time</dt><dd>${esc(row.defect_time || 'Não informado')}${row.defect_time_ms === null ? ' · instante não verificável' : ''}</dd><dt>Reparo na fonte</dt><dd>${esc(row.repair_status || 'Não informado')}</dd><dt>Origem / referência</dt><dd>3028 · ${esc(row.evidence_ref)}</dd></dl></li>`).join('')}</ol>`;
}
