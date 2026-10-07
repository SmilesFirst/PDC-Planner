// GET    /api/tasks              -> all tasks (loads the starter plan the first time)
// POST   /api/tasks              -> save one or more tasks  { tasks: [...] }
// DELETE /api/tasks?id=t01       -> delete a task
// POST   /api/tasks?action=reset -> wipe everything and reload the starter plan
//
// If the PDC_PASSCODE env var is set, every request must send it in the
// x-passcode header (the app asks for it once and remembers it).

const crypto = require('crypto');
const store = require('./_store');
const seed = require('../public/seed.json');

const STATUSES = ['Not Started', 'In Progress', 'Done', 'Blocked'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

function send(res, code, body) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

async function readBody(req) {
  if (req.body !== undefined && req.body !== null) {
    return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max);

function clean(t, by, now) {
  if (!t || typeof t !== 'object') throw new Error('Task is missing.');
  const id = str(t.id, 40);
  if (!ID_RE.test(id)) throw new Error('Task id is invalid.');
  const title = str(t.title, 200);
  if (!title) throw new Error('Task needs a name.');
  if (!DATE_RE.test(t.start) || !DATE_RE.test(t.end)) throw new Error('Start and end dates are required.');
  if (t.end < t.start) throw new Error('End date cannot be before the start date.');
  const priority = Math.round(Number(t.priority));
  if (!(priority >= 1 && priority <= 5)) throw new Error('Priority must be 1 to 5.');
  const status = STATUSES.includes(t.status) ? t.status : 'Not Started';
  const owners = (Array.isArray(t.owners) ? t.owners : [])
    .map((o) => str(o, 40))
    .filter(Boolean)
    .slice(0, 8);
  return {
    id,
    title,
    phase: str(t.phase, 60) || 'General',
    owners: owners.length ? owners : ['Unassigned'],
    start: t.start,
    end: t.end,
    status,
    priority,
    source: str(t.source, 20),
    notes: str(t.notes, 1000),
    needsOwner: !!t.needsOwner,
    reference: !!t.reference,
    updatedAt: now,
    updatedBy: str(by, 60) || 'Unknown',
  };
}

async function loadAll() {
  if (await store.claimSeed()) {
    const now = new Date().toISOString();
    const starter = seed.tasks.map((t) => ({ ...t, updatedAt: now, updatedBy: 'Starter plan' }));
    await store.setMany(starter);
    return starter;
  }
  return store.getAll();
}

module.exports = async function handler(req, res) {
  try {
    if (!store.available()) return send(res, 503, { error: 'no_database' });

    const passcode = process.env.PDC_PASSCODE;
    if (passcode) {
      const given = req.headers['x-passcode'] || '';
      if (!given) return send(res, 401, { error: 'passcode_required' });
      if (!safeEqual(given, passcode)) return send(res, 401, { error: 'bad_passcode' });
    }

    const url = new URL(req.url, 'http://localhost');
    const meta = { storage: store.kind(), protected: !!passcode };

    if (req.method === 'GET') {
      return send(res, 200, { tasks: await loadAll(), meta });
    }

    if (req.method === 'POST' && url.searchParams.get('action') === 'reset') {
      await store.clear();
      return send(res, 200, { tasks: await loadAll(), meta });
    }

    if (req.method === 'POST') {
      const body = await readBody(req);
      const by = body.by;
      const incoming = Array.isArray(body.tasks) ? body.tasks : [];
      if (!incoming.length) return send(res, 400, { error: 'No tasks sent.' });
      if (incoming.length > 200) return send(res, 400, { error: 'Too many tasks in one save.' });

      const now = new Date().toISOString();
      let cleaned;
      try {
        cleaned = incoming.map((t) => ({ task: clean(t, by, now), base: t.base }));
      } catch (e) {
        return send(res, 400, { error: e.message });
      }

      // Conflict check: if someone saved this task after the editor opened it, don't overwrite.
      const checks = cleaned.filter((c) => c.base !== undefined && c.base !== null);
      const existing = await store.getMany(checks.map((c) => c.task.id));
      const conflicts = checks
        .filter((c) => existing[c.task.id] && existing[c.task.id].updatedAt !== c.base)
        .map((c) => existing[c.task.id]);
      if (conflicts.length) return send(res, 409, { error: 'conflict', conflicts });

      const saved = cleaned.map((c) => c.task);
      await store.setMany(saved);
      return send(res, 200, { ok: true, saved });
    }

    if (req.method === 'DELETE') {
      const id = url.searchParams.get('id') || '';
      if (!ID_RE.test(id)) return send(res, 400, { error: 'Task id is invalid.' });
      await store.del(id);
      return send(res, 200, { ok: true });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return send(res, 405, { error: 'Method not allowed.' });
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: 'Server error. Check the function logs in Vercel.' });
  }
};
