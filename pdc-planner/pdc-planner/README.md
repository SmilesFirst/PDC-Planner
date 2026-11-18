# PDC Workback Planner

A shared planner for the PDC conference. Everyone who opens the link sees the same
data, and changes show up for the whole team within about 30 seconds.

It has three tabs:

- **Plan**: every task with owner, dates, status and priority, as a visual timeline or a
  list, with a view for each department.
- **Contacts**: the organizer, venue and platform contact list. Phone numbers and emails
  are tap-to-call and tap-to-write, with filters for Organizer, Venue and Platform.
- **Notes**: shared notes for ideas, decisions and reminders. Notes can be pinned to the top.
- **Credentials**: shared logins for show and vendor portals (site, website, username, password,
  notes). Usernames, passwords and notes are encrypted in the browser with a team passphrase, and
  they stay hidden until someone unlocks the vault and clicks Show or Copy.

## What people can do

- Pick a department on the Plan tab to see only their tasks.
- Tick the circle next to a task to mark it done, or click a task to edit dates, owners,
  status, priority and notes.
- Add, edit or delete contacts, notes and credentials. Everything saves for everyone.
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

## How the Credentials vault works

- The first person to open the Credentials tab chooses a team passphrase (12 or more characters).
  Everyone else enters that same passphrase to unlock.
- Before anything is saved, the browser scrambles the username, password and notes (AES-256-GCM,
  with a key made from the passphrase by PBKDF2 at 600,000 rounds). The database and the server
  only ever hold the scrambled version, plus the site name and website, which are not secret.
  The passphrase is never sent anywhere.
- The vault locks itself after 10 minutes without activity, and anyone can lock it with the Lock
  button. Passwords and usernames show as dots until someone clicks Show, then hide again after
  30 seconds. The Credentials tab is left out of printing and CSV export on purpose.
- **There is no recovery for a lost passphrase.** If it's lost, the owner can wipe the vault by
  sending a POST request to `/api/credentials?action=reset` and the team re-enters the logins.
- **Changing the passphrase** (for example when someone leaves) is in the Credentials tab. It
  re-encrypts every entry. It does not change the passwords for the sites themselves, so change
  those too if someone who knew them has left.
- **Limits you should know about:** anyone who has the planner link can download the scrambled data,
  so a weak passphrase could be guessed offline. Use a long passphrase and set `PDC_PASSCODE` as well.
  Anyone who can edit your GitHub repository or Vercel project could change the code, so keep that
  list short. This is a convenience for shared show and vendor logins, not a replacement for a
  company password manager. Don't store banking, admin or personal passwords here.

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
public/app.js       the planner (timeline, list, contacts, notes, credentials vault, editing)
public/seed.json    starter plan, contacts and notes
api/tasks.js        tasks
api/contacts.js     contact list
api/notes.js        notes
api/credentials.js  shared logins (stores only encrypted data for the secret parts)
api/_crud.js        shared save/load/delete logic and passcode check
api/_store.js       talks to Upstash Redis (or a local file when running dev.js)
dev.js              local preview server
vercel.json         tells Vercel to serve /public
```
