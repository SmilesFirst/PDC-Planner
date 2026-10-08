const { createHandler, str, ID_RE } = require('./_crud');
const seed = require('../public/seed.json');

function clean(n, by, now) {
  if (!n || typeof n !== 'object') throw new Error('Note is missing.');
  const id = str(n.id, 40);
  if (!ID_RE.test(id)) throw new Error('Note id is invalid.');
  const title = str(n.title, 120);
  const body = str(n.body, 5000);
  if (!title && !body) throw new Error('Write something in the note first.');
  return {
    id,
    title,
    body,
    pinned: !!n.pinned,
    updatedAt: now,
    updatedBy: str(by, 60) || 'Unknown',
  };
}

module.exports = createHandler({ name: 'notes', listKey: 'notes', clean, seedItems: seed.notes || [] });
