// Pure UI logic for Finds. No DOM, no network.

export function mergeSwipes(files) {
  const out = {};
  for (const file of files || []) {
    for (const [lid, sw] of Object.entries(file || {})) {
      const id = String(sw?.listing_id ?? lid);
      if (!out[id] || String(sw.at) > String(out[id].at)) out[id] = sw;
    }
  }
  return out;
}

export function nextCards(feed, swipes = {}) {
  return ((feed && feed.cards) || []).filter((c) => !(c.id in (swipes || {})));
}

export function savedList(swipes, feedCards, savedStatus) {
  const byId = new Map((feedCards || []).map((c) => [c.id, c]));
  return Object.values(swipes || {})
    .filter((s) => s.action === 'like' || s.action === 'save')
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .map((s) => {
      const card = byId.get(s.listing_id) || s.snapshot || { id: s.listing_id };
      return { ...card, id: card.id ?? s.listing_id, status: (savedStatus || {})[s.listing_id] || 'active' };
    });
}

export function formatPrice(gbp) {
  return '£' + Number(gbp).toFixed(2);
}

export function savingLabel(card) {
  const p = card && card.saved_pct;
  if (p == null || !(p > 0)) return null;
  return '−' + Math.round(p) + '%';
}

// What a swipe keeps of its card: enough for the Saved screen, small enough for the swipe file.
const SNAPSHOT_KEYS = ['id', 'title', 'brand', 'image', 'url', 'size_label', 'total_price', 'price', 'offer', 'comparable'];
export function slimSnapshot(card) {
  const out = {};
  for (const k of SNAPSHOT_KEYS) if (card && card[k] !== undefined) out[k] = card[k];
  return out;
}

// "save £82" next to the shop comparison; none for similar matches or without a comparable.
export function savedPounds(card) {
  if (!card || card.match === 'similar' || !card.comparable || !(card.saved_gbp > 0)) return null;
  const n = Math.round(Number(card.saved_gbp) * 100) / 100;
  return 'save £' + (Number.isInteger(n) ? n : n.toFixed(2));
}

export function statusNote(status) {
  return { reserved: 'Reserved', sold: 'Sold' }[status] || null;
}

const localDay = (t) => {
  const d = new Date(t);
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
};

// "listed 2h ago" when Vinted said when it was uploaded, otherwise "new today" / "seen 3d ago".
export function ageLabel(card, now = Date.now()) {
  const listed = card && card.listed_at ? Date.parse(card.listed_at) : NaN;
  if (!Number.isNaN(listed)) {
    const mins = Math.max(0, Math.round((now - listed) / 60000));
    if (mins < 60) return `listed ${mins}m ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `listed ${hours}h ago`;
    return `listed ${Math.round(hours / 24)}d ago`;
  }
  const seen = card && card.first_seen ? Date.parse(String(card.first_seen).slice(0, 10)) : NaN;
  if (Number.isNaN(seen)) return null;
  const days = Math.max(0, Math.round((localDay(now) - seen) / 86400000));
  return days === 0 ? 'new today' : `seen ${days}d ago`;
}

export function statusMessage(feed, swipes = {}) {
  switch (feed && feed.status) {
    case 'blocked':
      return 'Vinted blocked today’s search. Try refresh on your laptop, or use these searches.';
    case 'layout_changed':
      return 'Vinted changed its pages, so some finds may be missing.';
    case 'partial':
      return feed.message || 'Only part of today’s search finished.';
    case 'ok': {
      const n = nextCards(feed, swipes).length;
      return n > 0 ? `${n} new ${n === 1 ? 'find' : 'finds'} this morning in your size` : null;
    }
    default:
      return null;
  }
}

// Same key as finds.match.match_key: first 10 hex of sha1 of the URL without query, fragment or trailing slashes.
export async function matchKey(url) {
  const bare = String(url).split('?')[0].split('#')[0].replace(/\/+$/, '');
  const buf = await globalThis.crypto.subtle.digest('SHA-1', new TextEncoder().encode(bare));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('').slice(0, 10);
}

// ---------- brand taxonomy (mirrors finds/taxonomy.py and finds/shops.normalise_brand) ----------

export const TIERS = ['luxury', 'designer', 'contemporary', 'high_street'];

// Same steps as Python normalise_brand: NFKD, drop combining marks, lowercase, & to " and ", ’ to ', collapse spaces.
export function normaliseBrand(s) {
  return String(s ?? '')
    .normalize('NFKD').replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ').replace(/’/g, "'")
    .replace(/\s+/g, ' ').trim();
}

export function isTaxonomy(t) {
  return !!t && typeof t === 'object' && !!t.tiers && typeof t.tiers === 'object' && !Array.isArray(t.tiers);
}

const INDEX = new WeakMap();
function index(t) {
  if (!isTaxonomy(t)) return null;
  let ix = INDEX.get(t);
  if (ix) return ix;
  ix = { display: new Map(), tier: new Map(), families: new Map(), alias: new Map() };
  for (const [tier, brands] of Object.entries(t.tiers || {})) {
    for (const b of brands || []) {
      const k = normaliseBrand(b);
      if (!ix.display.has(k)) ix.display.set(k, b);
      if (!ix.tier.has(k)) ix.tier.set(k, tier);
    }
  }
  for (const [fam, brands] of Object.entries(t.families || {})) {
    for (const b of brands || []) {
      const k = normaliseBrand(b);
      if (!ix.display.has(k)) ix.display.set(k, b);
      if (!ix.families.has(k)) ix.families.set(k, []);
      ix.families.get(k).push(fam);
    }
  }
  for (const fams of ix.families.values()) fams.sort();
  for (const [a, c] of Object.entries(t.aliases || {})) ix.alias.set(normaliseBrand(a), c);
  for (const c of ix.alias.values()) if (!ix.display.has(normaliseBrand(c))) ix.display.set(normaliseBrand(c), c);
  INDEX.set(t, ix);
  return ix;
}

function brandKey(name, ix) {
  const k = normaliseBrand(name);
  const canon = ix && ix.alias.get(k);
  return canon ? normaliseBrand(canon) : k;
}

const blank = (name) => name == null || !String(name).trim();

export function canonicalBrand(name, taxonomy) {
  if (blank(name)) return null;
  const ix = index(taxonomy);
  return (ix && ix.display.get(brandKey(name, ix))) || String(name).trim();
}

export function tierOf(brand, taxonomy) {
  const ix = index(taxonomy);
  if (blank(brand) || !ix) return 'unknown';
  return ix.tier.get(brandKey(brand, ix)) || 'unknown';
}

export function familiesOf(brand, taxonomy) {
  const ix = index(taxonomy);
  if (blank(brand) || !ix) return [];
  return [...(ix.families.get(brandKey(brand, ix)) || [])];
}

// One edit, applied to a copy: {brand, tier} moves the brand to that tier (out of every other one);
// {brand, family, on} adds it to or removes it from that family. Re-applying to a newer file is safe.
export function applyTaxonomyEdit(taxonomy, edit) {
  const t = JSON.parse(JSON.stringify(taxonomy || {}));
  const ix = index(taxonomy);
  const name = canonicalBrand(edit && edit.brand, taxonomy);
  if (!name) return t;
  const key = brandKey(name, ix);
  const same = (b) => brandKey(b, ix) === key;
  if (edit.family) {
    t.families = t.families || {};
    const list = (t.families[edit.family] || []).filter((b) => !same(b));
    if (edit.on) list.push((t.families[edit.family] || []).find(same) || name);
    t.families[edit.family] = list;
    return t;
  }
  if (!TIERS.includes(edit.tier)) return t;
  t.tiers = t.tiers || {};
  for (const tier of Object.keys(t.tiers)) {
    if (tier === edit.tier) continue;
    t.tiers[tier] = (t.tiers[tier] || []).filter((b) => !same(b));
  }
  const target = t.tiers[edit.tier] || [];
  if (!target.some(same)) target.push(name);
  t.tiers[edit.tier] = target;
  return t;
}

// Brands seen in cards and swipes that have no tier yet, by canonical name, most frequent first.
export function unclassifiedBrands(names, taxonomy, limit = 30) {
  const ix = index(taxonomy);
  const seen = new Map();
  for (const n of names || []) {
    if (blank(n) || tierOf(n, taxonomy) !== 'unknown') continue;
    const k = brandKey(n, ix);
    const cur = seen.get(k) || { brand: canonicalBrand(n, taxonomy), count: 0 };
    cur.count++;
    seen.set(k, cur);
  }
  return [...seen.values()].sort((a, b) => b.count - a.count || a.brand.localeCompare(b.brand)).slice(0, limit);
}
