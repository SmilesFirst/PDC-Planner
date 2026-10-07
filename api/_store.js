// Storage layer for the planner.
//
// Production: Upstash Redis over its REST API (free tier, added from the Vercel
// Marketplace -> Storage tab). Vercel injects the URL/token env vars for you.
// Local dev:  set PDC_LOCAL_STORE=1 and tasks are kept in .data/tasks.json.
//
// Every task is its own field in one Redis hash, so two people editing
// different tasks never overwrite each other.

const fs = require('fs');
const path = require('path');

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY = process.env.PDC_KEY || 'pdc:tasks';
const LOCAL = !!process.env.PDC_LOCAL_STORE;
const LOCAL_FILE = path.join(process.cwd(), '.data', 'tasks.json');

function available() {
  return LOCAL || !!(URL_ && TOKEN);
}

function kind() {
  return LOCAL ? 'local-file' : 'upstash';
}

// ---------- Upstash ----------
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

// ---------- Local file ----------
function readLocal() {
  try {
    return JSON.parse(fs.readFileSync(LOCAL_FILE, 'utf8'));
  } catch {
    return {};
  }
}
function writeLocal(obj) {
  fs.mkdirSync(path.dirname(LOCAL_FILE), { recursive: true });
  fs.writeFileSync(LOCAL_FILE, JSON.stringify(obj, null, 1));
}

// ---------- Public API ----------
async function getAll() {
  if (LOCAL) {
    return Object.entries(readLocal())
      .filter(([k]) => !k.startsWith('_'))
      .map(([, v]) => v);
  }
  const flat = (await cmd(['HGETALL', KEY])) || [];
  const out = [];
  for (let i = 0; i < flat.length; i += 2) {
    if (String(flat[i]).startsWith('_')) continue;
    try {
      out.push(JSON.parse(flat[i + 1]));
    } catch {
      /* skip corrupt entry */
    }
  }
  return out;
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

async function setMany(tasks) {
  if (!tasks.length) return;
  if (LOCAL) {
    const all = readLocal();
    tasks.forEach((t) => (all[t.id] = t));
    writeLocal(all);
    return;
  }
  const args = ['HSET', KEY];
  tasks.forEach((t) => args.push(t.id, JSON.stringify(t)));
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

// Returns true only for the first caller, so the starter plan is loaded once.
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

module.exports = { available, kind, getAll, getMany, setMany, del, clear, claimSeed };
