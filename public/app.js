(() => {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Constants
   * ------------------------------------------------------------------ */
  const DAY_MS = 86400000;
  const ZOOM_PX = { month: 2.4, week: 6, day: 18 };
  const PRIORITY_NAMES = { 1: 'Low', 2: 'Minor', 3: 'Normal', 4: 'High', 5: 'Critical' };
  const STATUSES = ['Not Started', 'In Progress', 'Done', 'Blocked'];
  const DEPT_ORDER = ['Management', 'Exhibits Team', 'Marketing', 'Design', 'Logistics', 'Admin', 'Sales', 'Vendors'];
  const PHASE_ORDER = ['Planning', 'Booth', 'Marketing & Printing', 'Logistics', 'Staff', 'Event', 'Post-Event', 'External Deadline'];
  const REF_GROUP = 'PDC organizer dates';
  const ALL_GROUP = 'All teams';
  const LS = {
    name: 'pdc.name',
    pass: 'pdc.passcode',
    local: 'pdc.local.tasks',
    banner: 'pdc.banner.dismissed',
  };

  /* ------------------------------------------------------------------ *
   * State
   * ------------------------------------------------------------------ */
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  };

  const S = {
    tasks: [],
    mode: 'shared', // 'shared' | 'local'
    meta: {},
    seedEvent: { name: 'PDC 2026', anchorTaskId: 't41' },
    filters: { dept: 'All', status: 'all', minPriority: 0, q: '', hideRef: false },
    view: 'timeline',
    group: 'department',
    zoom: 'week',
    collapsed: new Set(),
    name: store.get(LS.name) || '',
    passcode: store.get(LS.pass) || '',
    lastSync: null,
    drawerOpen: false,
    saving: 0,
    needFocus: true,
  };

  /* ------------------------------------------------------------------ *
   * Small helpers
   * ------------------------------------------------------------------ */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const toDay = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    return Math.floor(Date.UTC(y, m - 1, d) / DAY_MS);
  };
  const toIso = (day) => new Date(day * DAY_MS).toISOString().slice(0, 10);
  const todayDay = (() => {
    const n = new Date();
    return Math.floor(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()) / DAY_MS);
  })();
  const fmt = (day, withYear) =>
    new Date(day * DAY_MS).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: withYear ? 'numeric' : undefined, timeZone: 'UTC' });
  const fmtRange = (s, e, withYear) => {
    if (s === e) return fmt(s, withYear);
    const a = new Date(s * DAY_MS), b = new Date(e * DAY_MS);
    if (a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth()) {
      return `${fmt(s, false)}\u2013${b.getUTCDate()}${withYear ? ', ' + b.getUTCFullYear() : ''}`;
    }
    return `${fmt(s, withYear)} \u2013 ${fmt(e, withYear)}`;
  };
  const mondayOf = (day) => day - ((new Date(day * DAY_MS).getUTCDay() + 6) % 7);

  const span = (n) => {
    n = Math.abs(n);
    if (n < 14) return `${n} day${n === 1 ? '' : 's'}`;
    if (n < 60) return `${Math.round(n / 7)} weeks`;
    const m = Math.round(n / 30.4);
    return m < 24 ? `${m} months` : `${(m / 12).toFixed(1).replace('.0', '')} years`;
  };

  const startDay = (t) => toDay(t.start);
  const endDay = (t) => toDay(t.end);
  const isDone = (t) => t.status === 'Done';
  const isOverdue = (t) => !t.reference && !isDone(t) && endDay(t) < todayDay;
  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-');

  function dueInfo(t) {
    if (t.reference) return { text: 'Set by organizer', over: false };
    if (isDone(t)) return { text: 'Done', over: false };
    const diff = endDay(t) - todayDay;
    if (diff < 0) return { text: `Overdue by ${span(diff)}`, over: true };
    if (diff === 0) return { text: 'Due today', over: false };
    if (diff === 1) return { text: 'Due tomorrow', over: false };
    return { text: `Due in ${span(diff)}`, over: false };
  }

  function toast(msg, kind) {
    const el = document.createElement('div');
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), kind === 'err' ? 7000 : 4200);
  }

  /* ------------------------------------------------------------------ *
   * Dialog helper (native <dialog>)
   * ------------------------------------------------------------------ */
  function dialog(html, onOpen) {
    return new Promise((resolve) => {
      const d = $('#dlg');
      d.innerHTML = html;
      d.returnValue = '';
      const onClose = () => {
        d.removeEventListener('close', onClose);
        const form = d.querySelector('form');
        resolve({ action: d.returnValue || 'cancel', data: form ? new FormData(form) : new FormData() });
      };
      d.addEventListener('close', onClose);
      d.showModal();
      if (onOpen) onOpen(d);
      const first = d.querySelector('input:not([type=hidden]), select, textarea');
      if (first) first.focus();
    });
  }

  async function ensureName() {
    if (S.name) return true;
    const r = await dialog(`
      <form method="dialog">
        <h2>Who's editing?</h2>
        <p>Your name is saved with each change so teammates can see who updated a task.</p>
        <input type="text" name="name" required maxlength="60" placeholder="Your name" autocomplete="name">
        <div class="acts">
          <button class="btn" value="cancel" formnovalidate>Cancel</button>
          <button class="btn primary" value="ok">Continue</button>
        </div>
      </form>`);
    if (r.action !== 'ok') return false;
    S.name = String(r.data.get('name') || '').trim();
    if (!S.name) return false;
    store.set(LS.name, S.name);
    renderTop();
    return true;
  }

  async function askPasscode(wrong) {
    const r = await dialog(`
      <form method="dialog">
        <h2>Enter the team passcode</h2>
        <p>${wrong ? 'That passcode did not match. Try again.' : 'This planner is protected. Ask the planner owner for the passcode.'}</p>
        <input type="password" name="pass" required autocomplete="current-password" placeholder="Passcode">
        <div class="acts"><button class="btn primary" value="ok">Open planner</button></div>
      </form>`);
    if (r.action !== 'ok') return false;
    S.passcode = String(r.data.get('pass') || '');
    store.set(LS.pass, S.passcode);
    return true;
  }

  async function confirmDialog(title, text, confirmLabel) {
    const r = await dialog(`
      <form method="dialog">
        <h2>${esc(title)}</h2>
        <p>${esc(text)}</p>
        <div class="acts">
          <button class="btn" value="cancel">Cancel</button>
          <button class="btn danger" value="ok">${esc(confirmLabel)}</button>
        </div>
      </form>`);
    return r.action === 'ok';
  }

  /* ------------------------------------------------------------------ *
   * Data access
   * ------------------------------------------------------------------ */
  async function api(method, query, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (S.passcode) headers['x-passcode'] = S.passcode;
    const res = await fetch('/api/tasks' + (query || ''), { method, headers, body: body ? JSON.stringify(body) : undefined });
    let data = null;
    try { data = await res.json(); } catch { /* not JSON */ }
    return { status: res.status, data };
  }

  async function apiWithAuth(method, query, body) {
    let r = await api(method, query, body);
    let wrong = false;
    while (r.status === 401) {
      if (!(await askPasscode(wrong))) return r;
      wrong = true;
      r = await api(method, query, body);
    }
    return r;
  }

  async function loadSeedFile() {
    const res = await fetch('/seed.json');
    if (!res.ok) throw new Error('seed missing');
    return res.json();
  }

  function readLocal() {
    try { return JSON.parse(store.get(LS.local) || 'null'); } catch { return null; }
  }
  function writeLocal() {
    store.set(LS.local, JSON.stringify(S.tasks));
  }

  async function loadTasks(initial) {
    try {
      const r = await apiWithAuth('GET');
      if (r.status === 200 && r.data && Array.isArray(r.data.tasks)) {
        S.mode = 'shared';
        S.meta = r.data.meta || {};
        S.tasks = r.data.tasks;
        S.lastSync = new Date();
        return true;
      }
      if (!initial) return false;
      throw new Error('no api');
    } catch (e) {
      if (!initial) return false;
      S.mode = 'local';
      const saved = readLocal();
      if (saved && saved.length) {
        S.tasks = saved;
      } else {
        const seed = await loadSeedFile();
        const now = new Date().toISOString();
        S.tasks = seed.tasks.map((t) => ({ ...t, updatedAt: now, updatedBy: 'Starter plan' }));
        writeLocal();
      }
      return true;
    }
  }

  // Save full task objects. Applies the change on screen first, then syncs.
  async function persist(list) {
    if (!(await ensureName())) return false;
    const now = new Date().toISOString();
    const prev = {};
    list.forEach((t) => {
      const old = S.tasks.find((x) => x.id === t.id);
      prev[t.id] = old ? old.updatedAt : undefined;
      const next = { ...t, updatedAt: now, updatedBy: S.name };
      if (old) Object.assign(old, next); else S.tasks.push(next);
    });
    render();

    if (S.mode === 'local') {
      writeLocal();
      return true;
    }

    S.saving++;
    try {
      const payload = list.map((t) => ({ ...t, base: prev[t.id] }));
      const r = await apiWithAuth('POST', '', { by: S.name, tasks: payload });
      if (r.status === 200) {
        r.data.saved.forEach((s) => {
          const i = S.tasks.findIndex((x) => x.id === s.id);
          if (i >= 0) S.tasks[i] = s;
        });
        S.lastSync = new Date();
        return true;
      }
      if (r.status === 409) {
        r.data.conflicts.forEach((c) => {
          const i = S.tasks.findIndex((x) => x.id === c.id);
          if (i >= 0) S.tasks[i] = c;
          toast(`${c.updatedBy} changed "${c.title}" a moment ago, so their version is showing. Make your edit again if you still need it.`, 'warn');
        });
        return false;
      }
      toast((r.data && r.data.error) || 'That change could not be saved.', 'err');
      await loadTasks(false);
      return false;
    } catch {
      toast('Could not reach the server, so that change was not saved. Check your connection and try again.', 'err');
      await loadTasks(false);
      return false;
    } finally {
      S.saving--;
      render();
    }
  }

  async function removeTask(id) {
    if (!(await ensureName())) return false;
    const idx = S.tasks.findIndex((t) => t.id === id);
    if (idx < 0) return false;
    const [gone] = S.tasks.splice(idx, 1);
    render();
    if (S.mode === 'local') { writeLocal(); return true; }
    try {
      const r = await apiWithAuth('DELETE', '?id=' + encodeURIComponent(id));
      if (r.status !== 200) throw new Error();
      return true;
    } catch {
      S.tasks.push(gone);
      toast('Could not delete that task. Nothing was changed.', 'err');
      render();
      return false;
    }
  }

  /* ------------------------------------------------------------------ *
   * Filtering and grouping
   * ------------------------------------------------------------------ */
  function deptList() {
    const set = new Set();
    S.tasks.forEach((t) => t.owners.forEach((o) => { if (o !== 'All Teams' && o !== 'PDC Organizer') set.add(o); }));
    const known = DEPT_ORDER.filter((d) => set.has(d));
    const rest = [...set].filter((d) => !DEPT_ORDER.includes(d)).sort();
    return [...known, ...rest];
  }

  function inDept(t, d) {
    if (d === '__ref') return !!t.reference;
    if (t.reference) return !S.filters.hideRef;
    if (d === 'All') return true;
    return t.owners.includes(d) || t.owners.includes('All Teams');
  }

  function deptScope(d) {
    return S.tasks.filter((t) => inDept(t, d));
  }

  function visibleTasks() {
    const f = S.filters;
    const q = f.q.trim().toLowerCase();
    return deptScope(f.dept).filter((t) => {
      if (f.status === 'open' && (isDone(t) || t.reference)) return false;
      if (f.status === 'overdue' && !isOverdue(t)) return false;
      if (STATUSES.includes(f.status) && (t.reference || t.status !== f.status)) return false;
      if (f.minPriority && t.priority < f.minPriority) return false;
      if (q) {
        const hay = `${t.title} ${t.notes} ${t.phase} ${t.owners.join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  const byDate = (a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end) || a.id.localeCompare(b.id);

  function groupTasks(list) {
    let mode = S.group;
    if (mode === 'department' && S.filters.dept !== 'All') mode = 'none';
    if (mode === 'none') return [{ key: '', label: '', tasks: [...list].sort(byDate) }];

    const groups = new Map();
    const add = (key, t) => { if (!groups.has(key)) groups.set(key, []); groups.get(key).push(t); };

    list.forEach((t) => {
      if (mode === 'phase') return add(t.phase || 'General', t);
      if (t.reference) return add(REF_GROUP, t);
      if (t.owners.includes('All Teams')) return add(ALL_GROUP, t);
      t.owners.forEach((o) => add(o, t));
    });

    const order = mode === 'phase'
      ? [...PHASE_ORDER, ...[...groups.keys()].filter((k) => !PHASE_ORDER.includes(k)).sort()]
      : [...deptList(), ...[...groups.keys()].filter((k) => !deptList().includes(k) && k !== ALL_GROUP && k !== REF_GROUP).sort(), ALL_GROUP, REF_GROUP];

    return order.filter((k) => groups.has(k)).map((k) => ({ key: mode + ':' + k, label: k, tasks: groups.get(k).sort(byDate) }));
  }

  /* ------------------------------------------------------------------ *
   * Rendering: chrome
   * ------------------------------------------------------------------ */
  function anchorTask() {
    return S.tasks.find((t) => t.id === S.seedEvent.anchorTaskId) || S.tasks.find((t) => t.phase === 'Event');
  }

  function renderTop() {
    const a = anchorTask();
    $('#eventLine').textContent = a
      ? `${S.seedEvent.name || 'PDC'} live ${fmtRange(startDay(a), endDay(a), true)}. Plan has ${S.tasks.length} tasks.`
      : `${S.tasks.length} tasks`;
    const btn = $('#btnName');
    btn.textContent = S.name ? `Editing as ${S.name}` : 'Set your name';
    btn.title = 'Change the name saved with your edits';
    const sync = $('#syncStatus');
    sync.textContent = S.mode === 'local'
      ? 'Saved in this browser only'
      : S.lastSync ? `Shared plan, synced ${S.lastSync.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : '';
  }

  function renderBanners() {
    const parts = [];
    if (S.mode === 'local') {
      parts.push(`<div class="banner"><span><strong>Preview mode.</strong> Changes stay in this browser. Connect the free database (steps in the README) so every department shares one plan.</span></div>`);
    }
    const open = S.tasks.filter((t) => !t.reference);
    const stale = open.length && open.filter(isOverdue).length / open.length >= 0.5;
    if (stale && sessionStorage.getItem(LS.banner) !== '1') {
      parts.push(`<div class="banner info"><span>Most dates in this plan are in the past. To reuse it for the next event, shift every date at once.</span>
        <button class="btn" data-act="rebase" type="button">Shift dates</button>
        <button class="btn link" data-act="dismiss-banner" type="button">Not now</button></div>`);
    }
    $('#banners').innerHTML = parts.join('');
  }

  function renderRail() {
    const depts = deptList();
    const items = [{ key: 'All', label: 'All departments' }, ...depts.map((d) => ({ key: d, label: d }))];
    if (S.tasks.some((t) => t.reference)) items.push({ key: '__ref', label: 'PDC organizer dates' });
    $('#rail').innerHTML = '<h2>Departments</h2>' + items.map((it) => {
      const scope = deptScope(it.key).filter((t) => !t.reference);
      const done = scope.filter(isDone).length;
      const over = scope.filter(isOverdue).length;
      const total = it.key === '__ref' ? S.tasks.filter((t) => t.reference).length : scope.length;
      const pct = scope.length ? Math.round((done / scope.length) * 100) : 0;
      return `<button type="button" data-dept="${esc(it.key)}" aria-current="${S.filters.dept === it.key}">
        <span class="name">${esc(it.label)}</span><span class="count">${total}</span>
        ${it.key === '__ref' ? '' : `<span class="mini" aria-hidden="true"><i style="width:${pct}%"></i></span>`}
        ${over && it.key !== '__ref' ? `<span class="od">${over} overdue</span>` : ''}
      </button>`;
    }).join('');
  }

  function syncControls() {
    $$('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === S.view)));
    $$('[data-zoom]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.zoom === S.zoom)));
    $('#zoomSeg').hidden = S.view !== 'timeline';
    $('#selGroup').value = S.group;
    $('#selStatus').value = S.filters.status;
    $('#selPriority').value = String(S.filters.minPriority);
    $('#chkRef').checked = S.filters.hideRef;
    if (document.activeElement !== $('#inpSearch')) $('#inpSearch').value = S.filters.q;
  }

  function renderStats() {
    const scope = deptScope(S.filters.dept).filter((t) => !t.reference);
    const n = scope.length || 1;
    const done = scope.filter(isDone).length;
    const prog = scope.filter((t) => t.status === 'In Progress').length;
    const block = scope.filter((t) => t.status === 'Blocked').length;
    const over = scope.filter(isOverdue).length;
    const needs = scope.filter((t) => t.needsOwner).length;
    $('#stats').innerHTML = `
      <div class="meter" role="img" aria-label="${done} of ${scope.length} done">
        <i class="m-done" style="width:${(done / n) * 100}%"></i><i class="m-prog" style="width:${(prog / n) * 100}%"></i><i class="m-block" style="width:${(block / n) * 100}%"></i>
      </div>
      <span><b>${done}</b> of ${scope.length} done</span>
      <span><b>${prog}</b> in progress</span>
      <span><b>${block}</b> blocked</span>
      <span class="od"><b>${over}</b> overdue</span>
      ${needs ? `<span><b>${needs}</b> need an owner confirmed</span>` : ''}`;
    $('#legend').innerHTML = S.view === 'timeline'
      ? `<span class="sw"><strong>Priority</strong></span>${[5, 4, 3, 2, 1].map((p) => `<span class="sw"><i style="background:var(--p${p})"></i>${p} ${PRIORITY_NAMES[p]}</span>`).join('')}
         <span class="sw">Striped bar: in progress</span><span class="sw">Faded bar: done</span><span class="sw">Red outline: blocked</span><span class="sw">Diamond: single-day deadline</span>`
      : '';
  }

  /* ------------------------------------------------------------------ *
   * Rendering: board
   * ------------------------------------------------------------------ */
  function ownerChips(t) {
    const chips = t.owners.map((o) => `<span class="chip">${esc(o)}</span>`).join('');
    return chips + (t.needsOwner ? '<span class="chip warn">Owner to confirm</span>' : '');
  }

  function renderBoard() {
    const list = visibleTasks();
    const board = $('#board');
    const prev = $('.scroller', board);
    const keep = prev ? { l: prev.scrollLeft, t: prev.scrollTop } : null;

    if (!list.length) {
      board.innerHTML = `<div class="empty"><h3>No tasks match these filters</h3><p>Clear the search or status filter, or add a task for this team.</p></div>`;
      return;
    }
    board.innerHTML = S.view === 'list' ? listHtml(list) : timelineHtml(list);

    const sc = $('.scroller', board);
    if (S.view === 'timeline' && sc) {
      if (S.needFocus || !keep) {
        const ax = axis();
        const vis = list.filter((t) => !t.reference);
        const firstOpen = vis.filter((t) => !isDone(t)).sort(byDate)[0] || vis.sort(byDate)[0];
        let target;
        if (todayDay >= ax.start && todayDay <= ax.end) target = todayDay - 10;
        else if (firstOpen) target = startDay(firstOpen) - 7;
        else target = ax.start;
        sc.scrollLeft = Math.max(0, (target - ax.start) * ax.px);
        S.needFocus = false;
      } else {
        sc.scrollLeft = keep.l;
        sc.scrollTop = keep.t;
      }
    } else if (sc && keep) {
      sc.scrollTop = keep.t;
    }
  }

  function axis() {
    let min = Infinity, max = -Infinity;
    S.tasks.forEach((t) => { min = Math.min(min, startDay(t)); max = Math.max(max, endDay(t)); });
    if (!isFinite(min)) { min = todayDay; max = todayDay + 60; }
    const start = mondayOf(min - 3);
    const end = max + 21;
    return { start, end, days: end - start + 1, px: ZOOM_PX[S.zoom] };
  }

  function headerHtml(ax) {
    const W = ax.days * ax.px;
    let months = '';
    let cur = ax.start;
    while (cur <= ax.end) {
      const d = new Date(cur * DAY_MS);
      const next = Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / DAY_MS);
      const segEnd = Math.min(next - 1, ax.end);
      const w = (segEnd - cur + 1) * ax.px;
      const label = w >= 64 ? d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
        : w >= 26 ? d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }) : '';
      months += `<div class="mo" style="left:${(cur - ax.start) * ax.px}px;width:${w}px">${label}</div>`;
      cur = segEnd + 1;
    }

    let ticks = '';
    if (ax.px >= 14) {
      for (let d = ax.start; d <= ax.end; d++) {
        const dow = new Date(d * DAY_MS).getUTCDay();
        const cls = (dow === 0 || dow === 6 ? ' we' : '') + (d === todayDay ? ' is-today' : '');
        ticks += `<div class="tk${cls}" style="left:${(d - ax.start) * ax.px}px;width:${ax.px}px">${new Date(d * DAY_MS).getUTCDate()}</div>`;
      }
    } else if (ax.px >= 4) {
      for (let d = ax.start; d <= ax.end; d += 7) {
        const wk = 7 * ax.px;
        const label = wk >= 36 ? fmt(d, false) : new Date(d * DAY_MS).getUTCDate();
        const cls = todayDay >= d && todayDay < d + 7 ? ' is-today' : '';
        ticks += `<div class="tk${cls}" style="left:${(d - ax.start) * ax.px}px;width:${wk}px">${label}</div>`;
      }
    }

    const a = anchorTask();
    let chip = '';
    if (a) {
      const l = (startDay(a) - ax.start) * ax.px;
      const w = (endDay(a) - startDay(a) + 1) * ax.px;
      chip = `<div class="evt-chip" style="left:${l}px;width:${w}px" title="${esc(a.title)}">PDC live</div>`;
    }
    return `<div class="tl-head"><div class="tl-corner">Task</div>
      <div class="tl-axis" style="width:${W}px"><div class="months">${months}</div><div class="ticks">${ticks}</div>${chip}</div></div>`;
  }

  function timelineHtml(list) {
    const ax = axis();
    const W = ax.days * ax.px;
    const grid = `background-image:repeating-linear-gradient(to right,var(--grid) 0 1px,transparent 1px ${7 * ax.px}px)`;
    const groups = groupTasks(list);
    let rows = '';

    groups.forEach((g) => {
      const open = !S.collapsed.has(g.key);
      if (g.label) {
        const done = g.tasks.filter((t) => isDone(t)).length;
        rows += `<div class="grow-row"><div class="cell-label"><button class="gtoggle" type="button" data-act="collapse" data-key="${esc(g.key)}" aria-expanded="${open}">
          <span class="car">\u25BE</span>${esc(g.label)}<small>${g.tasks.length} task${g.tasks.length === 1 ? '' : 's'}${g.label === REF_GROUP ? '' : `, ${done} done`}</small></button></div>
          <div class="cell-time" style="width:${W}px"></div></div>`;
      }
      if (!open) return;
      g.tasks.forEach((t) => { rows += rowHtml(t, ax, W, grid); });
    });

    const overlays = [];
    const a = anchorTask();
    if (a) overlays.push(`<div class="event-band" style="left:calc(var(--label-w) + ${(startDay(a) - ax.start) * ax.px}px);width:${(endDay(a) - startDay(a) + 1) * ax.px}px"></div>`);
    if (todayDay >= ax.start && todayDay <= ax.end) overlays.push(`<div class="today-line" title="Today" style="left:calc(var(--label-w) + ${(todayDay - ax.start) * ax.px + ax.px / 2 - 1}px)"></div>`);

    return `<div class="scroller"><div class="tl" style="width:calc(var(--label-w) + ${W}px)">${headerHtml(ax)}<div class="tl-body">${overlays.join('')}${rows}</div></div></div>`;
  }

  function rowHtml(t, ax, W, grid) {
    const s = startDay(t), e = endDay(t);
    const ms = s === e;
    const left = (s - ax.start) * ax.px;
    const width = Math.max((e - s + 1) * ax.px, 10);
    const due = dueInfo(t);
    const cls = ['bar', 'p' + t.priority];
    if (t.status === 'In Progress') cls.push('st-progress');
    if (t.status === 'Done') cls.push('st-done');
    if (t.status === 'Blocked') cls.push('st-blocked');
    if (t.reference) cls.push('ref');
    if (ms) cls.push('ms');
    const icon = t.status === 'Done' ? '\u2713 ' : t.status === 'Blocked' ? '! ' : '';
    const inner = !ms && width >= 30 ? (t.reference ? '' : `${icon}${t.priority}`) : '';
    const barStyle = ms ? `left:${left + ax.px / 2 - 7}px` : `left:${left}px;width:${width}px`;
    const label = `${t.title}, ${fmtRange(s, e, true)}, ${t.reference ? 'organizer date' : 'priority ' + t.priority + ', ' + t.status}`;
    const dueLeft = (ms ? left + ax.px / 2 + 14 : left + width + 8);
    const check = t.reference
      ? '<span class="chk-spacer"></span>'
      : `<button class="chk${isDone(t) ? ' on' : ''}" type="button" data-act="toggle" aria-label="${isDone(t) ? 'Mark not done' : 'Mark done'}: ${esc(t.title)}">${isDone(t) ? '\u2713' : ''}</button>`;
    return `<div class="row${isDone(t) ? ' is-done' : ''}${t.reference ? ' is-ref' : ''}" data-id="${esc(t.id)}">
      <div class="cell-label">${check}
        <div class="lab"><button class="t" type="button" data-act="open" title="${esc(t.title)}">${esc(t.title)}</button>
        <div class="m">${ownerChips(t)}<span class="due-lbl${due.over ? ' over' : ''}">${esc(due.text)}</span></div></div></div>
      <div class="cell-time" style="width:${W}px;${grid}">
        <button class="${cls.join(' ')}" type="button" data-act="open" style="${barStyle}" aria-label="${esc(label)}" title="${esc(t.title)}\n${esc(fmtRange(s, e, true))}">${inner}</button>
        <span class="due-txt${due.over ? ' over' : ''}" style="left:${dueLeft}px">${esc(fmt(e, false))}</span>
      </div></div>`;
  }

  function listHtml(list) {
    const open = list.filter((t) => !t.reference && !isDone(t));
    const sections = [
      { label: 'Overdue', cls: 'over', items: open.filter((t) => endDay(t) < todayDay) },
      { label: 'Due in the next 7 days', items: open.filter((t) => endDay(t) >= todayDay && endDay(t) < todayDay + 7) },
      { label: 'Due in the next 30 days', items: open.filter((t) => endDay(t) >= todayDay + 7 && endDay(t) < todayDay + 30) },
      { label: 'Due later', items: open.filter((t) => endDay(t) >= todayDay + 30) },
      { label: 'Done', items: list.filter(isDone) },
      { label: 'PDC organizer dates', items: list.filter((t) => t.reference) },
    ];
    const html = sections.filter((s) => s.items.length).map((s) => `
      <div class="list-sec"><h3 class="${s.cls || ''}">${esc(s.label)}<small>${s.items.length}</small></h3>
      ${s.items.sort((a, b) => a.end.localeCompare(b.end) || b.priority - a.priority).map(liHtml).join('')}</div>`).join('');
    return `<div class="scroller"><div class="list-wrap">${html}</div></div>`;
  }

  function liHtml(t) {
    const due = dueInfo(t);
    const check = t.reference
      ? '<span class="chk-spacer"></span>'
      : `<button class="chk${isDone(t) ? ' on' : ''}" type="button" data-act="toggle" aria-label="${isDone(t) ? 'Mark not done' : 'Mark done'}: ${esc(t.title)}">${isDone(t) ? '\u2713' : ''}</button>`;
    return `<div class="li${isDone(t) ? ' is-done' : ''}" data-id="${esc(t.id)}">
      ${check}
      <div><button class="t" type="button" data-act="open">${esc(t.title)}</button><div class="m">${ownerChips(t)}<span class="chip">${esc(t.phase)}</span></div></div>
      <div class="due${due.over ? ' over' : ''}"><b>${esc(due.text)}</b>${esc(fmtRange(startDay(t), endDay(t), true))}</div>
      ${t.reference ? '<span></span>' : `<span class="pri p${t.priority}" title="Priority ${t.priority}: ${PRIORITY_NAMES[t.priority]}">${t.priority}</span>`}
      ${t.reference ? '<span></span>' : `<select data-act="status" aria-label="Status for ${esc(t.title)}">${STATUSES.map((s) => `<option${s === t.status ? ' selected' : ''}>${s}</option>`).join('')}</select>`}
    </div>`;
  }

  function renderFoot() {
    const who = S.tasks.length ? [...S.tasks].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))[0] : null;
    $('#foot').textContent = who && who.updatedBy && who.updatedBy !== 'Starter plan'
      ? `Last change: ${who.updatedBy} updated "${who.title}".` : '';
  }

  function render() {
    renderTop();
    renderBanners();
    renderRail();
    syncControls();
    renderStats();
    renderBoard();
    renderFoot();
    writeHash();
  }

  /* ------------------------------------------------------------------ *
   * Drawer (edit / add)
   * ------------------------------------------------------------------ */
  function openDrawer(task) {
    const isNew = !task;
    const base = task || {
      id: 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      title: '',
      phase: '',
      owners: S.filters.dept !== 'All' && S.filters.dept !== '__ref' ? [S.filters.dept] : [],
      start: toIso(todayDay), end: toIso(todayDay),
      status: 'Not Started', priority: 3, source: '', notes: '', needsOwner: false, reference: false,
    };
    const depts = [...new Set([...deptList(), 'All Teams', ...base.owners])];
    const phases = [...new Set([...PHASE_ORDER, ...S.tasks.map((t) => t.phase)])];

    const d = $('#drawer');
    d.innerHTML = `<form novalidate>
      <div class="dr-head"><div><h2 id="drawerTitle">${isNew ? 'Add a task' : 'Edit task'}</h2>
        <p>${isNew ? 'It will appear for everyone on the plan.' : `Last changed by ${esc(task.updatedBy || 'unknown')}${task.updatedAt ? ' on ' + esc(new Date(task.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })) : ''}`}</p></div>
        <button class="dr-x" type="button" data-act="close" aria-label="Close">\u00D7</button></div>
      <div class="dr-body">
        <div class="fld"><label for="fTitle">Task</label><input id="fTitle" name="title" type="text" maxlength="200" value="${esc(base.title)}" required></div>
        <fieldset class="fld"><legend>Who owns it</legend>
          <div class="pills" id="ownerPills">${depts.map((o) => `<label><input type="checkbox" name="owner" value="${esc(o)}"${base.owners.includes(o) ? ' checked' : ''}><span>${esc(o)}</span></label>`).join('')}</div>
          <div class="addteam"><input type="text" id="newTeam" placeholder="Another team or person" maxlength="40" aria-label="Add another team"><button class="btn" type="button" data-act="add-team">Add</button></div>
        </fieldset>
        <div class="two">
          <div class="fld"><label for="fStart">Starts</label><input id="fStart" name="start" type="date" value="${esc(base.start)}" required></div>
          <div class="fld"><label for="fEnd">Due</label><input id="fEnd" name="end" type="date" value="${esc(base.end)}" required></div>
        </div>
        <fieldset class="fld"><legend>Status</legend><div class="pills">${STATUSES.map((s) => `<label><input type="radio" name="status" value="${s}"${base.status === s ? ' checked' : ''}><span>${s}</span></label>`).join('')}</div></fieldset>
        <fieldset class="fld"><legend>Priority</legend><div class="pills pri-pills">${[1, 2, 3, 4, 5].map((p) => `<label><input type="radio" name="priority" value="${p}"${Number(base.priority) === p ? ' checked' : ''}><span>${p}<small>${PRIORITY_NAMES[p]}</small></span></label>`).join('')}</div>
          <span class="hint">5 is for deadlines with real consequences, like payments, shipping and move-in.</span></fieldset>
        <div class="fld"><label for="fPhase">Phase</label><input id="fPhase" name="phase" type="text" list="phaseList" maxlength="60" value="${esc(base.phase)}" placeholder="Booth, Marketing & Printing, Staff"><datalist id="phaseList">${phases.map((p) => `<option value="${esc(p)}">`).join('')}</datalist></div>
        <div class="fld"><label for="fNotes">Notes</label><textarea id="fNotes" name="notes" maxlength="1000">${esc(base.notes)}</textarea></div>
        <div class="fld">
          <label class="check"><input type="checkbox" name="needsOwner"${base.needsOwner ? ' checked' : ''}> Owner still needs to be confirmed</label>
          <label class="check"><input type="checkbox" name="reference"${base.reference ? ' checked' : ''}> This date is set by the PDC organizer (reference only)</label>
        </div>
        <div class="errmsg" id="drErr" role="alert"></div>
      </div>
      <div class="dr-foot">
        <button class="btn primary" type="submit">${isNew ? 'Add task' : 'Save changes'}</button>
        <button class="btn" type="button" data-act="close">Cancel</button>
        <span class="sp"></span>
        ${isNew ? '' : '<button class="btn danger" type="button" data-act="delete">Delete</button>'}
      </div></form>`;

    $('#backdrop').hidden = false;
    d.hidden = false;
    S.drawerOpen = true;
    d.dataset.id = base.id;
    d.dataset.new = isNew ? '1' : '';
    d._base = task || null;

    const form = $('form', d);
    form.addEventListener('submit', (ev) => { ev.preventDefault(); submitDrawer(form); });
    $('#fStart', d).addEventListener('change', () => {
      if ($('#fEnd', d).value < $('#fStart', d).value) $('#fEnd', d).value = $('#fStart', d).value;
    });
    $('#fTitle', d).focus();
  }

  function closeDrawer() {
    $('#drawer').hidden = true;
    $('#backdrop').hidden = true;
    S.drawerOpen = false;
  }

  async function submitDrawer(form) {
    const d = $('#drawer');
    const fd = new FormData(form);
    const err = $('#drErr', d);
    const title = String(fd.get('title') || '').trim();
    const start = String(fd.get('start') || '');
    const end = String(fd.get('end') || '');
    if (!title) { err.textContent = 'Give the task a name.'; $('#fTitle', d).focus(); return; }
    if (!start || !end) { err.textContent = 'Choose both a start and a due date.'; return; }
    if (end < start) { err.textContent = 'The due date cannot be before the start date.'; return; }

    const task = {
      id: d.dataset.id,
      title,
      phase: String(fd.get('phase') || '').trim(),
      owners: fd.getAll('owner'),
      start, end,
      status: String(fd.get('status') || 'Not Started'),
      priority: Number(fd.get('priority') || 3),
      source: d._base ? d._base.source || '' : '',
      notes: String(fd.get('notes') || '').trim(),
      needsOwner: fd.get('needsOwner') === 'on',
      reference: fd.get('reference') === 'on',
    };
    if (!(await ensureName())) return;
    closeDrawer();
    const ok = await persist([task]);
    if (ok) toast(d.dataset.new ? 'Task added.' : 'Changes saved.');
  }

  /* ------------------------------------------------------------------ *
   * Actions: shift dates, export, quick edits
   * ------------------------------------------------------------------ */
  async function openRebase() {
    const a = anchorTask();
    if (!a) { toast('Add a task in the Event phase first, so there is a live date to move.', 'warn'); return; }
    const current = startDay(a);
    const r = await dialog(`
      <form method="dialog">
        <h2>Shift every date</h2>
        <p>Pick the day the next event starts. All ${S.tasks.length} tasks move by the same number of days, so the gaps between them stay the same.</p>
        <label>First day of the live event (now ${esc(fmt(current, true))})
          <input type="date" name="date" required value="${esc(toIso(current))}" id="rbDate"></label>
        <div class="preview" id="rbPreview">Choose a new date.</div>
        <label class="check"><input type="checkbox" name="reset" checked> Set every task back to Not Started</label>
        <div class="acts"><button class="btn" value="cancel" formnovalidate>Cancel</button><button class="btn primary" value="ok">Shift dates</button></div>
      </form>`, (dlgEl) => {
      const input = $('#rbDate', dlgEl);
      const out = $('#rbPreview', dlgEl);
      const first = Math.min(...S.tasks.map(startDay));
      const update = () => {
        if (!input.value) { out.textContent = 'Choose a new date.'; return; }
        const shift = toDay(input.value) - current;
        out.textContent = shift === 0
          ? 'That is the current date, so dates will not move.'
          : `Everything moves ${shift > 0 ? 'later' : 'earlier'} by ${span(shift)}. The first task would start ${fmt(first + shift, true)}.`;
      };
      input.addEventListener('input', update);
      update();
    });
    if (r.action !== 'ok') return;
    const target = toDay(String(r.data.get('date')));
    const shift = target - current;
    if (shift === 0 && r.data.get('reset') !== 'on') return;
    const reset = r.data.get('reset') === 'on';
    if (!(await confirmDialog('Move the whole plan?', `Every task moves ${shift >= 0 ? 'later' : 'earlier'} by ${span(shift)}${reset ? ' and goes back to Not Started' : ''}. Everyone will see the change.`, 'Shift dates'))) return;
    const moved = S.tasks.map((t) => ({
      ...t,
      start: toIso(startDay(t) + shift),
      end: toIso(endDay(t) + shift),
      status: reset ? 'Not Started' : t.status,
    }));
    sessionStorage.removeItem(LS.banner);
    S.needFocus = true;
    const ok = await persist(moved);
    if (ok) toast('Dates shifted. Check organizer dates against the new event guide.');
  }

  function csvCell(v) {
    let s = String(v == null ? '' : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function exportCsv() {
    const rows = visibleTasks().sort(byDate);
    const head = ['Task', 'Owners', 'Phase', 'Start', 'Due', 'Status', 'Priority', 'Organizer date', 'Notes', 'Last changed by', 'Last changed'];
    const lines = [head, ...rows.map((t) => [t.title, t.owners.join(' / '), t.phase, t.start, t.end, t.reference ? 'Reference' : t.status, t.priority, t.reference ? 'Yes' : '', t.notes, t.updatedBy || '', t.updatedAt || ''])];
    const csv = '\uFEFF' + lines.map((r) => r.map(csvCell).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const dept = S.filters.dept === 'All' ? 'all' : S.filters.dept === '__ref' ? 'organizer' : slug(S.filters.dept);
    a.download = `pdc-planner-${dept}-${toIso(todayDay)}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  async function quickStatus(id, status) {
    const t = S.tasks.find((x) => x.id === id);
    if (!t || t.status === status) return;
    await persist([{ ...t, status }]);
  }

  /* ------------------------------------------------------------------ *
   * Hash (shareable links per department)
   * ------------------------------------------------------------------ */
  function writeHash() {
    const p = new URLSearchParams();
    if (S.filters.dept !== 'All') p.set('team', S.filters.dept);
    if (S.view !== 'timeline') p.set('view', S.view);
    if (S.zoom !== 'week') p.set('zoom', S.zoom);
    if (S.group !== 'department') p.set('group', S.group);
    const h = p.toString();
    const next = h ? '#' + h : location.pathname + location.search;
    if (('#' + h) !== location.hash && (h || location.hash)) history.replaceState(null, '', next);
  }

  function readHash() {
    const p = new URLSearchParams(location.hash.replace(/^#/, ''));
    if (p.get('team')) S.filters.dept = p.get('team');
    if (['timeline', 'list'].includes(p.get('view'))) S.view = p.get('view');
    if (ZOOM_PX[p.get('zoom')]) S.zoom = p.get('zoom');
    if (['department', 'phase', 'none'].includes(p.get('group'))) S.group = p.get('group');
    else if (!p.get('view') && window.innerWidth < 860) S.view = 'list';
  }

  /* ------------------------------------------------------------------ *
   * Events
   * ------------------------------------------------------------------ */
  function bind() {
    document.addEventListener('click', async (ev) => {
      const el = ev.target.closest('[data-act], [data-dept], [data-view], [data-zoom]');
      if (!el) return;

      if (el.dataset.dept) { S.filters.dept = el.dataset.dept; S.needFocus = true; render(); return; }
      if (el.dataset.view) { S.view = el.dataset.view; S.needFocus = true; render(); return; }
      if (el.dataset.zoom) { S.zoom = el.dataset.zoom; S.needFocus = true; render(); return; }

      const row = el.closest('[data-id]');
      const task = row ? S.tasks.find((t) => t.id === row.dataset.id) : null;

      switch (el.dataset.act) {
        case 'open': if (task) openDrawer(task); break;
        case 'toggle': if (task) await persist([{ ...task, status: isDone(task) ? 'Not Started' : 'Done' }]); break;
        case 'collapse': {
          const k = el.dataset.key;
          if (S.collapsed.has(k)) S.collapsed.delete(k); else S.collapsed.add(k);
          render();
          break;
        }
        case 'close': closeDrawer(); break;
        case 'add-team': {
          const inp = $('#newTeam');
          const name = inp.value.trim();
          if (!name) break;
          const pills = $('#ownerPills');
          const exists = $$('input[name=owner]', pills).find((i) => i.value.toLowerCase() === name.toLowerCase());
          if (exists) exists.checked = true;
          else pills.insertAdjacentHTML('beforeend', `<label><input type="checkbox" name="owner" value="${esc(name)}" checked><span>${esc(name)}</span></label>`);
          inp.value = '';
          break;
        }
        case 'delete': {
          const id = $('#drawer').dataset.id;
          const t = S.tasks.find((x) => x.id === id);
          if (t && await confirmDialog('Delete this task?', `"${t.title}" will be removed for everyone. This cannot be undone.`, 'Delete task')) {
            closeDrawer();
            if (await removeTask(id)) toast('Task deleted.');
          }
          break;
        }
        case 'rebase': openRebase(); break;
        case 'dismiss-banner': sessionStorage.setItem(LS.banner, '1'); renderBanners(); break;
        default: break;
      }
    });

    document.addEventListener('change', (ev) => {
      const el = ev.target;
      if (el.dataset && el.dataset.act === 'status') {
        const row = el.closest('[data-id]');
        if (row) quickStatus(row.dataset.id, el.value);
      }
    });

    $('#backdrop').addEventListener('click', closeDrawer);
    document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && S.drawerOpen && !$('#dlg').open) closeDrawer(); });

    $('#selGroup').addEventListener('change', (e) => { S.group = e.target.value; render(); });
    $('#selStatus').addEventListener('change', (e) => { S.filters.status = e.target.value; render(); });
    $('#selPriority').addEventListener('change', (e) => { S.filters.minPriority = Number(e.target.value); render(); });
    $('#chkRef').addEventListener('change', (e) => { S.filters.hideRef = e.target.checked; render(); });
    let timer;
    $('#inpSearch').addEventListener('input', (e) => {
      clearTimeout(timer);
      timer = setTimeout(() => { S.filters.q = e.target.value; renderStats(); renderBoard(); }, 120);
    });
    $('#btnAdd').addEventListener('click', () => openDrawer(null));
    $('#btnRebase').addEventListener('click', openRebase);
    $('#btnExport').addEventListener('click', exportCsv);
    $('#btnPrint').addEventListener('click', () => window.print());
    $('#btnName').addEventListener('click', async () => { S.name = ''; await ensureName(); renderTop(); });
    window.addEventListener('hashchange', () => { readHash(); S.needFocus = true; render(); });

    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
    setInterval(() => { if (!document.hidden) refresh(); }, 30000);
  }

  // Quietly pull in other people's changes.
  async function refresh() {
    if (S.mode !== 'shared' || S.drawerOpen || S.saving || $('#dlg').open) return;
    const before = JSON.stringify(S.tasks.map((t) => [t.id, t.updatedAt]).sort());
    if (await loadTasks(false)) {
      const after = JSON.stringify(S.tasks.map((t) => [t.id, t.updatedAt]).sort());
      if (before !== after) render(); else renderTop();
    }
  }

  /* ------------------------------------------------------------------ *
   * Start
   * ------------------------------------------------------------------ */
  async function init() {
    readHash();
    bind();
    try {
      const seed = await loadSeedFile();
      if (seed.event) S.seedEvent = seed.event;
    } catch { /* keep defaults */ }
    await loadTasks(true);
    if (S.filters.dept !== 'All' && S.filters.dept !== '__ref' && !deptList().includes(S.filters.dept)) S.filters.dept = 'All';
    render();
  }

  init().catch((e) => {
    console.error(e);
    $('#board').innerHTML = '<div class="empty"><h3>The planner could not load</h3><p>Refresh the page. If this keeps happening, tell the planner owner.</p></div>';
  });
})();
