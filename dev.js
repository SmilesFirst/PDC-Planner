// Local preview: node dev.js  ->  http://localhost:3000
// Serves /public and runs the same /api/tasks code Vercel will run,
// saving to .data/tasks.json so you can try everything without a database.
process.env.PDC_LOCAL_STORE = process.env.PDC_LOCAL_STORE || '1';

const http = require('http');
const fs = require('fs');
const path = require('path');
const handlers = {
  '/api/tasks': require('./api/tasks.js'),
  '/api/contacts': require('./api/contacts.js'),
  '/api/notes': require('./api/notes.js'),
};

const PUBLIC = path.join(__dirname, 'public');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

http
  .createServer(async (req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (handlers[pathname]) return handlers[pathname](req, res);
    const file = path.join(PUBLIC, pathname === '/' ? 'index.html' : pathname);
    if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.statusCode = 404;
      return res.end('Not found');
    }
    res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  })
  .listen(process.env.PORT || 3000, () => console.log(`Planner running at http://localhost:${process.env.PORT || 3000}`));
