/* "Pause animations": the butterfly, the flowers, the turning rays, the
   spinning disco balls and the pulsing RSVP button all keep still while
   it's on, as they do for the device's reduced-motion setting (WCAG 2.2.2:
   moving content must be able to be paused). Remembered on this browser.

   Inlined at the top of every page (Layout.astro), so the choice applies
   before the first paint; its hash is in the Content Security Policy
   (astro.config.mjs). The other scripts read window.othMotion, which
   behaves like matchMedia('(prefers-reduced-motion: reduce)'): .matches is
   true when either is on, and 'change' fires when either changes. */
(function () {
  var KEY = 'oth-motion-paused';
  var root = document.documentElement;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)');
  var listeners = [];
  var paused = false;
  try { paused = localStorage.getItem(KEY) === '1'; } catch (e) {}

  function apply() {
    if (paused) root.setAttribute('data-motion', 'paused'); else root.removeAttribute('data-motion');
    // the header logo is an animated image: show its still frame instead
    document.querySelectorAll('img[data-still-src]').forEach(function (img) {
      if (!img.dataset.moveSrc) img.dataset.moveSrc = img.getAttribute('src');
      img.src = paused ? img.dataset.stillSrc : img.dataset.moveSrc;
    });
    document.querySelectorAll('[data-motion-toggle]').forEach(function (button) {
      button.textContent = paused ? 'Play animations' : 'Pause animations';
      // nothing moves anyway with the device's reduced-motion setting
      button.hidden = reduce.matches;
    });
  }
  function notify() { listeners.forEach(function (fn) { try { fn(); } catch (e) {} }); }

  window.othMotion = {
    get matches() { return paused || reduce.matches; },
    addEventListener: function (type, fn) { if (type === 'change') listeners.push(fn); },
  };
  reduce.addEventListener('change', function () { apply(); notify(); });

  document.addEventListener('click', function (event) {
    var button = event.target.closest && event.target.closest('[data-motion-toggle]');
    if (!button) return;
    paused = !paused;
    try { localStorage.setItem(KEY, paused ? '1' : '0'); } catch (e) {}
    apply();
    notify();
  });

  if (paused) root.setAttribute('data-motion', 'paused');
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply); else apply();
})();
