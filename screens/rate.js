// Rate screen (#rate for v1, #rate-v2, #rate-v3 and so on for later rounds; not in the nav): a shop piece next to a Vinted find,
// one tap to rate it. Ratings go to data/eval/ratings-<v>.json, one save per tap, merged so two
// devices never lose each other's ratings.
import { html, money, safeUrl, img } from '../html.js';
import { header } from './finds.js';

export const LABELS = [
  { key: 'good', text: 'Good match' },
  { key: 'wrong_brand_level', text: 'Wrong brand level' },
  { key: 'wrong_shape', text: 'Wrong shape or style' },
  { key: 'too_cheap', text: 'Too cheap-looking' },
  { key: 'skip', text: 'Skip' },
];

const RATE_TAB = /^rate(?:-(v\d+))?$/;
export const isRateTab = (tab) => RATE_TAB.test(String(tab || ''));
export const versionFromTab = (tab) => (String(tab || '').match(RATE_TAB) || [])[1] || 'v1';

// Index of the first pair without a rating, starting at `from` and wrapping round once; -1 when all are rated.
export function nextUnrated(pairs, ratings, from = 0) {
  const n = (pairs || []).length;
  for (let k = 0; k < n; k++) {
    const i = (from + k) % n;
    if (!(ratings || {})[pairs[i].pair_id]) return i;
  }
  return -1;
}

// What is on GitHub now, with this session's own taps on top.
export function mergeRatings(fresh, mine) {
  return { ...(fresh || {}), ...(mine || {}) };
}

export const progressLabel = (idx, total) => `${idx + 1} of ${total}`;

function side(label, item, price, linkLabel) {
  const bits = [money(price), item.shop].filter(Boolean).join(' · ');
  return html`<figure class="rp">
    <span class="lab">${label}</span>
    <a class="ph" href="${safeUrl(item.url)}" target="_blank" rel="noopener noreferrer" aria-label="${linkLabel}">${img(item)}</a>
    <figcaption>
      ${item.brand ? html`<div class="b">${item.brand}</div>` : ''}
      <div class="n">${item.title}</div>
      <div class="p">${bits}</div>
    </figcaption>
  </figure>`;
}

function body(R) {
  if (!R || R.state === 'loading') return html`<div class="note"><span class="spin"></span>Loading the pairs</div>`;
  if (R.state === 'error') return html`<div class="err">${R.error}</div>`;
  if (R.state === 'missing' || !(R.pairs || []).length) {
    return html`<div class="note">The pairs for this round are not ready yet.</div>`;
  }
  if (R.idx === -1) {
    return html`<h1 class="h">All done, thank you</h1>
      <p class="sub">Every pair has a rating. You can go back and change any of them.</p>
      <div class="rate-acts">
        <a class="pill on" href="#finds">Back to Finds</a>
        <button type="button" class="pill ghost" data-act="rate-back">Back</button>
      </div>`;
  }
  const pair = R.pairs[R.idx];
  const cur = (R.ratings || {})[pair.pair_id];
  const c = pair.cand || {};
  return html`<h1 class="h">Is this a good match?</h1>
    <p class="sub">The find on Vinted next to the shop piece it was matched with</p>
    <span class="lab pad">${progressLabel(R.idx, R.pairs.length)}</span>
    <div class="rate-pair">
      ${side('Shop piece', pair.piece || {}, (pair.piece || {}).price_gbp, 'Open on the shop')}
      ${side('On Vinted', c, c.total_price ?? c.price, 'Open on Vinted')}
    </div>
    <div class="rate-acts">
      ${LABELS.map((l) => html`<button type="button" class="pill ${cur === l.key ? 'on' : ''}" data-act="rate" data-label="${l.key}">${l.text}</button>`)}
    </div>
    <div class="rate-acts">
      <button type="button" class="pill ghost" data-act="rate-back" ${R.idx === 0 ? 'disabled' : ''}>Back</button>
    </div>`;
}

export function render(app) {
  return html`${header(app, { left: html`<a href="#finds">Finds</a>` })}
    <div class="page rate">${body(app.S.rate)}</div>`;
}

async function load(app, version) {
  const R = { version, state: 'loading', pairs: [], ratings: {}, mine: {}, idx: 0, sha: null, saving: Promise.resolve() };
  app.S.rate = R;
  app.render();
  try {
    const [p, r] = await Promise.all([
      app.S.repo.readJSON(`data/eval/pairs-${version}.json`),
      app.S.repo.readJSON(`data/eval/ratings-${version}.json`),
    ]);
    if (app.S.rate !== R) return;
    R.pairs = Array.isArray(p.data) ? p.data : [];
    R.ratings = (r.data && typeof r.data === 'object') ? r.data : {};
    R.sha = r.sha;
    R.idx = nextUnrated(R.pairs, R.ratings);
    R.state = R.pairs.length ? 'ready' : 'missing';
  } catch {
    if (app.S.rate !== R) return;
    R.state = 'error';
    R.error = 'The pairs could not load. Try again in a minute.';
  }
  app.render();
}

export function mount(root, app) {
  const version = versionFromTab(app.S.tab);
  if (!app.S.rate || app.S.rate.version !== version) load(app, version);
}

// Saves run one after another; a conflict (the other device saved) merges with what is there now.
function save(app, R) {
  const path = `data/eval/ratings-${R.version}.json`;
  R.saving = R.saving.then(async () => {
    const merged = (fresh) => (R.ratings = mergeRatings(fresh, R.mine));
    const { sha } = await app.S.repo.writeJSON(path, mergeRatings(R.ratings, R.mine), `Rate ${R.version} pairs`, R.sha, merged);
    R.sha = sha;
  }).catch(() => app.toast('That rating was not saved. Check your connection and tap it again.'));
}

export const acts = {
  rate(el, app) {
    const R = app.S.rate;
    const pair = R && R.pairs[R.idx];
    if (!pair) return;
    R.ratings = { ...R.ratings, [pair.pair_id]: el.dataset.label };
    R.mine = { ...R.mine, [pair.pair_id]: el.dataset.label };
    R.idx = nextUnrated(R.pairs, R.ratings, R.idx + 1);
    app.render();
    window.scrollTo(0, 0);
    save(app, R);
  },
  'rate-back'(el, app) {
    const R = app.S.rate;
    if (!R || !R.pairs.length) return;
    R.idx = R.idx === -1 ? R.pairs.length - 1 : Math.max(0, R.idx - 1);
    app.render();
    window.scrollTo(0, 0);
  },
};
