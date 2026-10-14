'use strict';

const lore = require('./lore');
const { asset } = require('./assets');

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

const MESSAGES = {
  created: 'The Fellowship is forged! Share the invite link with your companions.',
  joined: 'Welcome to the Fellowship! Bookmark this page. It is your personal, secret link.',
  saved: 'Your wishlist has been inscribed.',
  removed: 'The member has left the Fellowship.',
  excl_added: 'Exclusion added. Those two will not draw each other.',
  excl_removed: 'Exclusion removed.',
  drawn: 'The lots are cast! Every member can now open their personal link to see who they give to.',
  already_drawn: 'The lots were already cast.',
  reset: 'The draw has been undone. You can cast lots again.',
};

// Every ring carries data-ring: clicking any of them puts the Ring on (see public/app.js).
function ring({ id = 'r', cls = '' } = {}) {
  const words = "it's a gift · ".repeat(3);
  return `<svg class="ring ${cls}" data-ring viewBox="0 0 200 200" aria-hidden="true">
  <defs>
    <linearGradient id="${id}-gold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fff3b0"/><stop offset=".35" stop-color="#e2b13c"/>
      <stop offset=".7" stop-color="#9a6b12"/><stop offset="1" stop-color="#f5d26b"/>
    </linearGradient>
    <path id="${id}-path" d="M100,100 m-63,0 a63,63 0 1,1 126,0 a63,63 0 1,1 -126,0"/>
  </defs>
  <circle cx="100" cy="100" r="68" fill="none" stroke="url(#${id}-gold)" stroke-width="24"/>
  <circle cx="100" cy="100" r="80" fill="none" stroke="#fff6c8" stroke-opacity=".35" stroke-width="1.5"/>
  <text class="inscription"><textPath href="#${id}-path" textLength="392" lengthAdjust="spacing">${words}</textPath></text>
</svg>`;
}

const SUN = '<svg class="icon-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/><path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1"/></svg>';
const MOON = '<svg class="icon-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z"/></svg>';

function layout(title, body, { bodyClass = '', meme = null } = {}) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta name="color-scheme" content="dark light">
<script src="${asset('theme.js')}"></script>
<title>${esc(title)} · Secret Gandalf</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700&family=EB+Garamond:ital@0;1&display=swap">
<link rel="stylesheet" href="${asset('style.css')}">
<link rel="icon" href="${asset('favicon.svg')}" type="image/svg+xml">
<script src="${asset('app.js')}" defer></script>
</head>
<body class="${esc(bodyClass)}" data-sauron="${asset('sauron.mp3')}"${meme ? ` data-meme="${esc(meme)}"` : ''}>
<div class="embers" aria-hidden="true">${'<i></i>'.repeat(16)}</div>
<header class="site-header">
  <div class="brand">
    <button type="button" class="logo-btn" aria-label="Put on the Ring">${ring({ id: 'logo', cls: 'logo' })}</button>
    <a href="/">Secret Gandalf</a>
  </div>
  <button type="button" class="theme-toggle" data-theme-toggle aria-label="Switch between light and dark theme" title="Light of Eärendil / Shadow of Mordor">${SUN}${MOON}</button>
</header>
<main class="wrap">
${body}
</main>
<footer class="site-footer">
  <p>${meme ? '<button type="button" class="quote-btn" data-meme-open title="Behold&hellip;">&ldquo;It\'s a gift.&rdquo;</button>' : '<em>&ldquo;It\'s a gift.&rdquo;</em>'} &mdash; Boromir, son of Denethor</p>
  <p class="small">A fan-made Secret Santa for friends. Not affiliated with the Tolkien Estate or anyone in Mordor.</p>
</footer>
</body>
</html>`;
}

const flash = (msg) => (MESSAGES[msg] ? `<div class="flash">${esc(MESSAGES[msg])}</div>` : '');
const errorBox = (err) => (err ? `<div class="flash error" role="alert">${esc(err)}</div>` : '');

function copyField(label, url) {
  return `<div class="copy-field">
  <label>${esc(label)}</label>
  <div class="copy-row"><input type="text" readonly value="${esc(url)}"><button type="button" class="btn small" data-copy>Copy</button></div>
</div>`;
}

function eventMeta(ev) {
  const bits = [];
  if (ev.budget) bits.push(`<span>💰 Budget: <strong>${esc(ev.budget)}</strong></span>`);
  if (ev.exchange_date) bits.push(`<span>📅 Exchange: <strong>${esc(ev.exchange_date)}</strong></span>`);
  return bits.length ? `<p class="meta">${bits.join('')}</p>` : '';
}

function home({ error, values = {}, meme } = {}) {
  return layout('Secret Santa for your Fellowship', `
<section class="hero">
  ${ring({ id: 'hero', cls: 'hero-ring' })}
  <h1>Secret Gandalf</h1>
  <div class="ornament" aria-hidden="true"><span>✦</span></div>
  <p class="tagline">A Secret Santa for your Fellowship</p>
  <blockquote>One does not simply walk into Christmas&hellip; without a gift.</blockquote>
</section>

<section class="card">
  <h2>Forge a Fellowship</h2>
  ${errorBox(error)}
  <form method="post" action="/events" class="form">
    <label>Name of the Fellowship
      <input name="name" required maxlength="80" placeholder="The Fellowship of the Gift" value="${esc(values.name)}">
    </label>
    <label>Your name
      <input name="organizer" required maxlength="40" placeholder="Boromir" value="${esc(values.organizer)}">
    </label>
    <div class="grid2">
      <label><span class="label-text">Gift budget <span class="opt">(optional)</span></span>
        <input name="budget" maxlength="40" placeholder="e.g. 100 PLN" value="${esc(values.budget)}">
      </label>
      <label><span class="label-text">Exchange date <span class="opt">(optional)</span></span>
        <input name="date" type="date" value="${esc(values.date)}">
      </label>
    </div>
    <label class="check"><input type="checkbox" name="joins" value="1" ${values.joins === false ? '' : 'checked'}> I am also taking part in the draw</label>
    <button class="btn primary" type="submit">Forge the Fellowship</button>
  </form>
</section>

<section class="steps">
  <div><span>I</span><h3>Forge</h3><p>Create your Fellowship and get a secret organizer link.</p></div>
  <div><span>II</span><h3>Gather</h3><p>Share the invite link. Friends join and write their wishlists.</p></div>
  <div><span>III</span><h3>Cast lots</h3><p>Draw names. Each member secretly learns whom they give to.</p></div>
</section>`, { bodyClass: 'home', meme });
}

function admin({ ev, participants, exclusions, base, msg, error, meme }) {
  const drawn = Boolean(ev.drawn_at);
  const organizer = participants.find((p) => p.is_organizer);
  const rows = participants.map((p) => `
    <li class="member">
      <div class="member-main">
        <strong>${esc(p.name)}</strong>${p.is_organizer ? ' <span class="badge">organizer</span>' : ''}
        <span class="muted">${p.wishlist.trim() ? '📜 wishlist written' : 'no wishlist yet'}</span>
      </div>
      <details><summary>Personal link</summary>
        <p class="small muted">Only resend this if they lost their link. Opening it reveals their draw.</p>
        ${copyField('', `${base}/me/${p.token}`)}
      </details>
      ${drawn ? '' : `<form method="post" action="/admin/${esc(ev.admin_token)}/remove" data-confirm="Remove ${esc(p.name)} from the Fellowship?">
        <input type="hidden" name="id" value="${p.id}"><button class="btn small ghost" type="submit">Remove</button></form>`}
    </li>`).join('');

  const options = (sel) => participants
    .map((p, i) => `<option value="${p.id}"${i === sel ? ' selected' : ''}>${esc(p.name)}</option>`).join('');
  const exclRows = exclusions.map((x) => `
    <li><span>${esc(x.a_name)} ⟷ ${esc(x.b_name)}</span>
      ${drawn ? '' : `<form method="post" action="/admin/${esc(ev.admin_token)}/exclusions/delete">
        <input type="hidden" name="a" value="${x.a_id}"><input type="hidden" name="b" value="${x.b_id}">
        <button class="btn small ghost" type="submit">Remove</button></form>`}
    </li>`).join('');

  const drawSection = drawn
    ? `<p class="success">🔥 The lots were cast on ${esc(ev.drawn_at)} UTC. Every member can now open their personal link.</p>
       <form method="post" action="/admin/${esc(ev.admin_token)}/reset" data-confirm="Undo the draw? Everyone's assignment will be erased and you'll need to draw again.">
         <button class="btn ghost" type="submit">Undo the draw</button>
       </form>`
    : `<p class="wizard">A wizard is never late, nor is he early. He casts the lots precisely when he means to.</p>
       <p>When everyone has joined, cast the lots. After that the Fellowship is sealed: nobody can join or leave.</p>
       <form method="post" action="/admin/${esc(ev.admin_token)}/draw" data-confirm="Cast lots now for ${participants.length} members?">
         <button class="btn primary" type="submit" ${participants.length < 3 ? 'disabled' : ''}>Cast lots</button>
       </form>
       ${participants.length < 3 ? '<p class="small muted">At least 3 members are needed.</p>' : ''}`;

  return layout(`Organizer · ${ev.name}`, `
<h1>${esc(ev.name)}</h1>
${eventMeta(ev)}
${flash(msg)}${errorBox(error)}

<section class="card">
  <h2>Organizer's chamber</h2>
  <p class="warn">🔑 <em>Keep it secret. Keep it safe.</em> This page is your organizer link. Bookmark it and don't share it.</p>
  ${drawn ? '' : copyField('Invite link (send this to your friends)', `${base}/join/${ev.invite_token}`)}
  ${organizer ? copyField(`Your own personal link (as ${organizer.name})`, `${base}/me/${organizer.token}`) : ''}
</section>

<section class="card">
  <h2>The Fellowship <span class="count">${participants.length}</span></h2>
  ${participants.length ? `<ul class="members">${rows}</ul>` : '<p class="muted">No one has joined yet. Send the invite link!</p>'}
</section>

<section class="card">
  <h2>Exclusions</h2>
  <p class="muted small">Pairs who should not draw each other, e.g. couples.</p>
  ${exclRows ? `<ul class="exclusions">${exclRows}</ul>` : (drawn ? '<p class="muted">No exclusions were set.</p>' : '')}
  ${drawn || participants.length < 2 ? '' : `<form method="post" action="/admin/${esc(ev.admin_token)}/exclusions" class="excl-form">
    <select name="a" required aria-label="First member">${options(0)}</select><span>⟷</span><select name="b" required aria-label="Second member">${options(1)}</select>
    <button class="btn small" type="submit">Add</button>
  </form>`}
</section>

<section class="card">
  <h2>Cast lots</h2>
  ${drawSection}
</section>`, { meme });
}

function join({ ev, count, error, values = {}, meme }) {
  const locked = Boolean(ev.drawn_at);
  return layout(`Join ${ev.name}`, `
<section class="hero small-hero">
  ${ring({ id: 'join' })}
  <h1>${esc(ev.name)}</h1>
  <div class="ornament" aria-hidden="true"><span>✦</span></div>
  <p class="tagline">You have been summoned to a Secret Santa.</p>
  ${eventMeta(ev)}
  <p class="muted">${count} ${count === 1 ? 'member has' : 'members have'} joined so far.</p>
</section>
<div id="welcome-back" class="flash" hidden data-invite="${esc(ev.invite_token)}"></div>
${locked
    ? `<section class="card"><h2>The Fellowship has already set out</h2>
       <p>The lots have been cast, so no new members can join. Ask the organizer if you think you should be in.</p></section>`
    : `<section class="card">
  <h2>Join the Fellowship</h2>
  ${errorBox(error)}
  <form method="post" action="/join/${esc(ev.invite_token)}" class="form">
    <label>Your name
      <input name="name" required maxlength="40" placeholder="Samwise" value="${esc(values.name)}">
    </label>
    <label><span class="label-text">Your wishlist <span class="opt">(optional, you can edit it later)</span></span>
      <textarea name="wishlist" rows="5" maxlength="2000" placeholder="Second breakfast supplies, a good rope, po-tay-toes&hellip;">${esc(values.wishlist)}</textarea>
    </label>
    <button class="btn primary" type="submit">Join the Fellowship</button>
  </form>
</section>`}`, { meme });
}

function blessing(saying, meme) {
  return meme
    ? `<figure class="polaroid meme-reveal">
      <img src="${esc(meme)}" alt="Boromir holding up the One Ring: &quot;It's a gift.&quot;">
      <figcaption>${esc(saying)}</figcaption>
    </figure>`
    : `<p class="saying">${esc(saying)}<span>Boromir, son of Denethor</span></p>`;
}

function me({ p, ev, recipient, base, msg, meme, saying, today }) {
  const drawn = Boolean(ev.drawn_at && recipient);
  const greeting = lore.greetingFor(p.name);
  const countdown = lore.countdownText(lore.daysUntil(ev.exchange_date, today));
  const reveal = drawn
    ? `<section class="card reveal" id="reveal">
  <div class="sealed">
    ${ring({ id: 'reveal', cls: 'reveal-ring' })}
    <p>The lots are cast. Your quest awaits.</p>
    <button type="button" class="btn primary" data-reveal>Reveal my quest</button>
  </div>
  <div class="revealed" hidden>
    ${blessing(saying, meme)}
    <p class="quote">&ldquo;It's a gift&hellip;&rdquo;</p>
    <p>You bear a gift for</p>
    <h2 class="recipient">${esc(recipient.name)}</h2>
    ${eventMeta(ev)}
    <h3>Their wishlist</h3>
    ${recipient.wishlist.trim()
    ? `<div class="wishlist">${esc(recipient.wishlist)}</div>`
    : '<p class="muted">They have not written a wishlist yet. Check back later, or do as Gandalf would: bring fireworks.</p>'}
    <p class="small muted">Keep it secret. Keep it safe.</p>
  </div>
</section>`
    : `<section class="card waiting">
  <h2>Awaiting the casting of lots</h2>
  <p>The organizer hasn't drawn names yet. Come back to this page later to discover whom you bear a gift for.</p>
  <blockquote class="wizard">&ldquo;All we have to decide is what to do with the time that is given us.&rdquo;<span>Gandalf the Grey</span></blockquote>
</section>`;

  return layout(`${p.name} · ${ev.name}`, `
<h1>Hail, ${esc(p.name)}!</h1>
${greeting ? `<p class="greeting">${esc(greeting)}</p>` : ''}
<p class="tagline">Member of <strong>${esc(ev.name)}</strong></p>
${eventMeta(ev)}
${countdown ? `<p class="countdown">⏳ ${esc(countdown)}</p>` : ''}
${flash(msg)}
<div id="remember" hidden data-invite="${esc(ev.invite_token)}" data-name="${esc(p.name)}" data-url="${esc(`${base}/me/${p.token}`)}"></div>
${reveal}
<section class="card">
  <h2>Your wishlist</h2>
  <p class="muted small">Your Secret Santa always sees the latest version.</p>
  <form method="post" action="/me/${esc(p.token)}/wishlist" class="form">
    <textarea name="wishlist" rows="6" maxlength="2000" placeholder="What would you like? Sizes, links, hobbies&hellip;">${esc(p.wishlist)}</textarea>
    <button class="btn" type="submit">Save wishlist</button>
  </form>
</section>
<section class="card">
  <h2>Your secret link</h2>
  <p class="warn">🔑 This link is yours alone. Anyone who has it can see your draw.</p>
  ${copyField('', `${base}/me/${p.token}`)}
</section>`, { meme });
}

function notFound({ meme } = {}) {
  return layout('You shall not pass', `
<section class="hero">
  <h1 class="big">You shall not pass!</h1>
  <p class="tagline">This path does not exist, or the link is wrong.</p>
  <p class="muted">&mdash; Gandalf the Grey, standing guard over broken links</p>
  <p><a class="btn" href="/">Return to the Shire</a></p>
</section>`, { meme });
}

function serverError() {
  return layout('Something went wrong', `
<section class="hero">
  <h1>Fly, you fools!</h1>
  <p class="tagline">Something went wrong on our side. Please try again in a moment.</p>
  <p><a class="btn" href="/">Return to the Shire</a></p>
</section>`);
}

module.exports = { esc, home, admin, join, me, notFound, serverError, MESSAGES };
