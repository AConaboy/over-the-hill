/* Carry on from the last page rather than starting over: the rays at the
   angle the clock gives (so they keep turning across pages), and the ball
   spinning straight away if it already has this visit (it's cached by
   then). Inlined straight after the poster (Poster.astro), so it's done
   before the first paint; its hash is in the Content Security Policy
   (astro.config.mjs). */
(function () {
  if ((window.othMotion || matchMedia('(prefers-reduced-motion: reduce)')).matches) return;
  var spin = document.querySelector('.sunrise-rays .spin');
  var turn = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ray-speed')) * 1000 || 36000;
  if (spin) spin.style.animationDelay = -(Date.now() % turn) + 'ms';
  var ball = document.querySelector('.poster-ball');
  try { if (ball && sessionStorage.getItem('oth-ball-spinning') === '1') ball.src = ball.dataset.spin; } catch (e) {}
})();
