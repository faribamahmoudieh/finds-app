// Tiny templating helpers: every interpolated value is escaped unless wrapped in raw().
class Raw {
  constructor(v) { this.v = v; }
  toString() { return this.v; }
}
export const raw = (v) => new Raw(String(v));

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function str(v) {
  if (v == null || v === false) return '';
  if (v instanceof Raw) return v.v;
  if (Array.isArray(v)) return v.map(str).join('');
  return esc(v);
}

export function html(strings, ...vals) {
  let out = '';
  strings.forEach((s, i) => { out += s + (i < vals.length ? str(vals[i]) : ''); });
  return new Raw(out);
}

// Only http(s) links leave the app; anything else becomes a dead link.
export function safeUrl(u) {
  return /^https?:\/\//i.test(String(u || '')) ? String(u) : '#';
}

// "£49" for whole pounds, "£38.90" otherwise.
export function money(gbp) {
  if (gbp == null || Number.isNaN(Number(gbp))) return '';
  const n = Math.round(Number(gbp) * 100) / 100;
  return Number.isInteger(n) ? '£' + n : '£' + n.toFixed(2);
}

export const sizeTag = (label) => String(label || '').split(' / ').join(' · ');
export const sizeShort = (label) => String(label || '').split(' / ')[0];

export function img(card) {
  return card && card.image ? html`<img src="${safeUrl(card.image)}" alt="" loading="lazy" draggable="false" referrerpolicy="no-referrer">` : '';
}

export const thumb = (card) => html`<div class="ph">${img(card)}</div>`;
