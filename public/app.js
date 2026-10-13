'use strict';

(() => {
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Light / dark theme toggle (initial theme is set by theme.js in <head>).
  document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const root = document.documentElement;
      const next = root.dataset.theme === 'light' ? 'dark' : 'light';
      root.classList.add('theme-anim');
      root.dataset.theme = next;
      setTimeout(() => root.classList.remove('theme-anim'), 600);
      try { localStorage.setItem('its-a-gift:theme', next); } catch { /* storage unavailable */ }
    });
  });

  // Boromir. Only active when the server found the photo (public/meme/boromir.*).
  // `?boromir` in the URL summons him on purpose.
  const memeSrc = document.body.dataset.meme;
  const summoned = new URLSearchParams(location.search).has('boromir');
  const CAMEO_CHANCE = 0.2;
  const CAMEO_COOLDOWN_MS = 2 * 60 * 1000;

  function polaroid(caption, sub) {
    const fig = document.createElement('figure');
    fig.className = 'polaroid';
    const img = document.createElement('img');
    img.src = memeSrc;
    img.alt = 'Boromir holding up the One Ring: "It\'s a gift."';
    const cap = document.createElement('figcaption');
    cap.textContent = caption;
    if (sub) {
      const small = document.createElement('small');
      small.textContent = sub;
      cap.append(small);
    }
    fig.append(img, cap);
    return fig;
  }

  let dialog;
  function openMeme() {
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.className = 'meme-dialog';
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'meme-close';
      close.setAttribute('aria-label', 'Close');
      close.textContent = '\u00d7';
      close.addEventListener('click', () => dialog.close());
      dialog.append(close, polaroid('\u201cIt\'s a gift.\u201d', 'Boromir, son of Denethor, Captain of the White Tower'));
      // Click on the backdrop closes it.
      dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
      document.body.append(dialog);
    }
    dialog.showModal();
  }

  if (memeSrc) {
    document.querySelectorAll('[data-meme-open]').forEach((b) => b.addEventListener('click', openMeme));

    // Now and then Boromir peeks in from the corner.
    let last = 0;
    try { last = Number(sessionStorage.getItem('its-a-gift:cameo')) || 0; } catch { /* ignore */ }
    const due = Date.now() - last > CAMEO_COOLDOWN_MS && Math.random() < CAMEO_CHANCE;
    if (summoned || due) {
      try { sessionStorage.setItem('its-a-gift:cameo', String(Date.now())); } catch { /* ignore */ }
      const cameo = document.createElement('button');
      cameo.type = 'button';
      cameo.className = 'cameo polaroid';
      cameo.setAttribute('aria-label', 'Boromir has something to say. Click to see.');
      const img = document.createElement('img');
      img.src = memeSrc;
      img.alt = '';
      const bubble = document.createElement('span');
      bubble.className = 'bubble';
      bubble.textContent = 'It\'s a gift.';
      cameo.append(img, bubble);
      const hide = () => {
        cameo.classList.remove('show');
        setTimeout(() => cameo.remove(), 900);
      };
      cameo.addEventListener('click', () => { hide(); openMeme(); });
      const show = () => {
        document.body.append(cameo);
        setTimeout(() => cameo.classList.add('show'), 50);
        setTimeout(hide, 9000);
      };
      // The image preloads while we wait; appear after a moment, once it's ready.
      setTimeout(() => {
        if (img.complete && img.naturalWidth) show();
        else img.addEventListener('load', show, { once: true });
      }, summoned ? 600 : 3000 + Math.random() * 5000);
    }
  }

  // One-time messages (?msg=joined etc.) shouldn't stick to bookmarked links.
  const params = new URLSearchParams(location.search);
  if (params.has('msg')) {
    params.delete('msg');
    const qs = params.toString();
    history.replaceState(null, '', location.pathname + (qs ? `?${qs}` : '') + location.hash);
  }

  // Copy buttons next to read-only link fields.
  document.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const input = btn.parentElement.querySelector('input');
      try {
        await navigator.clipboard.writeText(input.value);
      } catch {
        input.select();
        document.execCommand('copy');
      }
      const old = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = old; }, 1500);
    });
  });

  // Confirmation for destructive / irreversible actions.
  document.querySelectorAll('form[data-confirm]').forEach((form) => {
    form.addEventListener('submit', (e) => {
      if (!window.confirm(form.dataset.confirm)) e.preventDefault();
    });
  });

  // Reveal animation: the ring is "forged", then the recipient appears.
  const revealBtn = document.querySelector('[data-reveal]');
  if (revealBtn) {
    const section = revealBtn.closest('.reveal');
    const sealed = section.querySelector('.sealed');
    const revealed = section.querySelector('.revealed');
    const ring = section.querySelector('.reveal-ring');
    revealBtn.addEventListener('click', () => {
      revealBtn.disabled = true;
      ring.classList.add('forging');
      setTimeout(() => {
        sealed.hidden = true;
        revealed.hidden = false;
        section.classList.add('burst');
      }, reducedMotion() ? 0 : 1500);
    });
  }

  // ── Easter eggs ──

  function toast(text) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.textContent = text;
    document.body.append(el);
    setTimeout(() => el.classList.add('gone'), 3800);
    setTimeout(() => el.remove(), 4600);
  }

  // Put on the Ring: clicking any ring (header logo, home, invite, gift page) slips you into
  // the wraith-world, and the Eye of Sauron finds you.
  const root = document.documentElement;
  let voice;
  function putOnTheRing() {
    if (root.classList.contains('wraith')) return;
    root.classList.add('wraith');

    const eye = document.createElement('div');
    eye.className = 'sauron';
    eye.setAttribute('role', 'alert');
    const pupil = document.createElement('div');
    pupil.className = 'sauron-eye';
    const words = document.createElement('p');
    words.className = 'sauron-words';
    words.textContent = 'I see you';
    const sub = document.createElement('p');
    sub.className = 'sauron-sub';
    sub.textContent = 'You put on the Ring. The Eye has found you.';
    eye.append(pupil, words, sub);
    document.body.append(eye);

    const src = document.body.dataset.sauron;
    if (src) {
      voice = voice || new Audio(src);
      voice.volume = 0.8;
      voice.currentTime = 0;
      voice.play().catch(() => { /* sound blocked or unavailable: the Eye still sees you */ });
    }

    setTimeout(() => eye.classList.add('gone'), 2700);
    setTimeout(() => {
      eye.remove();
      root.classList.remove('wraith');
    }, 3400);
  }
  document.querySelectorAll('[data-ring]').forEach((r) => {
    r.addEventListener('click', (e) => {
      e.preventDefault();
      putOnTheRing();
    });
  });

  // "Speak, friend, and enter": typing "mellon" anywhere, even inside a form field, wakes the inscription.
  let typed = '';
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
    typed = (typed + e.key.toLowerCase()).slice(-6);
    if (typed === 'mellon') {
      typed = '';
      root.classList.add('ring-awake');
      toast('The Doors of Durin open. Welcome, friend.');
      setTimeout(() => root.classList.remove('ring-awake'), 5000);
    }
  });

  console.log('%cOne does not simply walk into the dev tools.',
    'font: bold 16px Georgia, serif; color: #d9a93a; text-shadow: 0 0 6px #ff8a2a;');
  console.log('%c…but since you are here: speak, friend, and enter.', 'font: italic 13px Georgia, serif; color: #8a7a5a;');

  // Remember the personal link per event, so the invite page can say "welcome back".
  const key = (invite) => `its-a-gift:${invite}`;
  const remember = document.getElementById('remember');
  if (remember) {
    try {
      localStorage.setItem(key(remember.dataset.invite),
        JSON.stringify({ name: remember.dataset.name, url: remember.dataset.url }));
    } catch { /* storage unavailable */ }
  }

  const welcome = document.getElementById('welcome-back');
  if (welcome) {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(key(welcome.dataset.invite))); } catch { /* ignore */ }
    if (saved && typeof saved.name === 'string' && typeof saved.url === 'string') {
      let url;
      try { url = new URL(saved.url, location.href); } catch { url = null; }
      if (url && /^https?:$/.test(url.protocol) && url.pathname.startsWith('/me/')) {
        welcome.append(`Welcome back, ${saved.name}! You already joined. `);
        const a = document.createElement('a');
        a.href = url.href;
        a.textContent = 'Open your personal page →';
        welcome.append(a);
        welcome.hidden = false;
      }
    }
  }
})();
