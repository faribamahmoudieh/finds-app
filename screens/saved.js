// Saved screen: liked and saved listings, newest first, sold ones greyed out, reserved ones noted.
import { savedList, statusNote } from '../lib.js';
import { html, money, safeUrl, sizeShort, thumb } from '../html.js';
import { header } from './finds.js';

function row(item) {
  if (item.status === 'sold') {
    return html`<div class="row sold">${thumb(item)}<div class="grow">${item.title || 'Listing'}<div class="m">Sold</div></div></div>`;
  }
  const bits = [statusNote(item.status), sizeShort(item.size_label), money(item.total_price ?? item.price), item.offer ? `offer ${money(item.offer)}` : ''].filter(Boolean);
  return html`<div class="row">${thumb(item)}<div class="grow">${item.title || 'Listing'}<div class="m">${bits.join(' · ')}</div></div>
    <a class="pill on" href="${safeUrl(item.url)}" target="_blank" rel="noopener noreferrer">Vinted</a></div>`;
}

export function render(app) {
  const { S } = app;
  const sw = app.swipes();
  const list = savedList(sw, (S.feed && S.feed.cards) || [], S.savedStatus);
  const acts = Object.values(sw).map((s) => s.action);
  const liked = acts.filter((a) => a === 'like').length;
  const kept = acts.filter((a) => a === 'save').length;
  return html`${header(app)}
    <div class="page">
      <h1 class="h">Saved</h1>
      <p class="sub">${liked} liked, ${kept} saved</p>
      ${list.length ? list.map(row) : html`<div class="empty">Nothing here yet. Like or save a find and it shows up here.</div>`}
    </div>`;
}

export const acts = {};
