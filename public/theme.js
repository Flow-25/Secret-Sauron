'use strict';

// Loaded blocking in <head> so the right theme is applied before first paint.
(() => {
  let theme;
  try { theme = localStorage.getItem('its-a-gift:theme'); } catch { /* storage unavailable */ }
  if (theme !== 'light' && theme !== 'dark') {
    theme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  document.documentElement.dataset.theme = theme;
})();
