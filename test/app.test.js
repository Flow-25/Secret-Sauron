'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { Store } = require('../src/db');
const { createApp } = require('../src/app');

let server;
let base;
let store;

test.before(async () => {
  store = new Store(':memory:');
  // Empty meme folder, so tests don't depend on whatever photo is in public/meme.
  const emptyMemeDir = require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'nomeme-'));
  server = http.createServer(createApp({ store, memeDir: emptyMemeDir, today: () => '2026-12-08' }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => {
  server.close();
  store.close();
});

const get = (path) => fetch(base + path, { redirect: 'manual' });
const post = (path, data = {}) => fetch(base + path, {
  method: 'POST',
  redirect: 'manual',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(data).toString(),
});

async function createEvent(data = {}) {
  const res = await post('/events', { name: 'The Fellowship', organizer: 'Frodo', joins: '1', ...data });
  assert.equal(res.status, 303);
  const loc = res.headers.get('location');
  assert.match(loc, /^\/admin\/[\w-]{22}\?msg=created$/);
  const adminPath = loc.split('?')[0];
  const page = await (await get(adminPath)).text();
  const invite = page.match(/\/join\/([\w-]{22})/)[1];
  return { adminPath, invite, page };
}

async function join(invite, name, wishlist = '') {
  const res = await post(`/join/${invite}`, { name, wishlist });
  assert.equal(res.status, 303, `joining as ${name}`);
  return res.headers.get('location').split('?')[0]; // /me/<token>
}

const recipientOf = (html) => {
  const m = html.match(/<h2 class="recipient">([^<]*)<\/h2>/);
  return m && m[1];
};

test('home page renders with the theme and security headers', async () => {
  const res = await get('/');
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.match(body, /Secret Gandalf/);
  assert.match(body, /Forge the Fellowship/);
  assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
  assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
});

test('static assets are served and path traversal is not', async () => {
  for (const f of ['style.css', 'app.js', 'favicon.svg']) {
    assert.equal((await get(`/static/${f}`)).status, 200, f);
  }
  assert.equal((await get('/static/..%2Fserver.js')).status, 404);
  assert.equal((await get('/static/nope.css')).status, 404);
});

test('full Secret Santa flow: create, join, exclude, draw, reveal', async () => {
  const { adminPath, invite, page } = await createEvent({ budget: '100 PLN', date: '2026-12-20' });
  assert.match(page, /100 PLN/);
  assert.match(page, /2026-12-20/);
  const frodoMe = page.match(/\/me\/([\w-]{22})/)[0];

  const me = { Frodo: frodoMe };
  me.Sam = await join(invite, 'Sam', 'Po-tay-toes\nRope');
  me.Merry = await join(invite, 'Merry');
  me.Pippin = await join(invite, 'Pippin', 'Second breakfast');

  // Personal page before the draw shows the waiting state.
  const waiting = await (await get(me.Sam)).text();
  assert.match(waiting, /Hail, Sam!/);
  assert.match(waiting, /Awaiting the casting of lots/);
  assert.equal(recipientOf(waiting), null);

  // Exclude Merry <-> Pippin.
  const ids = Object.fromEntries(store.participants(store.eventByInvite(invite).id).map((p) => [p.name, p.id]));
  let res = await post(`${adminPath}/exclusions`, { a: ids.Merry, b: ids.Pippin });
  assert.equal(res.status, 303);
  assert.match(await (await get(adminPath)).text(), /Merry ⟷ Pippin/);

  // Draw.
  res = await post(`${adminPath}/draw`);
  assert.equal(res.status, 303);
  assert.match(res.headers.get('location'), /msg=drawn/);

  // Admin page must not leak who drew whom.
  const adminAfter = await (await get(adminPath)).text();
  assert.match(adminAfter, /lots were cast/);
  assert.doesNotMatch(adminAfter, /class="recipient"/);
  assert.doesNotMatch(adminAfter, /\/join\//, 'invite link is hidden after the draw');

  // Each member sees a recipient; together they form a valid assignment.
  const got = {};
  for (const [name, path] of Object.entries(me)) {
    got[name] = recipientOf(await (await get(path)).text());
    assert.ok(got[name], `${name} has a recipient`);
    assert.notEqual(got[name], name);
  }
  assert.deepEqual(Object.values(got).sort(), Object.keys(me).sort());
  assert.notEqual(got.Merry, 'Pippin');
  assert.notEqual(got.Pippin, 'Merry');

  // Santa sees the live wishlist, including updates after the draw.
  const santaOfSam = Object.keys(got).find((n) => got[n] === 'Sam');
  assert.match(await (await get(me[santaOfSam])).text(), /Po-tay-toes\nRope/);
  res = await post(`${me.Sam}/wishlist`, { wishlist: 'An Elven cloak' });
  assert.equal(res.status, 303);
  assert.match(await (await get(me[santaOfSam])).text(), /An Elven cloak/);

  // Drawing again is a no-op.
  res = await post(`${adminPath}/draw`);
  assert.match(res.headers.get('location'), /already_drawn/);

  // The Fellowship is sealed after the draw.
  res = await post(`/join/${invite}`, { name: 'Gollum' });
  assert.equal(res.status, 409);
  assert.match(await res.text(), /already set out/);
  res = await post(`${adminPath}/remove`, { id: ids.Sam });
  assert.equal(res.status, 409);
  res = await post(`${adminPath}/exclusions`, { a: ids.Sam, b: ids.Frodo });
  assert.equal(res.status, 409);

  // Undo the draw.
  res = await post(`${adminPath}/reset`);
  assert.match(res.headers.get('location'), /msg=reset/);
  assert.match(await (await get(me.Sam)).text(), /Awaiting the casting of lots/);
  assert.equal((await post(`/join/${invite}`, { name: 'Gollum' })).status, 303);
});

test('draw needs at least 3 members', async () => {
  const { adminPath, invite } = await createEvent();
  await join(invite, 'Sam');
  const res = await post(`${adminPath}/draw`);
  assert.equal(res.status, 409);
  assert.match(await res.text(), /At least 3 members/);
});

test('impossible exclusions give a clear error', async () => {
  const { adminPath, invite } = await createEvent({ name: 'Doomed', organizer: 'Aragorn' });
  await join(invite, 'Legolas');
  await join(invite, 'Gimli');
  const eventId = store.eventByInvite(invite).id;
  const ids = Object.fromEntries(store.participants(eventId).map((p) => [p.name, p.id]));
  await post(`${adminPath}/exclusions`, { a: ids.Aragorn, b: ids.Legolas });
  const res = await post(`${adminPath}/draw`);
  assert.equal(res.status, 409);
  assert.match(await res.text(), /impossible/);
  assert.equal(store.eventByInvite(invite).drawn_at, null);
});

test('exclusion validation and removal', async () => {
  const { adminPath, invite } = await createEvent({ name: 'Ex', organizer: 'A' });
  await join(invite, 'B');
  const other = await createEvent({ name: 'Other', organizer: 'Z' });
  const ids = Object.fromEntries(store.participants(store.eventByInvite(invite).id).map((p) => [p.name, p.id]));
  const foreign = store.participants(store.eventByInvite(other.invite).id)[0].id;

  assert.equal((await post(`${adminPath}/exclusions`, { a: ids.A, b: ids.A })).status, 400);
  assert.equal((await post(`${adminPath}/exclusions`, { a: ids.A, b: foreign })).status, 400, 'cross-event pair');
  assert.equal((await post(`${adminPath}/exclusions`, { a: ids.B, b: ids.A })).status, 303);
  assert.match(await (await get(adminPath)).text(), /A ⟷ B/);
  assert.equal((await post(`${adminPath}/exclusions/delete`, { a: ids.B, b: ids.A })).status, 303);
  assert.doesNotMatch(await (await get(adminPath)).text(), /A ⟷ B/);
});

test('removing a member deletes them and their exclusions', async () => {
  const { adminPath, invite } = await createEvent({ name: 'Rm', organizer: 'A' });
  const bMe = await join(invite, 'B');
  const ids = Object.fromEntries(store.participants(store.eventByInvite(invite).id).map((p) => [p.name, p.id]));
  await post(`${adminPath}/exclusions`, { a: ids.A, b: ids.B });
  const res = await post(`${adminPath}/remove`, { id: ids.B });
  assert.equal(res.status, 303);
  assert.equal((await get(bMe)).status, 404);
  assert.equal(store.exclusions(store.eventByInvite(invite).id).length, 0);
});

test('duplicate names are rejected case-insensitively, including non-ASCII', async () => {
  const { invite } = await createEvent({ name: 'Dupes', organizer: 'Łukasz' });
  let res = await post(`/join/${invite}`, { name: 'łUKASZ' });
  assert.equal(res.status, 409);
  assert.match(await res.text(), /already joined/);
  res = await post(`/join/${invite}`, { name: '  frodo  ' });
  assert.equal(res.status, 303);
  res = await post(`/join/${invite}`, { name: 'FRODO' });
  assert.equal(res.status, 409);
});

test('organizer can opt out of the draw', async () => {
  const { page, invite } = await createEvent({ name: 'Solo', organizer: 'Gandalf', joins: '' });
  assert.doesNotMatch(page, /Your own personal link/);
  assert.equal(store.participants(store.eventByInvite(invite).id).length, 0);
});

test('user input is HTML-escaped everywhere', async () => {
  const xss = '<script>alert(1)</script>';
  const { adminPath, invite } = await createEvent({ name: xss, organizer: `"><img src=x onerror=alert(1)>` });
  const meP = await join(invite, `<b>Sauron</b>`, xss);
  for (const path of [adminPath, `/join/${invite}`, meP]) {
    const html = await (await get(path)).text();
    assert.doesNotMatch(html, /<script>alert/, path);
    assert.doesNotMatch(html, /<img src=x/, path);
    assert.doesNotMatch(html, /<b>Sauron/, path);
    assert.match(html, /&lt;script&gt;/, path);
  }
});

test('validation errors on create keep the entered values', async () => {
  let res = await post('/events', { name: '', organizer: 'Frodo' });
  assert.equal(res.status, 400);
  assert.match(await res.text(), /needs a name/);
  res = await post('/events', { name: 'X', organizer: '   ' });
  assert.equal(res.status, 400);
  res = await post('/events', { name: 'Keep me', organizer: 'F', date: '2026-02-31' });
  assert.equal(res.status, 400);
  const body = await res.text();
  assert.match(body, /date is not valid/);
  assert.match(body, /value="Keep me"/);
});

test('long input is truncated', async () => {
  const { invite } = await createEvent({ name: 'N'.repeat(500), organizer: 'Frodo' });
  const ev = store.eventByInvite(invite);
  assert.equal(ev.name.length, 80);
  const meP = await join(invite, 'Sam', 'w'.repeat(5000));
  assert.equal(store.participantByToken(meP.split('/').pop()).wishlist.length, 2000);
});

test('oversized request bodies get 413', async () => {
  const res = await post('/events', { name: 'x'.repeat(20000), organizer: 'F' });
  assert.equal(res.status, 413);
});

test('unknown links get the "You shall not pass" page', async () => {
  for (const path of ['/nope', `/admin/${'a'.repeat(22)}`, `/join/${'b'.repeat(22)}`, `/me/${'c'.repeat(22)}`]) {
    const res = await get(path);
    assert.equal(res.status, 404, path);
    assert.match(await res.text(), /You shall not pass/);
  }
  assert.equal((await post('/')).status, 405);
});

test('organizer personal link and invite link work from the admin page', async () => {
  const { page, invite } = await createEvent({ name: 'Links', organizer: 'Bilbo' });
  const joinPage = await (await get(`/join/${invite}`)).text();
  assert.match(joinPage, /Join the Fellowship/);
  assert.match(joinPage, /1 member has joined/);
  const meP = page.match(/\/me\/[\w-]{22}/)[0];
  assert.match(await (await get(meP)).text(), /Hail, Bilbo!/);
});

test('theme toggle and blocking theme script are present', async () => {
  const body = await (await get('/')).text();
  assert.match(body, /<script src="\/static\/theme.js\?v=[a-z0-9]+"><\/script>/);
  assert.match(body, /data-theme-toggle/);
  const res = await get('/static/theme.js');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /javascript/);
});

test('without the Boromir photo the site works and shows no meme', async () => {
  const body = await (await get('/')).text();
  assert.doesNotMatch(body, /data-meme=/);
  assert.doesNotMatch(body, /data-meme-open/);
  assert.equal((await get('/static/meme/boromir.jpg')).status, 404);
});

test('with the Boromir photo it is served and advertised to the page', async () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'meme-'));
  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  const memeStore = new Store(':memory:');
  const srv = http.createServer(createApp({ store: memeStore, memeDir: dir }));
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const b = `http://127.0.0.1:${srv.address().port}`;
  try {
    // Missing at first...
    assert.doesNotMatch(await (await fetch(`${b}/`)).text(), /data-meme=/);
    // ...then dropped in without a restart.
    fs.writeFileSync(path.join(dir, 'boromir.png'), png);
    const home = await (await fetch(`${b}/`)).text();
    assert.match(home, /data-meme="\/static\/meme\/boromir.png\?v=[a-z0-9]+"/);
    assert.match(home, /data-meme-open/);
    const img = await fetch(`${b}/static/meme/boromir.png`);
    assert.equal(img.status, 200);
    assert.equal(img.headers.get('content-type'), 'image/png');
    assert.deepEqual(Buffer.from(await img.arrayBuffer()), png);
    // Only the file that exists is served; other names stay 404.
    assert.equal((await fetch(`${b}/static/meme/boromir.jpg`)).status, 404);
    assert.equal((await fetch(`${b}/static/meme/secret.png`)).status, 404);
    assert.match(await (await fetch(`${b}/nope`)).text(), /data-meme=/, '404 page gets Boromir too');

    // Any filename works, including spaces and uppercase extensions; "boromir" names win.
    fs.rmSync(path.join(dir, 'boromir.png'));
    fs.writeFileSync(path.join(dir, 'Its a gift (1).JPG'), png);
    const page = await (await fetch(`${b}/`)).text();
    const src = page.match(/data-meme="([^"]+)"/)[1];
    assert.match(src, /^\/static\/meme\/Its%20a%20gift%20\(1\).JPG\?v=[a-z0-9]+$/);
    const jpg = await fetch(b + src);
    assert.equal(jpg.status, 200);
    assert.equal(jpg.headers.get('content-type'), 'image/jpeg');
    fs.writeFileSync(path.join(dir, 'zzz-boromir.webp'), png);
    assert.match(await (await fetch(`${b}/`)).text(), /data-meme="\/static\/meme\/zzz-boromir.webp\?v=/);
    // Non-images and traversal attempts are never served.
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'secret');
    for (const bad of ['notes.txt', '..%2Fserver.js', '%2E%2E%2F%2E%2E%2Fpackage.json', '%E0%A4%A']) {
      assert.equal((await fetch(`${b}/static/meme/${bad}`)).status, 404, bad);
    }
  } finally {
    srv.close();
    memeStore.close();
    fs.rmSync(dir, { recursive: true });
  }
});

test('everyone gets Boromir\'s blessing with a different saying, plus greetings and countdown', async () => {
  const { SAYINGS } = require('../src/lore');
  const { adminPath, invite, page } = await createEvent({ name: 'Blessed', organizer: 'Gandalf', date: '2026-12-20' });
  const me = { Gandalf: page.match(/\/me\/[\w-]{22}/)[0] };
  for (const n of ['Sam', 'Sméagol', 'Bob', 'Eowyn']) me[n] = await join(invite, n);

  const gandalf = await (await get(me.Gandalf)).text();
  assert.match(gandalf, /class="greeting">A gift-giver is never late/);
  assert.match(gandalf, /12 sleeps until the exchange/, 'today is 2026-12-08 in tests');
  assert.match(await (await get(me['Sméagol'])).text(), /We wants a gift, precious/);
  assert.doesNotMatch(await (await get(me.Bob)).text(), /class="greeting"/);

  await post(`${adminPath}/draw`);
  const sayings = [];
  for (const path of Object.values(me)) {
    const html = await (await get(path)).text();
    const m = html.match(/<p class="saying">([^<]+)<span>/); // no photo in tests: text blessing
    assert.ok(m, `${path} has a blessing`);
    sayings.push(m[1].replace(/&#39;/g, "'"));
  }
  assert.equal(new Set(sayings).size, sayings.length, 'all sayings differ');
  for (const s of sayings) assert.ok(SAYINGS.includes(s), s);
});

test('countdown shows the big day and disappears afterwards', async () => {
  const { invite: inv1 } = await createEvent({ name: 'Today', organizer: 'A', date: '2026-12-08' });
  const p1 = await join(inv1, 'B');
  assert.match(await (await get(p1)).text(), /The day has come/);
  const { invite: inv2 } = await createEvent({ name: 'Past', organizer: 'A', date: '2026-12-01' });
  const p2 = await join(inv2, 'B');
  assert.doesNotMatch(await (await get(p2)).text(), /class="countdown"/);
});

test('CSS/JS URLs carry a version so browsers never use stale files', async () => {
  const body = await (await get('/')).text();
  for (const f of ['style.css', 'app.js', 'theme.js']) {
    const m = body.match(new RegExp(`/static/${f.replace('.', '\\.')}\\?v=([a-z0-9]+)`));
    assert.ok(m, `${f} is versioned`);
    const res = await get(`/static/${f}?v=${m[1]}`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('cache-control'), /immutable/);
  }
  assert.equal((await get('/static/app.js')).headers.get('cache-control'), 'no-cache');
});

test('the Ring can be put on from every page, and Sauron has a voice', async () => {
  const { adminPath, invite, page } = await createEvent({ name: 'Ringed', organizer: 'Isildur' });
  const meP = page.match(/\/me\/[\w-]{22}/)[0];
  await join(invite, 'Elendil');
  await join(invite, 'Anarion');
  await post(`${adminPath}/draw`);
  for (const path of ['/', adminPath, `/join/${invite}`, meP, '/no-such-page']) {
    const html = await (await get(path)).text();
    assert.match(html, /class="logo-btn" aria-label="Put on the Ring"/, `${path}: header ring`);
    assert.match(html, /data-sauron="\/static\/sauron\.mp3\?v=[a-z0-9]+"/, `${path}: sound`);
  }
  const gift = await (await get(meP)).text();
  assert.match(gift, /class="ring reveal-ring" data-ring/, 'gift page ring');
  const res = await get('/static/sauron.mp3');
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'audio/mpeg');
  assert.ok((await res.arrayBuffer()).byteLength > 10000);
});
