# PDC Workback Planner

A shared planner for the PDC conference: every task with its owner, dates, status
and priority, shown as a visual timeline (or a simple list), with a view for each
department. Everyone who opens the link sees the same plan, and changes show up
for the whole team within about 30 seconds.

## What people can do

- Pick their department on the left to see only their tasks.
- Tick the circle next to a task to mark it done, or click a task to edit
  dates, owners, status, priority and notes.
- Switch between Timeline and List, zoom the timeline by month, week or day.
- Filter by status, priority or search text.
- Export what's on screen to CSV, or print it.
- **Shift dates** moves the whole plan to a new event date, so you can reuse it next year.
- Share a department link: choose a department, then copy the address bar.
  It looks like `https://your-app.vercel.app/#team=Marketing`.

## Put it online (about 10 minutes)

1. **Put this folder on GitHub.** Create a new private repository and upload these files
   (or run `vercel` from this folder if you use the Vercel CLI).
2. **Import it in Vercel.** Vercel dashboard, Add New, Project, choose the repository.
   Leave Framework Preset as "Other" and leave the build settings empty. Deploy.
3. **Add the free database so changes are shared.**
   In your Vercel project open the **Storage** tab (or Marketplace), add **Upstash Redis**,
   pick the free plan, and connect it to this project. Vercel adds the connection
   settings for you. Then go to Deployments and **Redeploy** once.
4. Open your link. The first load fills in the starter plan (48 tasks).

Until step 3 is done the app still works, but in a preview mode where changes stay in
one browser. A yellow banner tells you when that's the case.

### Optional: require a passcode

In Vercel, Settings, Environment Variables, add `PDC_PASSCODE` with a word or phrase,
then redeploy. People are asked for it once per browser. This is a shared team code,
not individual accounts, so use it to keep the link from being casually opened rather
than for sensitive data.

## Try it on your computer first

```
node dev.js
```

Open http://localhost:3000. Data is kept in `.data/tasks.json`. No install step is needed.

## Good to know

- **Who changed what:** each person enters their name once; it's saved with every edit and
  shown in the task panel. If two people edit the same task at once, the later save is
  stopped and the newer version is shown, so nobody overwrites a teammate silently.
- **Start over:** the starter plan lives in `public/seed.json`. To reload it for everyone,
  open the site's `/api/tasks?action=reset` with a POST request (for example from a REST client).
  This deletes all edits, so it isn't a button in the app.
- **Plan details to confirm:** the live event is listed as March 5 to 7 in the CSV but March 5 to 6
  in the work-back plan. Four tasks (promotions draft, demo scheduling, lead capture, feedback)
  had no owner in the original files; they carry an "Owner to confirm" tag until someone clears it.
- **Plans and limits:** Vercel's free Hobby plan is meant for personal, non-commercial projects.
  If this is for your company, check Vercel's current terms; the Pro plan is the usual choice.
  Upstash's free tier is far above what a 50-task plan needs, but check its current limits.

## Files

```
public/index.html   page layout
public/styles.css   look and feel
public/app.js       the planner (timeline, list, editing)
public/seed.json    the starter plan (edit this to change what a fresh install loads)
api/tasks.js        read and save tasks, optional passcode
api/_store.js       talks to Upstash Redis (or a local file when running dev.js)
dev.js              local preview server
vercel.json         tells Vercel to serve /public
```

Updated
