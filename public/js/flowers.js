/*
  Jess Porter's flowers and tulips, moving in the poster (from the flower
  ideas made in Claude Design).

  The illustration has them cut out; they're separate pieces on top
  (Poster.astro), so at rest the poster is exactly as drawn, and they can
  move as much as they like without anything odd showing behind them.

  Each piece is a little spring. Moving the pointer near the poster pushes
  the pieces near it along with it, harder the faster it moves and the
  closer it passes (a tap flicks them away from it), and they swing back
  with some overshoot, the flowers from their middles and the tulips from
  the foot of their stems. Every so often, like the butterfly's resting
  flaps, a Mexican wave runs through them from left to right on its own.

  It only runs while something's moving: no animation frames at rest, and
  the wave waits while the poster is off screen or the tab is hidden.
  Nothing moves for reduced motion.
*/
(function () {
  var box = document.querySelector('[data-poster-pieces]');
  if (!box) return;
  var art = box.parentNode;                         // .poster-illustration
  var motion = matchMedia('(prefers-reduced-motion: reduce)');

  // tuning: stiffness and damping (per second)
  var K = 70, DAMP = 7;
  var pieces = Array.prototype.map.call(box.querySelectorAll('.poster-piece:not(.grass-front)'), function (el) {
    var tulip = el.classList.contains('tulip');
    return {
      el: el, tulip: tulip,
      max: tulip ? 22 : 38,                          // how far it may lean, in degrees
      push: tulip ? 0.7 : 1,                         // tulips are stiffer to push
      x: 0, y: 0,                                    // where it is, as fractions of the drawing
      a: 0, v: 0,                                    // lean (degrees) and how fast it's changing
      queued: []                                     // shoves still to come (the wave)
    };
  });

  // Where the drawing and each piece are on the page, measured only when
  // that can change (loading, resizing), never per pointer move: measuring
  // then would make the browser recalculate what the butterfly has just
  // changed.
  var page = null;
  function measure() {
    var r = art.getBoundingClientRect();
    page = { left: r.left + scrollX, top: r.top + scrollY, width: r.width, height: r.height };
    pieces.forEach(function (p) {
      var e = p.el.getBoundingClientRect();
      p.x = (e.left + e.width / 2 - r.left) / r.width;
      p.y = (e.top + e.height * (p.tulip ? 0.2 : 0.5) - r.top) / r.height;   // tulips: by their heads
    });
  }

  // ---- the springs --------------------------------------------------------------
  var running = false, lastT = 0;
  function frame(now) {
    var dt = Math.min((now - lastT) / 1000, 0.05);
    lastT = now;
    var busy = false;
    pieces.forEach(function (p) {
      while (p.queued.length && p.queued[0].at <= now) p.v += p.queued.shift().dv;
      // a damped spring back to upright
      p.v += (-K * p.a - DAMP * p.v) * dt;
      p.a += p.v * dt;
      if (p.a > p.max) { p.a = p.max; p.v = Math.min(p.v, 0); }
      if (p.a < -p.max) { p.a = -p.max; p.v = Math.max(p.v, 0); }
      if (Math.abs(p.a) < 0.05 && Math.abs(p.v) < 0.5 && !p.queued.length) { p.a = 0; p.v = 0; }
      else busy = true;
      // flowers also swell a touch as they lean; tulips just sway
      p.el.style.transform = p.a === 0 ? '' : 'rotate(' + p.a.toFixed(2) + 'deg)' + (p.tulip ? '' : ' scale(' + (1 + Math.abs(p.a) / 320).toFixed(3) + ')');
    });
    if (busy) requestAnimationFrame(frame);
    else running = false;
  }
  function wake() {
    if (running) return;
    running = true;
    lastT = performance.now();
    requestAnimationFrame(frame);
  }

  // ---- the pointer ---------------------------------------------------------------
  var last = null;
  function onPointer(e) {
    if (motion.matches || !page) return;
    var tap = e.type === 'pointerdown';
    if (!tap && e.pointerType === 'touch') return;   // a finger only counts when it taps, not while it scrolls
    var now = performance.now();
    var px = e.clientX - (page.left - scrollX), py = e.clientY - (page.top - scrollY);   // relative to the drawing
    var W = page.width, H = page.height, reach = W * 0.6;
    var prev = last; last = { x: px, y: py, t: now };
    // nearby: the drawing and a margin around it
    if (px < -reach || px > W + reach || py < -reach || py > H + reach) return;
    var vx = 0, vy = 0;
    if (!tap && prev && now - prev.t < 100) {
      var gap = Math.max(now - prev.t, 8);
      vx = (px - prev.x) / gap; vy = (py - prev.y) / gap;      // px per ms
    }
    var moved = false;
    pieces.forEach(function (p) {
      var dx = p.x * W - px, dy = p.y * H - py, d = Math.hypot(dx, dy);
      if (d > reach) return;
      var near = 1 - d / reach;
      var side = dx >= 0 ? 1 : -1;
      // swept along with the pointer, and harder the faster it goes (a
      // quick swipe really throws them); a tap flicks them away from it
      var sweep = vx + side * Math.abs(vy) * 0.35;
      var dv = tap ? side * 420 * near : (sweep < 0 ? -1 : 1) * Math.pow(Math.abs(sweep), 1.35) * 150 * near;
      if (Math.abs(dv) < 1) return;
      p.v += Math.max(-700, Math.min(700, dv * p.push));
      moved = true;
    });
    if (moved) wake();
  }

  // ---- the wave, every so often ----------------------------------------------------
  var waveTimer = 0;
  function onScreen() {
    if (!page || document.hidden) return false;
    var top = page.top - scrollY;
    return top < innerHeight && top + page.height > 0;
  }
  function runWave(strength) {
    var now = performance.now();
    // left to right, each in turn: a tip forward, and the spring does the rest
    pieces.forEach(function (p) {
      p.queued.push({ at: now + p.x * 1400, dv: strength * p.push });
      p.queued.sort(function (a, b) { return a.at - b.at; });
    });
    wake();
  }
  function wave() {
    if (!motion.matches && onScreen()) runWave(190);
    scheduleWave();
  }

  // The celebration after paying (butterfly.js sends it): a bigger wave,
  // now if the poster's in view, or as soon as it scrolls into view.
  var celebrating = false;
  function celebrationWave() {
    if (!celebrating || !onScreen()) return;
    celebrating = false;
    removeEventListener('scroll', celebrationWave);
    runWave(300);
    setTimeout(function () { runWave(300); }, 1600);
  }
  document.addEventListener('overthehill:celebrate', function () {
    if (motion.matches) return;
    celebrating = true;
    addEventListener('scroll', celebrationWave, { passive: true });
    celebrationWave();
  });
  function scheduleWave() {
    clearTimeout(waveTimer);
    waveTimer = setTimeout(wave, 7000 + Math.random() * 5000);
  }

  addEventListener('resize', measure);
  addEventListener('load', measure);
  addEventListener('pointermove', onPointer, { passive: true });
  addEventListener('pointerdown', onPointer, { passive: true });
  motion.addEventListener('change', function () {
    if (motion.matches) {
      clearTimeout(waveTimer);
      pieces.forEach(function (p) { p.a = 0; p.v = 0; p.queued = []; p.el.style.transform = ''; });
    } else scheduleWave();
  });
  measure();
  if (!motion.matches) scheduleWave();
})();
