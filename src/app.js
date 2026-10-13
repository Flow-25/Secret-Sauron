'use strict';

const fs = require('node:fs');
const path = require('node:path');
const views = require('./views');
const { DrawError } = require('./draw');
const { sayingFor } = require('./lore');

const MAX_BODY = 16 * 1024;
const LIMITS = { eventName: 80, personName: 40, budget: 40, wishlist: 2000 };
const TOKEN = '([A-Za-z0-9_-]{22})';

const { PUBLIC_DIR } = require('./assets');
const STATIC = {
  'style.css': 'text/css; charset=utf-8',
  'app.js': 'text/javascript; charset=utf-8',
  'theme.js': 'text/javascript; charset=utf-8',
  'sauron.mp3': 'audio/mpeg',
  'favicon.svg': 'image/svg+xml',
};

// The Boromir "It's a gift" photo: any image dropped into public/meme/ is used.
const MEME_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.jfif': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
};
const memeType = (file) => MEME_TYPES[path.extname(file).toLowerCase()];

/** Name of the image in `dir` to use as the meme (prefers names containing "boromir"), or undefined. */
function findMeme(dir) {
  let files;
  try {
    files = fs.readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isFile() && !d.name.startsWith('.') && memeType(d.name))
      .map((d) => d.name)
      .sort();
  } catch {
    return undefined;
  }
  return files.find((f) => /boromir/i.test(f)) || files[0];
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Collapse whitespace in single-line fields; keep newlines in multi-line ones.
const line = (v, max) => String(v ?? '').normalize('NFC').replace(/\s+/g, ' ').trim().slice(0, max);
const text = (v, max) => String(v ?? '').normalize('NFC').replace(/\r\n?/g, '\n').trim().slice(0, max);
const isDate = (v) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(v);
};
const sameName = (a, b) => a.toLocaleLowerCase() === b.toLocaleLowerCase();

function readForm(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        req.removeAllListeners('data');
        req.resume();
        reject(new HttpError(413, 'Payload too large'));
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Object.fromEntries(new URLSearchParams(Buffer.concat(chunks).toString('utf8')))));
    req.on('error', reject);
  });
}

function send(res, status, body, type = 'text/html; charset=utf-8', extra = {}) {
  res.writeHead(status, {
    'Content-Type': type,
    'Content-Length': Buffer.byteLength(body),
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy':
      "default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; frame-ancestors 'none'; form-action 'self'",
    ...extra,
  });
  res.end(body);
}

const html = (res, body, status = 200) => send(res, status, body, undefined, { 'Cache-Control': 'no-store' });
const redirect = (res, location) => {
  res.writeHead(303, { Location: location, 'Cache-Control': 'no-store' });
  res.end();
};

function createApp({
  store,
  rng = Math.random,
  baseUrl,
  memeDir = path.join(PUBLIC_DIR, 'meme'),
  today = () => new Date().toISOString().slice(0, 10),
} = {}) {
  // Checked per request so the photo can be added without restarting the server.
  const memeFile = () => findMeme(memeDir);
  const memeUrl = () => {
    const f = memeFile();
    if (!f) return null;
    // Versioned like other assets, so swapping the photo shows up immediately.
    let v = '0';
    try { v = Math.floor(fs.statSync(path.join(memeDir, f)).mtimeMs).toString(36); } catch { /* raced away */ }
    return `/static/meme/${encodeURIComponent(f)}?v=${v}`;
  };

  const baseFor = (req) => {
    if (baseUrl) return baseUrl.replace(/\/+$/, '');
    const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https' ? 'https' : 'http';
    return `${proto}://${req.headers.host || 'localhost'}`;
  };

  const routes = [];
  const route = (method, pattern, handler) => routes.push({ method, re: new RegExp(`^${pattern}$`), handler });

  // Look up the event behind an admin token, or 404. In POST handlers this must
  // run *after* `await readForm()` so the drawn state can't go stale meanwhile.
  const adminEvent = (token) => {
    const ev = store.eventByAdmin(token);
    if (!ev) throw new HttpError(404);
    return ev;
  };
  const renderAdmin = (req, res, ev, { msg, error } = {}, status = 200) =>
    html(res, views.admin({
      meme: memeUrl(), ev, participants: store.participants(ev.id), exclusions: store.exclusions(ev.id),
      base: baseFor(req), msg, error,
    }), status);

  route('GET', '/', (req, res) => html(res, views.home({ meme: memeUrl() })));

  route('POST', '/events', async (req, res) => {
    const f = await readForm(req);
    const values = {
      name: line(f.name, LIMITS.eventName),
      organizer: line(f.organizer, LIMITS.personName),
      budget: line(f.budget, LIMITS.budget),
      date: line(f.date, 10),
      joins: f.joins === '1',
    };
    let error;
    if (!values.name) error = 'Your Fellowship needs a name.';
    else if (!values.organizer) error = 'Tell us your name, organizer.';
    else if (values.date && !isDate(values.date)) error = 'That exchange date is not valid.';
    if (error) return html(res, views.home({ error, values, meme: memeUrl() }), 400);

    const ev = store.createEvent({
      name: values.name, budget: values.budget, exchangeDate: values.date,
      organizerName: values.organizer, organizerJoins: values.joins,
    });
    redirect(res, `/admin/${ev.admin_token}?msg=created`);
  });

  route('GET', `/admin/${TOKEN}`, (req, res, [token], query) =>
    renderAdmin(req, res, adminEvent(token), { msg: query.get('msg') }));

  route('POST', `/admin/${TOKEN}/remove`, async (req, res, [token]) => {
    const f = await readForm(req);
    const ev = adminEvent(token);
    if (ev.drawn_at) return renderAdmin(req, res, ev, { error: 'The lots are already cast. Undo the draw first.' }, 409);
    if (!store.removeParticipant(ev.id, Number(f.id))) {
      return renderAdmin(req, res, ev, { error: 'That member was not found.' }, 400);
    }
    redirect(res, `/admin/${token}?msg=removed`);
  });

  route('POST', `/admin/${TOKEN}/exclusions`, async (req, res, [token]) => {
    const f = await readForm(req);
    const ev = adminEvent(token);
    if (ev.drawn_at) return renderAdmin(req, res, ev, { error: 'The lots are already cast. Undo the draw first.' }, 409);
    if (!store.addExclusion(ev.id, Number(f.a), Number(f.b))) {
      return renderAdmin(req, res, ev, { error: 'Pick two different members.' }, 400);
    }
    redirect(res, `/admin/${token}?msg=excl_added`);
  });

  route('POST', `/admin/${TOKEN}/exclusions/delete`, async (req, res, [token]) => {
    const f = await readForm(req);
    const ev = adminEvent(token);
    if (ev.drawn_at) return renderAdmin(req, res, ev, { error: 'The lots are already cast. Undo the draw first.' }, 409);
    store.removeExclusion(ev.id, Number(f.a), Number(f.b));
    redirect(res, `/admin/${token}?msg=excl_removed`);
  });

  route('POST', `/admin/${TOKEN}/draw`, async (req, res, [token]) => {
    await readForm(req);
    const ev = adminEvent(token);
    try {
      const done = store.draw(ev.id, rng);
      redirect(res, `/admin/${token}?msg=${done ? 'drawn' : 'already_drawn'}`);
    } catch (e) {
      if (!(e instanceof DrawError)) throw e;
      renderAdmin(req, res, ev, { error: e.message }, 409);
    }
  });

  route('POST', `/admin/${TOKEN}/reset`, async (req, res, [token]) => {
    await readForm(req);
    const ev = adminEvent(token);
    store.resetDraw(ev.id);
    redirect(res, `/admin/${token}?msg=reset`);
  });

  const renderJoin = (res, ev, extra = {}, status = 200) =>
    html(res, views.join({ meme: memeUrl(), ev, count: store.participants(ev.id).length, ...extra }), status);

  route('GET', `/join/${TOKEN}`, (req, res, [token]) => {
    const ev = store.eventByInvite(token);
    if (!ev) throw new HttpError(404);
    renderJoin(res, ev);
  });

  route('POST', `/join/${TOKEN}`, async (req, res, [token]) => {
    const f = await readForm(req);
    const ev = store.eventByInvite(token);
    if (!ev) throw new HttpError(404);
    const values = { name: line(f.name, LIMITS.personName), wishlist: text(f.wishlist, LIMITS.wishlist) };
    if (ev.drawn_at) return renderJoin(res, ev, {}, 409);
    if (!values.name) return renderJoin(res, ev, { error: 'Even hobbits have names. Please enter yours.', values }, 400);
    const taken = store.participants(ev.id).some((p) => sameName(p.name, values.name));
    const p = taken ? null : store.addParticipant(ev.id, values.name, values.wishlist);
    if (!p) {
      return renderJoin(res, ev, {
        error: `Someone named "${values.name}" has already joined. If that's you, use your personal link. Otherwise add an initial.`,
        values,
      }, 409);
    }
    redirect(res, `/me/${p.token}?msg=joined`);
  });

  const participant = (token) => {
    const p = store.participantByToken(token);
    if (!p) throw new HttpError(404);
    return p;
  };

  route('GET', `/me/${TOKEN}`, (req, res, [token], query) => {
    const p = participant(token);
    const ev = store.eventById(p.event_id);
    const recipient = p.recipient_id ? store.participantById(p.recipient_id) : null;
    const position = store.participants(ev.id).findIndex((m) => m.id === p.id);
    html(res, views.me({
      meme: memeUrl(), p, ev, recipient, base: baseFor(req), msg: query.get('msg'),
      saying: sayingFor(ev.id, position), today: today(),
    }));
  });

  route('POST', `/me/${TOKEN}/wishlist`, async (req, res, [token]) => {
    const f = await readForm(req);
    const p = participant(token);
    store.updateWishlist(p.id, text(f.wishlist, LIMITS.wishlist));
    redirect(res, `/me/${token}?msg=saved`);
  });

  route('GET', '/static/meme/([^/]+)', (req, res, [raw]) => {
    let file;
    try { file = decodeURIComponent(raw); } catch { throw new HttpError(404); }
    // Only the one chosen image is ever served, so no other path can be reached.
    if (!file || memeFile() !== file) throw new HttpError(404);
    const body = fs.readFileSync(path.join(memeDir, file));
    res.writeHead(200, {
      'Content-Type': memeType(file),
      'Content-Length': body.length,
      'Cache-Control': 'public, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(body);
  });

  route('GET', '/static/([a-z0-9.]+)', (req, res, [file], query) => {
    if (!Object.hasOwn(STATIC, file)) throw new HttpError(404);
    const body = fs.readFileSync(path.join(PUBLIC_DIR, file));
    res.writeHead(200, {
      'Content-Type': STATIC[file],
      'Content-Length': body.length,
      // Versioned URLs (?v=…) change whenever the file does, so they can be cached for good.
      'Cache-Control': query.has('v') ? 'public, max-age=31536000, immutable' : 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(body);
  });

  return async function handle(req, res) {
    const url = new URL(req.url, 'http://x');
    try {
      let pathMatched = false;
      for (const r of routes) {
        const m = r.re.exec(url.pathname);
        if (!m) continue;
        pathMatched = true;
        if (r.method !== req.method && !(r.method === 'GET' && req.method === 'HEAD')) continue;
        return await r.handler(req, res, m.slice(1), url.searchParams);
      }
      if (pathMatched) return send(res, 405, 'Method Not Allowed', 'text/plain; charset=utf-8');
      throw new HttpError(404);
    } catch (e) {
      if (res.headersSent) return res.destroy();
      if (e instanceof HttpError && e.status === 404) return html(res, views.notFound({ meme: memeUrl() }), 404);
      if (e instanceof HttpError) return send(res, e.status, e.message, 'text/plain; charset=utf-8');
      console.error(e);
      html(res, views.serverError(), 500);
    }
  };
}

module.exports = { createApp, findMeme };
