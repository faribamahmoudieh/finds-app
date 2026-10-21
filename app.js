// Finds. app shell: state, data loading, laptop helper, refresh, match, settings writes, routing.
import { mergeSwipes, matchKey, slimSnapshot, applyTaxonomyEdit, isTaxonomy } from './lib.js';
import { Repo, SwipeQueue } from './github.js';
import { DemoRepo } from './demo-repo.js';
import { html } from './html.js';
import * as finds from './screens/finds.js';
import * as saved from './screens/saved.js';
import * as match from './screens/match.js';
import * as taste from './screens/taste.js';
import * as setup from './screens/setup.js';
import * as rate from './screens/rate.js';

const HELPER = 'http://localhost:8765';
const DEMO = new URLSearchParams(location.search).get('demo') === '1';
const TABS = { finds, saved, match, taste };
const TAB_NAMES = { finds: 'Finds', saved: 'Saved', match: 'Match', taste: 'Taste' };
// Screens reached by link only (not in the nav): the rating page for each matcher version
// (#rate, #rate-v2, #rate-v3, ...), all one screen that reads its version from the route.
const SCREENS = { ...TABS, rate };
const screenOf = (t) => (Object.hasOwn(SCREENS, t) ? SCREENS[t] : null) || (rate.isRateTab(t) ? rate : null);

// localStorage can be missing or throw (private mode, blocked storage): every access goes through here.
export const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
  keys() { try { return Object.keys(localStorage); } catch { return []; } },
};
const queueStorage = {
  getItem: (k) => store.get(k),
  setItem: (k, v) => { if (!store.set(k, v)) throw new Error('storage unavailable'); },
};

const S = {
  demo: DEMO,
  screen: 'loading',
  tab: tabFromHash(),
  view: store.get('finds.view') === 'grid' ? 'grid' : 'swipe',
  device: null,
  repo: null,
  queue: null,
  loaded: false,
  loadError: null,
  feed: null,
  feedSha: null,
  taste: null,
  settings: null,
  settingsSha: null,
  taxonomy: null,
  taxonomySha: null,
  taxonomyOk: false,
  savedStatus: {},
  remote: {},
  local: {},
  refreshing: false,
  refreshNote: null,
  match: { url: DEMO ? 'https://example-vintage.com/products/wool-blazer' : '', state: 'idle', result: null, error: null, note: null },
  open: null,
  editing: null,
  setupError: null,
  rate: null,
  setupDevice: matchMedia('(min-width: 720px)').matches ? 'laptop' : 'phone',
};

function tabFromHash() {
  const t = location.hash.replace('#', '');
  return screenOf(t) ? t : 'finds';
}

const $ = (sel) => document.querySelector(sel);

// ---------- errors, toast ----------

export function friendly(e, fallback) {
  const msg = String((e && e.message) || '');
  if (/failed: 401/.test(msg)) return 'GitHub did not accept the token. Make a new one on the setup screen.';
  if (/dispatch .* failed: (403|404)/.test(msg)) return 'GitHub would not start the run. Check the token has Actions read and write.';
  if (/write .* failed: (403|404)/.test(msg)) return 'GitHub would not save the change. Check the token has Contents read and write.';
  if (/Timed out/.test(msg)) return 'That took too long. Try again in a minute.';
  if (e instanceof TypeError || /NetworkError|Failed to fetch|Load failed/i.test(msg)) return 'No connection right now. Try again when you have signal.';
  return fallback;
}

let toastTimer = null;
function toast(text) {
  const el = $('#toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 4000);
}

// ---------- swipes ----------

function swipes() {
  const queued = Object.fromEntries(((S.queue && S.queue.queue) || []).map((s) => [s.listing_id, s]));
  return mergeSwipes([S.remote, queued, S.local]);
}

function findCard(id) {
  const all = [...((S.feed && S.feed.cards) || []), ...((S.match.result && S.match.result.cards) || [])];
  return all.find((c) => String(c.id) === String(id)) || null;
}

function swipe(card, action) {
  if (!card) return;
  const sw = { listing_id: String(card.id), action, at: new Date().toISOString(), features: card.features || {}, snapshot: slimSnapshot(card) };
  S.local[sw.listing_id] = sw;
  S.queue.add(sw);
  render();
}

// ---------- loading ----------

function devices() {
  return S.demo ? ['phone', 'laptop', 'demo'] : ['phone', 'laptop'];
}

async function loadAll() {
  const base = ['data/feed.json', 'data/taste.json', 'data/saved_status.json', 'data/settings.json'];
  const swipePaths = devices().map((d) => `data/swipes/${d}.json`);
  // the brand taxonomy is optional: a missing or broken file must never stop the rest loading
  const taxP = S.repo.readJSON('data/taxonomy.json').catch(() => ({ data: null, sha: null }));
  try {
    const res = await Promise.all([...base, ...swipePaths].map((p) => S.repo.readJSON(p)));
    const [feed, tasteFile, status, settings, ...sw] = res;
    if (!S.demo && !feed.data && !settings.data) {
      S.screen = 'setup';
      S.setupError = 'This token cannot see faribamahmoudieh/finds. Check Repository access on the token.';
      render();
      return;
    }
    S.feed = feed.data;
    S.feedSha = feed.sha;
    S.taste = tasteFile.data || {};
    S.savedStatus = status.data || {};
    S.settings = settings.data || {};
    S.settingsSha = settings.sha;
    S.remote = mergeSwipes(sw.map((r) => r.data || {}));
    const tax = await taxP;
    S.taxonomyOk = isTaxonomy(tax.data);
    S.taxonomy = S.taxonomyOk ? tax.data : null;
    S.taxonomySha = tax.sha;
    S.loaded = true;
    S.loadError = null;
  } catch (e) {
    if (/failed: 401/.test(String(e.message))) {
      S.screen = 'setup';
      S.setupError = 'GitHub did not accept the saved token. Make a new one and paste it here.';
    } else {
      S.loadError = friendly(e, 'Finds could not load. Try again in a minute.');
    }
  }
  render();
}

// ---------- laptop helper ----------

let helperCache = { at: 0, ok: false };
async function helperOk() {
  if (S.demo) return false;
  if (Date.now() - helperCache.at < 30000) return helperCache.ok;
  let ok = false;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 1500);
    const r = await fetch(HELPER + '/health', { signal: ctl.signal, cache: 'no-store' });
    clearTimeout(t);
    ok = r.ok;
  } catch {
    ok = false;
  }
  helperCache = { at: Date.now(), ok };
  return ok;
}

async function helperPost(path, body) {
  const r = await fetch(HELPER + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (r.status === 409) throw Object.assign(new Error('busy'), { busy: true });
  if (data && data.git) throw Object.assign(new Error(data.error), { git: true });
  if (!r.ok) throw new Error(`helper ${path} failed: ${r.status}`);
  return data;
}

// ---------- refresh ----------

async function refresh() {
  if (S.refreshing) return;
  S.refreshing = true;
  render();
  try {
    await S.queue.flush().catch(() => {});
    if (await helperOk()) {
      S.refreshNote = 'Refreshing on your laptop, this takes a few minutes';
      render();
      await helperPost('/refresh', {});
    } else {
      S.refreshNote = 'Refreshing on GitHub, this takes a few minutes';
      render();
      const since = (await S.repo.readJSON('data/feed.json')).sha; // the feed may have changed since page load
      await S.repo.dispatch('morning.yml', {});
      await S.repo.waitForFile('data/feed.json', since, { timeoutMs: 15 * 60000, intervalMs: 15000 });
    }
    await loadAll();
    toast('Finds refreshed');
  } catch (e) {
    toast(e.busy ? 'Your laptop is already running a search. Try again in a minute.'
      : e.git ? 'Your laptop could not sync with GitHub. Check the Finds folder on your laptop.'
        : friendly(e, 'Refresh did not finish. Try again in a minute.'));
  } finally {
    S.refreshing = false;
    S.refreshNote = null;
    render();
  }
}

// ---------- match ----------

async function runMatch(input) {
  let url = String(input || '').trim();
  if (!url) return;
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  url = url.replace(/^http:\/\//i, 'https://');
  const M = S.match;
  Object.assign(M, { url, state: 'working', result: null, error: null, note: null });
  render();
  try {
    const path = `data/matches/${await matchKey(url)}.json`;
    if (await helperOk()) {
      M.note = 'Searching Vinted from your laptop, this takes a minute';
      render();
      M.result = await helperPost('/match', { url });
    } else {
      const before = await S.repo.readJSON(path);
      M.note = 'Searching Vinted, this takes a minute or two';
      render();
      await S.repo.dispatch('morning.yml', { match_url: url });
      try {
        M.result = (await S.repo.waitForFile(path, before.sha, { timeoutMs: 6 * 60000, intervalMs: 8000 })).data;
        M.note = null;
      } catch (e) {
        if (!before.data) throw e;
        M.result = before.data;
        M.note = 'A new search did not arrive in time, so this is the last one for this link.';
      }
    }
    if (M.note && M.note.startsWith('Searching')) M.note = null;
    M.state = 'done';
  } catch (e) {
    M.state = 'error';
    M.note = null;
    M.error = e.busy ? 'Your laptop is busy with another search. Try again in a minute.' : friendly(e, 'The search did not finish. Try again in a minute.');
  }
  render();
}

// ---------- settings ----------

async function updateSettings(mutate, message) {
  const clone = (o) => JSON.parse(JSON.stringify(o || {}));
  let final = mutate(clone(S.settings));
  S.settings = final;
  render();
  try {
    const { sha } = await S.repo.writeJSON('data/settings.json', final, message, S.settingsSha, (fresh) => (final = mutate(clone(fresh))));
    S.settingsSha = sha;
    S.settings = final;
  } catch (e) {
    toast(friendly(e, 'That change was not saved. Try again in a minute.'));
    try {
      const cur = await S.repo.readJSON('data/settings.json');
      S.settings = cur.data || S.settings;
      S.settingsSha = cur.sha;
    } catch { /* keep what we have */ }
  }
  render();
}

// ---------- brand taxonomy ----------

// One edit at a time; on a conflict the same edit is re-applied to the newer file (another device or the morning run).
async function updateTaxonomy(edit, message) {
  if (!S.taxonomyOk) return;
  let final = applyTaxonomyEdit(S.taxonomy, edit);
  S.taxonomy = final;
  render();
  try {
    const merge = (fresh) => (final = applyTaxonomyEdit(isTaxonomy(fresh) ? fresh : final, edit));
    const { sha } = await S.repo.writeJSON('data/taxonomy.json', final, message, S.taxonomySha, merge);
    S.taxonomySha = sha;
    S.taxonomy = final;
  } catch (e) {
    toast(friendly(e, 'That change was not saved. Try again in a minute.'));
    try {
      const cur = await S.repo.readJSON('data/taxonomy.json');
      if (isTaxonomy(cur.data)) { S.taxonomy = cur.data; S.taxonomySha = cur.sha; }
    } catch { /* keep what we have */ }
  }
  render();
}

// ---------- setup ----------

async function saveSetup(token, device) {
  token = String(token || '').trim();
  if (!token) { S.setupError = 'Paste your token first.'; render(); return; }
  S.setupError = null;
  S.screen = 'checking';
  render();
  try {
    const repo = new Repo({ token });
    const { data } = await repo.readJSON('data/settings.json');
    if (!data) throw new Error('no access');
  } catch (e) {
    S.screen = 'setup';
    S.setupError = /failed: 401/.test(String(e.message))
      ? 'GitHub did not accept that token. Check you copied all of it.'
      : e instanceof TypeError ? 'No connection right now. Try again when you have signal.'
        : 'That token cannot see faribamahmoudieh/finds. Check Repository access and Contents permission.';
    render();
    return;
  }
  if (!store.set('finds.token', token) || !store.set('finds.device', device)) {
    S.setupError = 'This browser will not store the token (private browsing blocks it). Open Finds in a normal tab.';
    S.screen = 'setup';
    render();
    return;
  }
  boot();
}

function forgetToken() {
  store.del('finds.token');
  location.reload();
}

function resetDemo() {
  if (S.queue) { S.queue.queue = []; S.queue.autoFlush = false; }
  for (const k of store.keys()) if (k.startsWith('finds.demo.') || k === 'finds.queue.demo') store.del(k);
  location.reload();
}

// ---------- rendering ----------

const app = {
  S, swipes, swipe, findCard, refresh, runMatch, updateSettings, updateTaxonomy, saveSetup, forgetToken, resetDemo, toast,
  render: () => render(),
  go(tab) { if (location.hash !== '#' + tab) location.hash = tab; else { S.tab = tab; render(); } },
  setView(v) { S.view = v; store.set('finds.view', v); render(); },
};

function navHtml() {
  return html`${Object.entries(TAB_NAMES).map(([k, label]) =>
    html`<button type="button" class="${S.tab === k ? 'on' : ''}" data-act="go" data-tab="${k}" ${S.tab === k ? 'aria-current="page"' : ''}>${label}</button>`)}`;
}

function render() {
  const root = $('#app');
  const nav = $('#nav');
  // keep what the person is typing across re-renders
  const kept = {};
  root.querySelectorAll('input[data-keep]').forEach((i) => { kept[i.dataset.keep] = i.value; });
  const focused = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.keep : null;

  if (S.screen === 'setup' || S.screen === 'checking') {
    root.innerHTML = String(setup.render(app));
    nav.hidden = true;
  } else {
    const screen = screenOf(S.tab);
    root.innerHTML = String(screen.render(app));
    nav.innerHTML = String(navHtml());
    nav.hidden = !(S.tab in TABS);
  }
  root.querySelectorAll('input[data-keep]').forEach((i) => {
    if (i.dataset.keep in kept && !i.hasAttribute('data-fresh')) i.value = kept[i.dataset.keep];
    if (focused && i.dataset.keep === focused) i.focus();
  });
  const mod = S.screen === 'main' ? screenOf(S.tab) : null;
  if (mod && mod.mount) mod.mount(root, app);
}

const actions = { ...finds.acts, ...saved.acts, ...match.acts, ...taste.acts, ...setup.acts, ...rate.acts, go: (el) => app.go(el.dataset.tab) };
const forms = { ...match.forms, ...taste.forms, ...setup.forms };

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = actions[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el, app, e); }
});

document.addEventListener('submit', (e) => {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  const fn = forms[form.dataset.form];
  if (fn) fn(form, app);
});

document.addEventListener('keydown', (e) => {
  if (S.screen !== 'main' || S.tab !== 'finds' || S.view !== 'swipe') return;
  if (e.target.closest && e.target.closest('input, textarea, select')) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const action = { ArrowLeft: 'pass', ArrowRight: 'like', s: 'save', S: 'save' }[e.key];
  if (!action) return;
  e.preventDefault();
  finds.swipeTop(app, action);
});

window.addEventListener('hashchange', () => { S.tab = tabFromHash(); S.open = null; S.editing = null; render(); window.scrollTo(0, 0); });

const flushSoon = () => { if (S.queue && S.queue.size()) S.queue.flush().catch(() => {}); };
window.addEventListener('online', flushSoon);
window.addEventListener('pagehide', flushSoon);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSoon(); });

function boot() {
  if (S.demo) {
    S.device = 'demo';
    S.repo = new DemoRepo();
  } else {
    const token = store.get('finds.token');
    const device = store.get('finds.device');
    if (!token || !(device === 'phone' || device === 'laptop')) {
      S.screen = 'setup';
      render();
      return;
    }
    S.device = device;
    S.repo = new Repo({ token });
  }
  S.queue = new SwipeQueue({ storage: queueStorage, repo: S.repo, device: S.device });
  S.screen = 'main';
  render();
  loadAll().then(flushSoon);
}

boot();
