// Taste screen: what Finds has learned, pin/remove/add brands and style words, plus settings.
import { html } from '../html.js';
import { header } from './finds.js';
import { TIERS, canonicalBrand, tierOf, familiesOf, unclassifiedBrands } from '../lib.js';

const SECTIONS = [
  ['brand', 'Brands', { pinned: 'pinned', removed: 'removed', add: 'Add a brand' }],
  ['style', 'Styles', { pinned: 'pinned_styles', removed: 'removed_styles', add: 'Add a style word' }],
  ['colour', 'Colours'],
  ['material', 'Materials'],
  ['type', 'Types'],
];
const TOP = 6;
const fold = (s) => String(s || '').trim().toLowerCase();
const has = (list, v) => (list || []).some((x) => fold(x) === fold(v));
const without = (list, v) => (list || []).filter((x) => fold(x) !== fold(v));
const withItem = (list, v) => (has(list, v) ? list || [] : [...(list || []), v]);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export function label(w, max) {
  if (!(w > 0.15)) return 'mostly passed';
  return w / max >= 0.75 ? 'liked a lot' : 'liked';
}

function section(app, dim, title, keys) {
  const { S } = app;
  const st = S.settings || {};
  const pinned = keys ? st[keys.pinned] || [] : [];
  const removed = keys ? st[keys.removed] || [] : [];
  let rows = ((S.taste && S.taste[dim]) || []).filter(([v]) => !has(removed, v));
  for (const p of [...pinned].reverse()) if (!rows.some(([v]) => fold(v) === fold(p))) rows.unshift([p, null]);
  rows = rows.slice(0, Math.max(TOP, pinned.length));
  const max = Math.max(0.0001, ...rows.map(([, w]) => w || 0));
  const body = rows.map(([v, w]) => {
    const key = `${dim}:${fold(v)}`;
    const isPinned = has(pinned, v);
    const width = w == null ? 0 : Math.max(0, Math.min(100, Math.round((w / max) * 100)));
    const right = w == null ? '' : label(w, max);
    const row = keys
      ? html`<button type="button" class="tr" data-act="topen" data-k="${key}" aria-expanded="${S.open === key}"><span>${v}${isPinned ? ' · pinned' : ''}</span><span>${right}</span></button>`
      : html`<div class="tr"><span>${v}</span><span>${right}</span></div>`;
    const tools = keys && S.open === key
      ? html`<div class="tacts">
          <button type="button" class="pill sm" data-act="pin" data-d="${dim}" data-v="${v}">${isPinned ? 'Unpin' : 'Pin'}</button>
          <button type="button" class="pill sm" data-act="drop" data-d="${dim}" data-v="${v}">Remove</button>
        </div>`
      : '';
    return html`${row}<div class="meter"><i style="width:${width}%"></i></div>${tools}`;
  });
  return html`<span class="lab pad top">${title}</span>
    ${rows.length ? body : html`<div class="tr"><span class="v" style="text-align:left">Nothing learned yet</span></div>`}
    ${keys && removed.length ? html`<div class="gone">Removed, tap to bring back: ${removed.map((v) => html`<button type="button" class="pill sm ghost" data-act="restore" data-d="${dim}" data-v="${v}">${v}</button>`)}</div>` : ''}
    ${keys ? html`<form class="addf" data-form="add" data-d="${dim}"><input class="field" name="v" autocomplete="off" placeholder="${keys.add}" data-keep="add-${dim}" data-fresh aria-label="${keys.add}"><button class="pill sm" type="submit">Add</button></form>` : ''}`;
}

function editable(app, key, name, value) {
  const { S } = app;
  if (S.editing === key) {
    return html`<form class="tr" data-form="edit" data-k="${key}"><span>${name}</span><input class="edit" name="v" value="${value.raw}" autocomplete="off" aria-label="${name}"></form>`;
  }
  return html`<button type="button" class="tr" data-act="edit" data-k="${key}"><span>${name}</span><span>${value.shown}</span></button>`;
}

function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

// ---------- brand tiers ----------

const TIER_NAMES = { luxury: 'Luxury', designer: 'Designer', contemporary: 'Contemporary', high_street: 'High street' };

// Every brand the app has seen, once per listing: today's feed, the last match on this screen, swipe snapshots.
export function seenBrands(S, swipes) {
  const byId = new Map();
  const add = (id, brand) => { if (brand && !byId.has(String(id))) byId.set(String(id), brand); };
  for (const c of (S.feed && S.feed.cards) || []) add(c.id, c.brand);
  const r = S.match && S.match.result;
  for (const c of (r && r.cards) || []) add(c.id, c.brand);
  if (r && r.spotted) add(`spotted:${S.match.url}`, r.spotted.brand);
  for (const [id, sw] of Object.entries(swipes || {})) add((sw && sw.listing_id) || id, sw && sw.snapshot && sw.snapshot.brand);
  return [...byId.values()];
}

function tierPills(brand, current) {
  return html`<div class="tacts wrap">${TIERS.map((t) => html`<button type="button" class="pill sm ${current === t ? 'on' : 'ghost'}" data-act="settier" data-b="${brand}" data-t="${t}" aria-pressed="${current === t}">${TIER_NAMES[t]}</button>`)}</div>`;
}

function brandTools(app, brand) {
  const tax = app.S.taxonomy;
  const fams = familiesOf(brand, tax);
  const all = Object.keys(tax.families || {});
  return html`<div class="tin">${tierPills(brand, tierOf(brand, tax))}
    ${all.length ? html`<div class="tacts wrap"><span class="tsub">Families</span>${all.map((f) => {
      const on = fams.includes(f);
      return html`<button type="button" class="pill sm ${on ? 'on' : 'ghost'}" data-act="setfam" data-b="${brand}" data-f="${f}" data-on="${on ? '0' : '1'}" aria-pressed="${on}">${f}</button>`;
    })}</div>` : ''}</div>`;
}

function brandRow(app, brand) {
  const key = `tax:${brand}`;
  const fams = familiesOf(brand, app.S.taxonomy);
  return html`<button type="button" class="tr in" data-act="topen" data-k="${key}" aria-expanded="${app.S.open === key}"><span>${brand}</span><span class="fams">${fams.join(', ')}</span></button>
    ${app.S.open === key ? brandTools(app, brand) : ''}`;
}

function brandsBlock(app) {
  const { S } = app;
  const title = html`<span class="lab pad top">Brand tiers</span>`;
  if (!S.taxonomyOk) return html`${title}<p class="tnote">Brand tiers are not set up yet.</p>`;
  const tax = S.taxonomy;
  const groups = TIERS.map((t) => {
    const brands = [...new Set((tax.tiers[t] || []).map((b) => canonicalBrand(b, tax)))].sort((a, b) => a.localeCompare(b));
    const open = S.tierOpen === t;
    return html`<button type="button" class="tr" data-act="tieropen" data-t="${t}" aria-expanded="${open}"><span>${TIER_NAMES[t]}</span><span>${brands.length}</span></button>
      ${open ? brands.map((b) => brandRow(app, b)) : ''}`;
  });
  const loose = unclassifiedBrands(seenBrands(S, app.swipes()), tax);
  const pending = S.newBrand && tierOf(S.newBrand, tax) === 'unknown' ? S.newBrand : null;
  return html`${title}
    <p class="tnote">Tap a tier to see its brands, tap a brand to move it or change its families.</p>
    ${groups}
    <form class="addf" data-form="newbrand"><input class="field" name="v" autocomplete="off" placeholder="Add a brand to a tier" data-keep="add-tier" data-fresh aria-label="Add a brand to a tier"><button class="pill sm" type="submit">Add</button></form>
    ${pending ? html`<div class="tr"><span>${pending}</span><span>pick a tier</span></div>${tierPills(pending, null)}` : ''}
    ${loose.length ? html`<span class="lab pad top">Unclassified</span>
      <p class="tnote">Brands in your finds with no tier yet, most seen first.</p>
      ${loose.map(({ brand, count }) => html`<div class="tr"><span>${brand}</span><span>${count === 1 ? 'seen once' : `seen ${count} times`}</span></div>${tierPills(brand, null)}`)}` : ''}`;
}

function settingsBlock(app) {
  const { S } = app;
  const st = S.settings || {};
  const sz = st.sizes || {};
  const shops = st.shops || [];
  const brands = st.brands || [];
  const longLeg = sz.long_leg_cm ? ', long' : '';
  return html`<span class="lab pad top">Settings</span>
    ${editable(app, 'tops', 'Tops', { raw: (sz.tops || []).join(', '), shown: (sz.tops || []).join(', ') || 'not set' })}
    ${editable(app, 'trousers', 'Trousers', { raw: String(sz.bottoms_min_w ?? 29), shown: `W${sz.bottoms_min_w ?? 29} and up${longLeg}` })}
    ${editable(app, 'deal', 'Deal', { raw: String(st.min_deal_pct ?? 40), shown: `${st.min_deal_pct ?? 40}% under shop` })}
    <button type="button" class="tr" data-act="topen" data-k="shops" aria-expanded="${S.open === 'shops'}"><span>Shops</span><span>${shops.length} · add</span></button>
    ${S.open === 'shops' ? html`
      ${shops.map((s, i) => html`<div class="tr"><span>${s.name} <span style="color:var(--mute)">${hostOf(s.url)} · ${s.currency || ''}</span></span><button type="button" class="pill sm ghost" data-act="dropshop" data-i="${i}">Remove</button></div>`)}
      ${brands.length ? html`<div class="tr"><span>Brands you typed <span style="color:var(--mute)">${brands.join(', ')}</span></span><button type="button" class="pill sm ghost" data-act="clearbrands">Clear</button></div>` : ''}
      <form class="addf" data-form="shop"><input class="field" name="v" autocomplete="off" placeholder="Shop link, or brands with commas" data-keep="add-shop" data-fresh aria-label="Shop link or brands"><button class="pill sm" type="submit">Add</button></form>` : ''}
    <span class="lab pad top">This device</span>
    ${app.S.demo
      ? html`<div class="tr"><span>Demo, swipes stay in this browser</span><button type="button" class="pill sm ghost" data-act="resetdemo">Reset</button></div>`
      : html`<div class="tr"><span>${S.device === 'laptop' ? 'Laptop' : 'Phone'}</span><button type="button" class="pill sm ghost" data-act="forget">Forget token</button></div>`}`;
}

export function render(app) {
  const { S } = app;
  const swipes = Object.keys(app.swipes()).length;
  const shops = ((S.settings && S.settings.shops) || []).length;
  return html`${header(app)}
    <div class="page">
      <h1 class="h">Your taste</h1>
      <p class="sub">From ${plural(shops, 'shop', 'shops')} and ${plural(swipes, 'swipe', 'swipes')}</p>
      ${S.loaded ? SECTIONS.map(([d, t, k]) => section(app, d, t, k)) : html`<div class="empty">${S.loadError || 'Loading'}</div>`}
      ${S.loaded ? brandsBlock(app) : ''}
      ${S.loaded ? settingsBlock(app) : ''}
    </div>`;
}

const keysFor = (dim) => (SECTIONS.find(([d]) => d === dim) || [])[2];

export const acts = {
  topen: (el, app) => { app.S.open = app.S.open === el.dataset.k ? null : el.dataset.k; app.render(); },
  pin: (el, app) => {
    const k = keysFor(el.dataset.d);
    const v = el.dataset.v;
    const pinning = !has((app.S.settings || {})[k.pinned], v);
    app.updateSettings((s) => {
      s[k.pinned] = pinning ? withItem(s[k.pinned], v) : without(s[k.pinned], v);
      s[k.removed] = without(s[k.removed], v);
      return s;
    }, `${pinning ? 'pin' : 'unpin'} ${v}`);
  },
  drop: (el, app) => {
    const k = keysFor(el.dataset.d);
    const v = el.dataset.v;
    app.S.open = null;
    app.updateSettings((s) => {
      s[k.removed] = withItem(s[k.removed], v);
      s[k.pinned] = without(s[k.pinned], v);
      return s;
    }, `remove ${v}`);
  },
  restore: (el, app) => {
    const k = keysFor(el.dataset.d);
    const v = el.dataset.v;
    app.updateSettings((s) => { s[k.removed] = without(s[k.removed], v); return s; }, `bring back ${v}`);
  },
  edit: (el, app) => { app.S.editing = el.dataset.k; app.render(); },
  dropshop: (el, app) => {
    const shop = (app.S.settings.shops || [])[Number(el.dataset.i)];
    if (!shop) return;
    app.updateSettings((s) => { s.shops = (s.shops || []).filter((x) => x.url !== shop.url); return s; }, `remove shop ${shop.name}`);
  },
  clearbrands: (el, app) => app.updateSettings((s) => { s.brands = []; return s; }, 'clear typed brands'),
  tieropen: (el, app) => { app.S.tierOpen = app.S.tierOpen === el.dataset.t ? null : el.dataset.t; app.render(); },
  settier: (el, app) => {
    const { b, t } = el.dataset;
    if (app.S.newBrand === b) app.S.newBrand = null;
    app.updateTaxonomy({ brand: b, tier: t }, `${b} to ${TIER_NAMES[t] || t}`);
  },
  setfam: (el, app) => {
    const { b, f } = el.dataset;
    const on = el.dataset.on === '1';
    app.updateTaxonomy({ brand: b, family: f, on }, `${b} ${on ? 'into' : 'out of'} ${f}`);
  },
  forget: (el, app) => app.forgetToken(),
  resetdemo: (el, app) => app.resetDemo(),
};

const BANNED_TOPS = new Set(['XXS', 'XS', 'S']);

export const forms = {
  add: (form, app) => {
    const v = form.elements.v.value.trim();
    if (!v) return;
    const k = keysFor(form.dataset.d);
    app.updateSettings((s) => {
      s[k.pinned] = withItem(s[k.pinned], v);
      s[k.removed] = without(s[k.removed], v);
      return s;
    }, `add ${v}`);
  },
  newbrand: (form, app) => {
    const tax = app.S.taxonomy;
    const name = canonicalBrand(form.elements.v.value, tax);
    if (!name || !app.S.taxonomyOk) return;
    const tier = tierOf(name, tax);
    if (tier !== 'unknown') {
      app.S.newBrand = null;
      app.S.tierOpen = tier;
      app.S.open = `tax:${name}`;
      app.toast(`${name} is already in ${TIER_NAMES[tier]}.`);
    } else {
      app.S.newBrand = name;
    }
    app.render();
  },
  shop: (form, app) => {
    const v = form.elements.v.value.trim();
    if (!v) return;
    if (/^https?:\/\//i.test(v) || /^[\w-]+(\.[\w-]+)+(\/|$)/.test(v)) {
      let url;
      try { url = new URL(/^https?:\/\//i.test(v) ? v : 'https://' + v); } catch { app.toast('That link does not look right.'); return; }
      const host = url.hostname.replace(/^www\./, '');
      const name = host.split('.')[0].replace(/[-_]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
      const currency = /\.uk$/.test(host) ? 'GBP' : 'EUR';
      app.updateSettings((s) => {
        s.shops = s.shops || [];
        if (!s.shops.some((x) => hostOf(x.url) === host)) s.shops.push({ name, url: url.origin, currency });
        return s;
      }, `add shop ${host}`);
    } else {
      const list = v.split(/[,\n]/).map((b) => b.trim()).filter(Boolean);
      app.updateSettings((s) => { for (const b of list) s.brands = withItem(s.brands, b); return s; }, 'add typed brands');
    }
  },
  edit: (form, app) => {
    const key = form.dataset.k;
    const v = form.elements.v.value.trim();
    app.S.editing = null;
    if (key === 'tops') {
      const all = v.split(/[,\s]+/).map((x) => x.trim().toUpperCase()).filter(Boolean);
      const tops = all.filter((x) => !BANNED_TOPS.has(x));
      if (tops.length < all.length) app.toast('S and XS stay out of the search.');
      if (!tops.length) { app.render(); return; }
      app.updateSettings((s) => { s.sizes = { ...(s.sizes || {}), tops }; return s; }, 'tops sizes');
    } else if (key === 'trousers') {
      const n = Math.round(Number(v));
      if (!(n >= 24 && n <= 44)) { app.toast('Use a waist between 24 and 44.'); app.render(); return; }
      app.updateSettings((s) => { s.sizes = { ...(s.sizes || {}), bottoms_min_w: n }; return s; }, 'trouser waist');
    } else if (key === 'deal') {
      const n = Math.round(Number(String(v).replace('%', '')));
      if (!(n >= 10 && n <= 90)) { app.toast('Use a deal between 10% and 90%.'); app.render(); return; }
      app.updateSettings((s) => { s.min_deal_pct = n; return s; }, 'deal size');
    } else {
      app.render();
    }
  },
};

export function mount(root, app) {
  const input = root.querySelector('form[data-form="edit"] input');
  if (input) {
    input.focus();
    input.select();
    input.addEventListener('keydown', (e) => { if (e.key === 'Escape') { app.S.editing = null; app.render(); } });
    input.addEventListener('blur', () => { if (app.S.editing) input.form.requestSubmit(); });
  }
}
