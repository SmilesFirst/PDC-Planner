// Shared request handler for every list (tasks, contacts, notes).
//
//   GET    /api/<name>              -> everything (loads the starter data the first time)
//   POST   /api/<name>              -> save one or more items  { <listKey>: [...], by }
//   DELETE /api/<name>?id=...       -> delete an item
//   POST   /api/<name>?action=reset -> wipe the list and reload the starter data
//
// If PDC_PASSCODE is set, every request must send it in the x-passcode header.

const crypto = require('crypto');
const { available, kind, makeStore } = require('./_store');

const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max);

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

// clean(item, by, now) must return the sanitized item (including updatedAt/updatedBy) or throw.
function createHandler({ name, listKey, clean, seedItems }) {
  const store = makeStore(name);

  async function loadAll() {
    const first = await store.getAll();
    if (first.seeded) return first.items;
    if (await store.claimSeed()) {
      const now = new Date().toISOString();
      const starter = (seedItems || []).map((t) => ({ ...t, updatedAt: now, updatedBy: 'Starter plan' }));
      await store.setMany(starter);
      return starter;
    }
    return (await store.getAll()).items;
  }

  return async function handler(req, res) {
    try {
      if (!available()) return send(res, 503, { error: 'no_database' });

      const passcode = process.env.PDC_PASSCODE;
      if (passcode) {
        const given = req.headers['x-passcode'] || '';
        if (!given) return send(res, 401, { error: 'passcode_required' });
        if (!safeEqual(given, passcode)) return send(res, 401, { error: 'bad_passcode' });
      }

      const url = new URL(req.url, 'http://localhost');
      const meta = { storage: kind(), protected: !!passcode };

      if (req.method === 'GET') {
        return send(res, 200, { [listKey]: await loadAll(), meta });
      }

      if (req.method === 'POST' && url.searchParams.get('action') === 'reset') {
        await store.clear();
        return send(res, 200, { [listKey]: await loadAll(), meta });
      }

      if (req.method === 'POST') {
        const body = await readBody(req);
        const incoming = Array.isArray(body[listKey]) ? body[listKey] : [];
        if (!incoming.length) return send(res, 400, { error: 'Nothing was sent to save.' });
        if (incoming.length > 200) return send(res, 400, { error: 'Too many items in one save.' });

        const now = new Date().toISOString();
        let cleaned;
        try {
          cleaned = incoming.map((t) => ({ item: clean(t, body.by, now), base: t.base }));
        } catch (e) {
          return send(res, 400, { error: e.message });
        }

        // If someone saved this item after the editor opened it, don't overwrite their change.
        const checks = cleaned.filter((c) => c.base !== undefined && c.base !== null);
        const existing = await store.getMany(checks.map((c) => c.item.id));
        const conflicts = checks
          .filter((c) => existing[c.item.id] && existing[c.item.id].updatedAt !== c.base)
          .map((c) => existing[c.item.id]);
        if (conflicts.length) return send(res, 409, { error: 'conflict', conflicts });

        const saved = cleaned.map((c) => c.item);
        await store.setMany(saved);
        return send(res, 200, { ok: true, saved });
      }

      if (req.method === 'DELETE') {
        const id = url.searchParams.get('id') || '';
        if (!ID_RE.test(id)) return send(res, 400, { error: 'That id is invalid.' });
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
}

module.exports = { createHandler, str, ID_RE };
