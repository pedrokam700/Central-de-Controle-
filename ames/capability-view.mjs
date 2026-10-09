import { escapeHtml as esc } from './evidence-view.mjs';

export function dimensionList(dimensions, { showCounts = false } = {}) {
  return `<dl>${dimensions.map(d => `<dt>${esc(d.source)} · ${esc(d.label)}</dt><dd>${d.status === 'partial' ? 'Lista parcial disponível' : d.status === 'not_collected' ? 'Não coletado neste snapshot' : 'Registros detalhados indisponíveis'}.${showCounts ? ` Contagem informada pela fonte: ${esc(d.reported_count ?? 'não informada')} (não comprova histórico completo ou reuso).` : ''}<br>Para ampliar esta dimensão: ${esc(d.missing)}.</dd>`).join('')}</dl>`;
}
