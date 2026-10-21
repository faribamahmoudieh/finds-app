// Match screen: paste a shop link, find the same piece (or close) on Vinted in your size.
import { html, money, safeUrl, thumb } from '../html.js';
import { header, tile } from './finds.js';

const STATUS = {
  not_shopify: 'This shop’s pages could not be read. Links from Shopify shops work best.',
  blocked: 'Vinted blocked the search. You can run it yourself on Vinted:',
  layout_changed: 'Vinted changed its pages, so some matches may be missing.',
  partial: 'The search stopped early, so some matches may be missing.',
};

function result(app, r) {
  const sw = app.swipes();
  const cards = r.cards || [];
  const msg = STATUS[r.status];
  const fb = r.fallback_link;
  const sp = r.spotted;
  return html`
    ${msg ? html`<div class="note">${msg}${fb ? html` <a class="pill sm" href="${safeUrl(fb.url)}" target="_blank" rel="noopener noreferrer">${fb.label}</a>` : ''}</div>` : ''}
    ${sp ? html`<div class="spot">${thumb(sp)}<div><span class="lab">You spotted</span><br>${sp.title}<br><span style="color:var(--mute)">${[sp.shop, money(sp.price_gbp)].filter(Boolean).join(' · ')}</span></div></div>` : ''}
    ${sp ? html`<span class="lab pad">On Vinted in your size</span>` : ''}
    ${cards.length
      ? html`<div class="grid">${cards.map((c) => tile(c, sw[String(c.id)], { labels: true }))}</div>`
      : sp ? html`<div class="note">Nothing on Vinted in your size right now.</div>` : ''}`;
}

export function render(app) {
  const M = app.S.match;
  const working = M.state === 'working';
  return html`${header(app)}
    <div class="page">
      <h1 class="h">Spot and match</h1>
      <p class="sub">Paste a piece from a shop you like</p>
      <form class="mform" data-form="match">
        <input class="field" name="url" type="url" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false"
          placeholder="playground-paris.com/products/…" value="${M.url}" data-keep="match-url" aria-label="Shop link">
        <button class="pill on" type="submit" ${working ? 'disabled' : ''}>Match</button>
      </form>
      ${working ? html`<div class="note"><span class="spin"></span>${M.note || 'Checking the link'}</div>` : ''}
      ${M.state === 'error' ? html`<div class="err">${M.error}</div>` : ''}
      ${M.state === 'done' && M.note ? html`<div class="note">${M.note}</div>` : ''}
      ${M.state === 'done' && M.result ? result(app, M.result) : ''}
    </div>`;
}

export const acts = {};
export const forms = {
  match: (form, app) => app.runMatch(form.elements.url.value),
};
