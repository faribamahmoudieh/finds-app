// Finds screen: morning banner, header, Swipe/Grid toggle, swipe card with drag, grid tiles.
import { nextCards, statusMessage, savingLabel, ageLabel, savedPounds } from '../lib.js';
import { html, money, safeUrl, sizeTag, sizeShort, img } from '../html.js';

export function header(app, { left = '', right = '' } = {}) {
  return html`<header class="hdr"><span class="l">${left}</span><span class="logo">Finds.</span><span class="r">${right}</span></header>`;
}

function savingTag(card) {
  if (card.match === 'similar') return html`<span class="tag sim">Similar</span>`;
  const s = savingLabel(card);
  return s ? html`<span class="tag g">${s}</span>` : '';
}

function metaLine(card) {
  const bits = [];
  if (card.brand && !String(card.title || '').toLowerCase().includes(String(card.brand).toLowerCase())) bits.push(card.brand);
  if (card.condition) bits.push(card.condition);
  const when = ageLabel(card);
  if (when) bits.push(when);
  return bits.join(' · ');
}

function comparison(card) {
  if (card.match === 'similar') return html`<span class="pill sm">Similar</span>`;
  const c = card.comparable;
  if (!c || c.price_gbp == null) return '';
  const save = savedPounds(card);
  return html`<span class="was">${c.shop || 'Shop'} <s>${money(Math.round(c.price_gbp))}</s>${save ? html` · <span class="sv">${save}</span>` : ''}</span>`;
}

// labels: Match cards show why they matched and a "Same item?" tag when the photos agree (feed cards do not).
export function tile(card, swiped, { labels = false } = {}) {
  const a = swiped && swiped.action;
  return html`<div class="gi" data-id="${card.id}">
    <a class="ph" href="${safeUrl(card.url)}" target="_blank" rel="noopener noreferrer" aria-label="Open on Vinted">${img(card)}${savingTag(card)}${labels && card.same_item === true ? html`<span class="tag same">Same item?</span>` : ''}</a>
    <div class="n">${card.title}</div>
    ${labels && card.reason ? html`<div class="rs" title="${card.reason}">${card.reason}</div>` : ''}
    <div class="p">${money(card.total_price ?? card.price)} <span>${sizeShort(card.size_label)}</span></div>
    <div class="ga">
      <button type="button" class="pill sm ${a === 'pass' ? 'on' : ''}" data-act="swipe" data-a="pass" data-id="${card.id}" aria-label="Pass">✕</button>
      <button type="button" class="pill sm ${a === 'like' || a === 'save' ? 'on' : ''}" data-act="swipe" data-a="like" data-id="${card.id}" aria-label="Like">♥</button>
    </div>
  </div>`;
}

function swipeCard(card) {
  return html`<div class="deck"><article class="card" data-id="${card.id}">
      <a class="ph" href="${safeUrl(card.url)}" target="_blank" rel="noopener noreferrer" aria-label="Open on Vinted">
        ${img(card)}
        ${card.size_label ? html`<span class="tag">${sizeTag(card.size_label)}</span>` : ''}${savingTag(card)}
        <span class="hint like">Like</span><span class="hint pass">Pass</span>
      </a>
      <div class="meta">
        <div class="t">${card.title}</div>
        <div class="m">${metaLine(card)}</div>
        <div class="line"><span class="price">${money(card.total_price ?? card.price)}</span>${comparison(card)}</div>
        ${card.offer ? html`<div class="off"><span>Suggested offer</span><span>${money(card.offer)}</span></div>` : ''}
      </div>
    </article></div>
    <div class="acts">
      <button type="button" class="pill" data-act="swipe" data-a="pass" data-id="${card.id}">Pass</button>
      <button type="button" class="pill" data-act="swipe" data-a="save" data-id="${card.id}">Save</button>
      <button type="button" class="pill on" data-act="swipe" data-a="like" data-id="${card.id}">Like</button>
    </div>`;
}

export function render(app) {
  const { S } = app;
  const sw = app.swipes();
  const cards = nextCards(S.feed, sw);
  const total = ((S.feed && S.feed.cards) || []).length;
  const msg = S.loaded ? statusMessage(S.feed, sw) : null;
  const links = (S.feed && S.feed.fallback_links) || [];
  const left = S.refreshing
    ? html`<span class="spin" aria-hidden="true"></span><span>Refreshing</span>`
    : html`<button type="button" data-act="refresh">Refresh</button>`;
  const top = html`
    ${msg ? html`<div class="bar" role="status">${msg}</div>` : ''}
    ${links.length ? html`<div class="links">${links.map((l) => html`<a class="pill sm" href="${safeUrl(l.url)}" target="_blank" rel="noopener noreferrer">${l.label}</a>`)}</div>` : ''}
    ${header(app, { left, right: S.loaded ? `${cards.length} / ${total}` : '' })}
    <div class="tog">
      <button type="button" class="pill ${S.view === 'swipe' ? 'on' : 'ghost'}" data-act="view" data-v="swipe">Swipe</button>
      <button type="button" class="pill ${S.view === 'grid' ? 'on' : 'ghost'}" data-act="view" data-v="grid">Grid</button>
    </div>
    ${S.refreshNote ? html`<div class="note"><span class="spin"></span>${S.refreshNote}</div>` : ''}`;

  if (!S.loaded) {
    return html`${top}<div class="empty">${S.loadError
      ? html`${S.loadError}<br><button type="button" class="pill" data-act="reload">Try again</button>`
      : 'Loading your finds'}</div>`;
  }
  if (!cards.length) {
    const none = !total
      ? 'No finds yet. Tap refresh, or check back tomorrow morning.'
      : 'All caught up. New finds arrive tomorrow morning.';
    return html`${top}<div class="empty">${none}</div>`;
  }
  if (S.view === 'grid') return html`${top}<div class="grid">${cards.map((c) => tile(c))}</div>`;
  return html`${top}${swipeCard(cards[0])}`;
}

// ---------- swipe animation and drag ----------

function fly(el, action, done) {
  if (!el) return done();
  const dx = action === 'like' ? 1 : action === 'pass' ? -1 : 0;
  el.style.transition = 'transform .22s ease, opacity .22s ease';
  el.style.transform = dx ? `translateX(${dx * 130}%) rotate(${dx * 10}deg)` : 'translateY(-40px) scale(.96)';
  el.style.opacity = '0';
  setTimeout(done, 200);
}

let busy = false;
function commit(app, card, el, action) {
  if (busy) return;
  busy = true;
  fly(el, action, () => { busy = false; app.swipe(card, action); });
}

export function swipeTop(app, action) {
  const el = document.querySelector('.card');
  if (!el) return;
  commit(app, app.findCard(el.dataset.id), el, action);
}

export const acts = {
  refresh: (el, app) => app.refresh(),
  reload: () => location.reload(),
  view: (el, app) => app.setView(el.dataset.v),
  swipe: (el, app) => {
    const card = app.findCard(el.dataset.id);
    const top = document.querySelector('.card');
    if (top && top.dataset.id === el.dataset.id) commit(app, card, top, el.dataset.a);
    else app.swipe(card, el.dataset.a);
  },
};

export function mount(root, app) {
  const el = root.querySelector('.card');
  if (!el) return;
  const like = el.querySelector('.hint.like');
  const pass = el.querySelector('.hint.pass');
  let x0 = 0, y0 = 0, dx = 0, dy = 0, down = false, moved = false;

  const move = (e) => {
    if (!down) return;
    dx = e.clientX - x0;
    dy = e.clientY - y0;
    if (!moved && Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)) moved = true;
    if (!moved) return;
    e.preventDefault();
    el.style.transform = `translateX(${dx}px) rotate(${dx / 22}deg)`;
    const k = Math.min(1, Math.abs(dx) / (el.offsetWidth * 0.3));
    like.style.opacity = dx > 0 ? k : 0;
    pass.style.opacity = dx < 0 ? k : 0;
  };
  const up = () => {
    if (!down) return;
    down = false;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    if (moved && Math.abs(dx) > el.offsetWidth * 0.3) {
      commit(app, app.findCard(el.dataset.id), el, dx > 0 ? 'like' : 'pass');
      return;
    }
    el.style.transition = 'transform .18s ease';
    el.style.transform = '';
    like.style.opacity = 0;
    pass.style.opacity = 0;
  };
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || busy) return;
    down = true; moved = false; dx = 0; dy = 0;
    x0 = e.clientX; y0 = e.clientY;
    el.style.transition = 'none';
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  });
  // a drag must not also open the listing
  el.addEventListener('click', (e) => { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } }, true);
  el.addEventListener('dragstart', (e) => e.preventDefault());
}
