# PDC Workback Planner

A shared planner for the PDC conference. Everyone who opens the link sees the same
data, and changes show up for the whole team within about 30 seconds.

It has three tabs:

- **Plan**: every task with owner, dates, status and priority, as a visual timeline or a
  list, with a view for each department.
- **Contacts**: the organizer, venue and platform contact list. Phone numbers and emails
  are tap-to-call and tap-to-write, with filters for Organizer, Venue and Platform.
- **Notes**: shared notes for ideas, decisions and reminders. Notes can be pinned to the top.

## What people can do

- Pick a department on the Plan tab to see only their tasks.
- Tick the circle next to a task to mark it done, or click a task to edit dates, owners,
  status, priority and notes.
- Add, edit or delete contacts and notes. Everything saves for everyone.
- Switch between Timeline and List, and zoom the timeline by month, week or day.
- Export what's on screen to CSV (tasks, contacts or notes, depending on the tab), or print it.
- **Shift dates** (Plan tab) moves the whole plan to a new event date.
- Share a link to a specific view. Choose a department or tab, then copy the address bar.
  Examples: `https://your-app.vercel.app/#team=Marketing` and `https://your-app.vercel.app/#tab=contacts`.

## Put it online

1. Put this folder on GitHub (a repository with `api`, `public` and `vercel.json` at the top level).
2. In Vercel, Add New, Project, import the repository. Framework Preset: Other. Leave the
   build settings empty and deploy.
3. In the Vercel project, open Storage, add **Upstash Redis** (free plan) and connect it to
   the project. Redeploy once.
4. Open your link. The first load fills in the starter plan and contact list.

Until step 3 is done the app works in a preview mode where changes stay in one browser.
A yellow banner says so.

### Updating an existing deployment

Upload the new files to the same GitHub repository (Add file, Upload files, drop the
contents of the folder, Commit). Vercel rebuilds on its own. Your tasks, contacts and notes
live in the database, so an update does not touch them. No new settings are needed.

### Optional: require a passcode

In Vercel, Settings, Environment Variables, add `PDC_PASSCODE` with a word or phrase, then
redeploy. People enter it once per browser. It's a shared code, not individual accounts.

## Try it on your computer

```
node dev.js
```

Open http://localhost:3000. Data is kept in the `.data` folder. No install step is needed.

## Good to know

- **Who changed what:** each person enters their name once, and it's saved with every edit.
  If two people edit the same item at once, the later save is stopped and the newer version
  is shown, so nobody overwrites a teammate silently.
- **Database use:** every open browser checks for changes about every 30 seconds, and only for
  the tab it is showing. Upstash's free plan allows 500K commands a month. Roughly ten people
  with the planner open all workday use under half of that. If many more people keep it open
  all day, check usage in the Upstash dashboard or move to a paid plan.
- **Start over:** the starter data lives in `public/seed.json` and loads only once. To reload it,
  send a POST request to `/api/tasks?action=reset` (or `/api/contacts?action=reset`).
  This deletes everyone's edits for that list, so it isn't a button in the app.
- **Contacts source:** the starter contacts were supplied by your team along with their
  source pages. Check them against the current PDC exhibitor manual before the show.
- **Plans:** Vercel's free Hobby plan is for personal, non-commercial projects. If this is for
  your company, check Vercel's terms; Pro is the usual choice.

## Files

```
public/index.html   page layout and tabs
public/styles.css   look and feel
public/app.js       the planner (timeline, list, contacts, notes, editing)
public/seed.json    starter plan, contacts and notes
api/tasks.js        tasks
api/contacts.js     contact list
api/notes.js        notes
api/_crud.js        shared save/load/delete logic and passcode check
api/_store.js       talks to Upstash Redis (or a local file when running dev.js)
dev.js              local preview server
vercel.json         tells Vercel to serve /public
```
