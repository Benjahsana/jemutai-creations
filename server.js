// Jemutai Creations — tiny server for the site + Commitment to Order list.
// No dependencies. Run:  ADMIN_TOKEN=some-long-secret node server.js
// Data is saved to data/commitments.json (keep this file private, back it up).

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 8080);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const PUBLIC_DIR = path.join(__dirname, 'docs');
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'commitments.json');

const RANGES = { 'under-40': { label: 'Under $40', min: 0 }, '40-80': { label: '$40-80', min: 40 }, '80-150': { label: '$80-150', min: 80 }, '150+': { label: '$150+', min: 150 } };
const ITEMS = ['Dress', 'Skirt', 'Top', 'Trousers', 'Shirt', 'Crochet set', 'Bag', 'Other'];
const SERVICES = ['Custom piece', 'Alterations', 'Tailoring'];
const KNOWS = ['Family', 'Friend', 'Coworker or acquaintance', 'Friend of a friend', "Haven't met them"];
const STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','PR'];

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.mp4': 'video/mp4', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

fs.mkdirSync(DATA_DIR, { recursive: true });
let rows = [];
try { rows = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { rows = []; }

function save() {
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(rows, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

// Public view: first name, city, state, service, item, price range ONLY. Never email or last name.
function publicList() {
  const list = rows.map(r => ({ firstName: r.firstName, city: r.city, state: r.state, service: r.service, item: r.item, range: RANGES[r.range].label, date: r.createdAt.slice(0, 10) }));
  const atLeast = rows.reduce((s, r) => s + RANGES[r.range].min, 0);
  return { count: rows.length, atLeast, list: list.reverse() };
}

const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

function validate(b) {
  const r = {
    firstName: clean(b.firstName, 40), lastName: clean(b.lastName, 60), email: clean(b.email, 120).toLowerCase(),
    city: clean(b.city, 60), state: clean(b.state, 2).toUpperCase(), service: clean(b.service, 20), item: clean(b.item, 40), details: clean(b.details, 300),
    range: clean(b.range, 10), knows: clean(b.knows, 40), consent: b.consent === true,
  };
  if (!r.firstName || !r.lastName) return [null, 'Please add your first and last name.'];
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email)) return [null, 'Please add a valid email.'];
  if (!r.city || !STATES.includes(r.state)) return [null, 'Please add your city and state.'];
  if (!SERVICES.includes(r.service)) return [null, 'Please choose what you need: a custom piece, alterations or tailoring.'];
  if (!ITEMS.includes(r.item)) return [null, 'Please choose what it is.'];
  if (!RANGES[r.range]) return [null, 'Please choose a price range.'];
  if (!KNOWS.includes(r.knows)) return [null, 'Please say how you know Jemutai or Benjah.'];
  if (!r.consent) return [null, 'Please tick the box to confirm.'];
  return [r, null];
}

const hits = new Map(); // simple rate limit: 5 posts per IP per hour
function limited(ip) {
  const now = Date.now(), arr = (hits.get(ip) || []).filter(t => now - t < 3600e3);
  arr.push(now); hits.set(ip, arr); return arr.length > 5;
}

function send(res, code, body, type = 'application/json; charset=utf-8', extra = {}) {
  res.writeHead(code, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', ...extra });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function adminOk(url) {
  const t = url.searchParams.get('token') || '';
  if (!ADMIN_TOKEN || t.length !== ADMIN_TOKEN.length) return false;
  return crypto.timingSafeEqual(Buffer.from(t), Buffer.from(ADMIN_TOKEN));
}

const csvCell = v => { let s = String(v ?? ''); if (/^[=+\-@]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };

function serveStatic(req, res, pathname) {
  let p = decodeURIComponent(pathname);
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, p));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, 'Forbidden', 'text/plain');
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Not found', 'text/plain');
    const type = TYPES[path.extname(file)] || 'application/octet-stream';
    const range = req.headers.range;
    if (range && type === 'video/mp4') { // lets the video seek on phones
      const m = /bytes=(\d*)-(\d*)/.exec(range) || [];
      const start = m[1] ? +m[1] : 0, end = m[2] ? Math.min(+m[2], st.size - 1) : st.size - 1;
      if (start > end || start >= st.size) return send(res, 416, '', 'text/plain', { 'Content-Range': `bytes */${st.size}` });
      res.writeHead(206, { 'Content-Type': type, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Accept-Ranges': 'bytes' });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    const cache = type.startsWith('text/html') ? 'no-cache' : 'public, max-age=86400';
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Cache-Control': cache, 'Accept-Ranges': 'bytes' });
    fs.createReadStream(file).pipe(res);
  });
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

  if (url.pathname === '/api/commitments' && req.method === 'GET') return send(res, 200, publicList(), undefined, { 'Cache-Control': 'no-store' });

  if (url.pathname === '/api/commitments' && req.method === 'POST') {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 10000) req.destroy(); });
    req.on('end', () => {
      let b; try { b = JSON.parse(body); } catch { return send(res, 400, { error: 'Bad request.' }); }
      if (b.website) return send(res, 200, { ok: true, ...publicList() }); // honeypot: bots fill hidden field
      if (limited(ip)) return send(res, 429, { error: 'Too many tries. Please try again later.' });
      const [r, err] = validate(b);
      if (err) return send(res, 400, { error: err });
      if (rows.some(x => x.email === r.email && x.item === r.item && x.service === r.service)) return send(res, 409, { error: 'You already made this commitment with that email. Thank you!' });
      rows.push({ id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...r });
      save();
      return send(res, 200, { ok: true, ...publicList() });
    });
    return;
  }

  // Private: full records incl. email, last name, how they know you. For you only.
  if (url.pathname === '/admin/commitments.csv') {
    if (!adminOk(url)) return send(res, 401, 'Unauthorized', 'text/plain');
    const cols = ['createdAt', 'firstName', 'lastName', 'email', 'city', 'state', 'service', 'item', 'details', 'range', 'knows', 'consent'];
    const csv = [cols.join(','), ...rows.map(r => cols.map(c => csvCell(c === 'range' ? RANGES[r.range].label : r[c])).join(','))].join('\r\n');
    return send(res, 200, csv, 'text/csv; charset=utf-8', { 'Content-Disposition': 'attachment; filename="jemutai-commitments.csv"', 'Cache-Control': 'no-store' });
  }
  if (url.pathname.startsWith('/admin') || url.pathname.startsWith('/data')) return send(res, 404, 'Not found', 'text/plain');

  if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res, url.pathname);
  send(res, 405, 'Method not allowed', 'text/plain');
}).listen(PORT, () => {
  console.log(`Jemutai Creations running on http://localhost:${PORT}`);
  if (!ADMIN_TOKEN) console.log('Note: set ADMIN_TOKEN to enable the private CSV export.');
});
