// Demo mode (?demo=1): reads the made-up sample in ui/demo/, keeps every write in localStorage.
const PREFIX = 'finds.demo.';

function lsGet(k) {
  try { return localStorage.getItem(k); } catch { return null; }
}
function lsSet(k, v) {
  try { localStorage.setItem(k, v); } catch { /* storage blocked: demo writes are lost on reload */ }
}

export class DemoRepo {
  constructor({ base = 'demo/' } = {}) {
    this.base = base;
    this.mem = {};
  }

  async readJSON(path) {
    const saved = this.mem[path] ?? lsGet(PREFIX + path);
    if (saved) return { data: JSON.parse(saved), sha: 'demo-local' };
    const r = await fetch(this.base + path.replace(/^data\//, ''), { cache: 'no-store' });
    if (r.status === 404) return { data: null, sha: null };
    if (!r.ok) throw new Error(`Demo read ${path} failed: ${r.status}`);
    return { data: await r.json(), sha: 'demo' };
  }

  async writeJSON(path, data) {
    const s = JSON.stringify(data);
    this.mem[path] = s;
    lsSet(PREFIX + path, s);
    return { sha: 'demo-local' };
  }

  async dispatch() {}

  async waitForFile(path) {
    await new Promise((r) => setTimeout(r, 1500));
    return this.readJSON(path);
  }
}
