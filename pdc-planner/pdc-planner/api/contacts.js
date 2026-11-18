const { createHandler, str, ID_RE } = require('./_crud');
const seed = require('../public/seed.json');

function clean(c, by, now) {
  if (!c || typeof c !== 'object') throw new Error('Contact is missing.');
  const id = str(c.id, 40);
  if (!ID_RE.test(id)) throw new Error('Contact id is invalid.');
  const party = str(c.party, 120);
  if (!party) throw new Error('Contact needs a name.');
  const source = str(c.source, 500);
  // Only web addresses are allowed, so a saved link can never run code.
  if (source && !/^https?:\/\/\S+$/i.test(source)) throw new Error('The source link must start with http:// or https://');
  return {
    id,
    party,
    role: str(c.role, 160),
    phone: str(c.phone, 120),
    email: str(c.email, 160),
    address: str(c.address, 240),
    notes: str(c.notes, 1000),
    source,
    updatedAt: now,
    updatedBy: str(by, 60) || 'Unknown',
  };
}

module.exports = createHandler({ name: 'contacts', listKey: 'contacts', clean, seedItems: seed.contacts });
