// GitHub contents API layer and offline-safe swipe queue. Vanilla ES module.
import { mergeSwipes } from './lib.js';

export function b64encode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function b64decode(b64) {
  const bin = atob(String(b64).replace(/\s/g, ''));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class Repo {
  constructor({ owner = 'faribamahmoudieh', repo = 'finds', token, fetch: f } = {}) {
    this.owner = owner;
    this.repo = repo;
    this.token = token;
    this._refPromise = null;
    this._fetch = f || ((...a) => globalThis.fetch(...a));
  }

  _headers() {
    return {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${this.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    };
  }

  _url(suffix) {
    return `https://api.github.com/repos/${this.owner}/${this.repo}/${suffix}`;
  }

  _contentsUrl(path) {
    return this._url('contents/' + path.split('/').map(encodeURIComponent).join('/'));
  }

  async readJSON(path) {
    const r = await this._fetch(this._contentsUrl(path) + `?t=${Date.now()}`, {
      headers: this._headers(),
      cache: 'no-store',
    });
    if (r.status === 404) return { data: null, sha: null };
    if (!r.ok) throw new Error(`GitHub read ${path} failed: ${r.status}`);
    const body = await r.json();
    if (body.content || body.encoding === 'base64') return { data: JSON.parse(b64decode(body.content)), sha: body.sha };
    // Files over 1 MB come back without content: fetch the raw bytes, keep the sha from the metadata.
    const raw = await this._fetch(this._contentsUrl(path) + `?t=${Date.now()}`, {
      headers: { ...this._headers(), Accept: 'application/vnd.github.raw+json' },
      cache: 'no-store',
    });
    if (!raw.ok) throw new Error(`GitHub read ${path} failed: ${raw.status}`);
    return { data: JSON.parse(await raw.text()), sha: body.sha };
  }

  // compact: no indentation (swipe files grow every day; pretty-printing would double their size)
  async writeJSON(path, data, message, sha, merge, { compact = false } = {}) {
    let body = data;
    let curSha = sha;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const payload = { message, content: b64encode((compact ? JSON.stringify(body) : JSON.stringify(body, null, 2)) + '\n') };
      if (curSha) payload.sha = curSha;
      const r = await this._fetch(this._contentsUrl(path), {
        method: 'PUT',
        headers: { ...this._headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (r.ok) {
        const res = await r.json();
        return { sha: res && res.content ? res.content.sha : null };
      }
      if (r.status === 409 || r.status === 422) {
        if (!merge) throw new Error(`GitHub write ${path} conflicted (${r.status}) and no merge was given`);
        if (attempt >= 3) throw new Error(`GitHub write ${path} failed after 3 attempts (${r.status})`);
        const fresh = await this.readJSON(path);
        curSha = fresh.sha;
        body = merge(fresh.data, body);
        continue;
      }
      throw new Error(`GitHub write ${path} failed: ${r.status}`);
    }
    throw new Error(`GitHub write ${path} failed after 3 attempts`);
  }

  async defaultBranch() {
    if (!this._refPromise) {
      this._refPromise = (async () => {
        const r = await this._fetch(this._url('').replace(/\/$/, ''), { headers: this._headers() });
        if (!r.ok) throw new Error(`GitHub repo lookup failed: ${r.status}`);
        return (await r.json()).default_branch;
      })().catch((e) => { this._refPromise = null; throw e; });
    }
    return this._refPromise;
  }

  async dispatch(workflow, inputs = {}) {
    const ref = await this.defaultBranch();
    const r = await this._fetch(this._url(`actions/workflows/${workflow}/dispatches`), {
      method: 'POST',
      headers: { ...this._headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref, inputs }),
    });
    if (!r.ok) throw new Error(`GitHub dispatch ${workflow} failed: ${r.status}`);
  }

  async waitForFile(path, sinceSha, { timeoutMs = 180000, intervalMs = 5000, sleep = defaultSleep, now = Date.now } = {}) {
    const start = now();
    for (;;) {
      const cur = await this.readJSON(path);
      if (cur.sha && cur.sha !== sinceSha) return cur;
      if (now() - start >= timeoutMs) throw new Error(`Timed out waiting for ${path}`);
      await sleep(intervalMs);
    }
  }
}

export class SwipeQueue {
  constructor({ storage, repo, device, debounceMs = 4000, autoFlush = true, retryMs = 30000, maxRetryMs = 300000, setTimer, clearTimer }) {
    this.storage = storage;
    this.repo = repo;
    this.device = device;
    this.debounceMs = debounceMs;
    this.autoFlush = autoFlush;
    this.retryMs = retryMs;
    this.maxRetryMs = maxRetryMs;
    this.failures = 0;
    this._set = setTimer || ((fn, ms) => setTimeout(fn, ms));
    this._clear = clearTimer || ((t) => clearTimeout(t));
    this.key = `finds.queue.${device}`;
    this.path = `data/swipes/${device}.json`;
    this.timer = null;
    this.flushing = null;
    this.queue = this._load();
  }

  _load() {
    try {
      const raw = this.storage.getItem(this.key);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  _save() {
    try {
      this.storage.setItem(this.key, JSON.stringify(this.queue));
    } catch {
      // storage unavailable: keep in memory
    }
  }

  size() {
    return this.queue.length;
  }

  add(swipe) {
    this.queue = this.queue.filter((s) => s.listing_id !== swipe.listing_id);
    this.queue.push(swipe);
    this._save();
    if (this.autoFlush) {
      this._arm(this.debounceMs);
    }
  }

  _backoff() {
    const steps = [this.retryMs, this.retryMs * 2, this.retryMs * 4, this.maxRetryMs];
    return steps[Math.min(this.failures, steps.length) - 1];
  }

  _arm(ms) {
    this._clear(this.timer);
    this.timer = this._set(() => this.flush().catch(() => {}), ms);
  }

  // Returns true when the write succeeded (or there was nothing to write), false when it failed.
  async flush() {
    if (this.flushing) return this.flushing;
    this.flushing = this._flush().then(
      (ok) => {
        this.flushing = null;
        if (ok) this.failures = 0;
        else this.failures++;
        if (this.autoFlush && this.queue.length) {
          // back off 30s, 60s, 120s, then cap at 300s; reset after any successful write
          this._arm(ok ? this.debounceMs : this._backoff());
        }
        return ok;
      },
      (e) => { this.flushing = null; throw e; },
    );
    return this.flushing;
  }

  async _flush() {
    this._clear(this.timer);
    const batch = this.queue.slice();
    if (!batch.length) return true;
    const asMap = (list) => Object.fromEntries(list.map((s) => [s.listing_id, s]));
    const merge = (remote, local) => mergeSwipes([remote || {}, local || {}]);
    try {
      const { data, sha } = await this.repo.readJSON(this.path);
      await this.repo.writeJSON(this.path, merge(data, asMap(batch)), `swipes from ${this.device}`, sha, merge, { compact: true });
    } catch {
      return false;
    }
    this.queue = this.queue.filter((s) => !batch.includes(s));
    this._save();
    return true;
  }
}
