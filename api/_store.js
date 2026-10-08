// Storage layer for the planner.
//
// Production: Upstash Redis over its REST API (free tier, added from the Vercel
// Storage tab). Vercel injects the URL/token env vars for you.
// Local dev:  set PDC_LOCAL_STORE=1 and data is kept in .data/<name>.json.
//
// Each list (tasks, contacts, notes) is one Redis hash where every item is its
// own field, so two people editing different items never overwrite each other.

const fs = require('fs');
const path = require('path');

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
// Default keys are pdc:tasks, pdc:contacts, pdc:notes. PDC_KEY (if set) must end in ":tasks".
const PREFIX = (process.env.PDC_KEY || 'pdc:tasks').replace(/:tasks$/, '');
const LOCAL = !!process.env.PDC_LOCAL_STORE;

function available() {
  return LOCAL || !!(URL_ && TOKEN);
}

function kind() {
  return LOCAL ? 'local-file' : 'upstash';
}

async function cmd(args) {
  const res = await fetch(URL_, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error(json.error || `Upstash error ${res.status}`);
  return json.result;
}

function makeStore(name) {
  const KEY = `${PREFIX}:${name}`;
  const FILE = path.join(process.cwd(), '.data', `${name}.json`);

  const readLocal = () => {
    try {
      return JSON.parse(fs.readFileSync(FILE, 'utf8'));
    } catch {
      return {};
    }
  };
  const writeLocal = (obj) => {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(obj, null, 1));
  };

  // One database call. Returns the items and whether the starter data was loaded already.
  async function getAll() {
    if (LOCAL) {
      const all = readLocal();
      return {
        items: Object.entries(all).filter(([k]) => !k.startsWith('_')).map(([, v]) => v),
        seeded: !!all._meta,
      };
    }
    const flat = (await cmd(['HGETALL', KEY])) || [];
    const items = [];
    let seeded = false;
    for (let i = 0; i < flat.length; i += 2) {
      if (String(flat[i]) === '_meta') { seeded = true; continue; }
      try {
        items.push(JSON.parse(flat[i + 1]));
      } catch {
        /* skip corrupt entry */
      }
    }
    return { items, seeded };
  }

  async function getMany(ids) {
    if (!ids.length) return {};
    if (LOCAL) {
      const all = readLocal();
      return Object.fromEntries(ids.filter((id) => all[id]).map((id) => [id, all[id]]));
    }
    const vals = (await cmd(['HMGET', KEY, ...ids])) || [];
    const out = {};
    ids.forEach((id, i) => {
      if (vals[i]) {
        try {
          out[id] = JSON.parse(vals[i]);
        } catch {
          /* ignore */
        }
      }
    });
    return out;
  }

  async function setMany(items) {
    if (!items.length) return;
    if (LOCAL) {
      const all = readLocal();
      items.forEach((t) => (all[t.id] = t));
      writeLocal(all);
      return;
    }
    const args = ['HSET', KEY];
    items.forEach((t) => args.push(t.id, JSON.stringify(t)));
    await cmd(args);
  }

  async function del(id) {
    if (LOCAL) {
      const all = readLocal();
      delete all[id];
      writeLocal(all);
      return;
    }
    await cmd(['HDEL', KEY, id]);
  }

  async function clear() {
    if (LOCAL) return writeLocal({});
    await cmd(['DEL', KEY]);
  }

  // True only for the first caller, so the starter data is loaded once.
  async function claimSeed() {
    if (LOCAL) {
      const all = readLocal();
      if (all._meta) return false;
      all._meta = { seededAt: new Date().toISOString() };
      writeLocal(all);
      return true;
    }
    const r = await cmd(['HSETNX', KEY, '_meta', JSON.stringify({ seededAt: new Date().toISOString() })]);
    return r === 1;
  }

  return { getAll, getMany, setMany, del, clear, claimSeed };
}

module.exports = { available, kind, makeStore };
