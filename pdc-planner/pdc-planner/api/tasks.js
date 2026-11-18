const { createHandler, str, ID_RE } = require('./_crud');
const seed = require('../public/seed.json');

const STATUSES = ['Not Started', 'In Progress', 'Done', 'Blocked'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
  const owners = (Array.isArray(t.owners) ? t.owners : []).map((o) => str(o, 40)).filter(Boolean).slice(0, 8);
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

module.exports = createHandler({ name: 'tasks', listKey: 'tasks', clean, seedItems: seed.tasks });
