/*
  Jess Porter's flowers, moving (from the flower ideas made in Claude Design).

  1. The Mexican wave, in the poster. The flowers stay drawn in the poster
     illustration; a copy of each sits exactly on top, hidden, and only
     shows while it waves, so at rest you see Jess's drawing untouched. As
     the pointer moves near the poster (or on a tap, on touch screens), a
     ripple runs out from it: each flower within reach tips away from the
     pointer and back, the nearest first. A flower won't start again while
     it's still waving. The copies grow slightly as they tip, so they keep
     covering the drawn flower beneath (anything peeking out is petal).

  2. The flower shower, a celebration after an action, never on its own:
     - [data-shower] links: an in-page one (the invite page's "RSVP now ↓")
       showers straight away; one to another page (the homepage's RSVP
       button, the header's) showers when that page opens, so the click
       isn't held up;
     - [data-shower] forms (the RSVP form, Pay deposit): the page they end
       up on showers if it marks itself [data-celebrate] (thanks, you're on
       the list, or just paid), including after a trip to Stripe.
     Flowers tumble down the screen at 12 fps, like the butterfly, then
     tidy themselves away.

  Both stay still for reduced motion. Loaded on every page but admin.
*/
(function () {
  var motion = matchMedia('(prefers-reduced-motion: reduce)');
  var DIR = '/images/flowers/';
  var KEY = 'oth-shower';                     // sessionStorage: "nav" or "submit"

  // ---- 1. the wave ------------------------------------------------------------
  // Where each flower is drawn in the poster illustration, as percentages of
  // its box (the Poster component's .poster-illustration).
  var POSTER_FLOWERS = [
    ['flower-01', 22.218, 46.127, 9.465], ['flower-02', 27.196, 45.674, 10.695],
    ['flower-03', 29.040, 53.328, 10.203], ['flower-04', 22.156, 53.781, 9.527],
    ['flower-05', 16.317, 58.174, 11.678], ['flower-06', 6.790, 60.031, 11.616],
    ['flower-07', 10.663, 65.058, 11.739], ['flower-small-08', 76.305, 86.843, 7.007],
    ['flower-small-09', 78.333, 84.080, 7.929], ['flower-small-10', 82.328, 83.581, 7.191]
  ];
  var WAVE_MS = 1100;

  function setUpWave() {
    var box = document.querySelector('.poster-illustration');
    if (!box || !box.animate) return;
    var layer = document.createElement('div');
    layer.className = 'poster-flowers';
    layer.setAttribute('aria-hidden', 'true');
    var flowers = POSTER_FLOWERS.map(function (f) {
      var img = document.createElement('img');
      img.className = 'poster-flower';
      img.alt = '';
      img.decoding = 'async';
      img.src = DIR + f[0] + '.webp';
      img.style.left = f[1] + '%';
      img.style.top = f[2] + '%';
      img.style.width = f[3] + '%';
      layer.appendChild(img);
      return { el: img, x: f[1] + f[3] / 2, y: f[2] + f[3] * 0.65, busyUntil: 0 };
    });
    box.appendChild(layer);

    // Where the drawing is on the page, measured only when that can change
    // (loading, resizing), not on every pointer move: measuring then would
    // make the browser recalculate styles the butterfly has just changed.
    var page = null;
    function measure() {
      var b = box.getBoundingClientRect();
      page = { left: b.left + scrollX, top: b.top + scrollY, width: b.width, height: b.height };
    }
    measure();
    addEventListener('resize', measure);
    addEventListener('load', measure);

    // Checked straight from the pointer event, at most every 60 ms, rather
    // than in an animation frame: asking for a frame on every move would
    // keep the browser redrawing the page (the turning rays and all).
    var point = null, lastCheck = 0;
    function ripple() {
      if (!point || motion.matches) return;
      var now = performance.now();
      var r = { left: page.left - scrollX, top: page.top - scrollY, width: page.width, height: page.height };
      var pad = r.width * 0.3;                             // "nearby": a little beyond the drawing
      if (point.x < r.left - pad || point.x > r.left + r.width + pad || point.y < r.top - pad || point.y > r.top + r.height + pad) return;
      flowers.forEach(function (f) {
        var fx = r.left + f.x / 100 * r.width, fy = r.top + f.y / 100 * r.height;
        var d = Math.hypot(fx - point.x, fy - point.y);
        if (d > r.width * 0.5 || now < f.busyUntil) return;
        var delay = d / r.width * 600;                     // the ripple spreads out from the pointer
        var lean = fx >= point.x ? 1 : -1;                 // tipping away from it
        f.busyUntil = now + delay + WAVE_MS;
        f.el.animate([
          { transform: 'none', opacity: 1 },
          { transform: 'rotate(' + 12 * lean + 'deg) scale(1.1)', opacity: 1, offset: 0.28 },
          { transform: 'rotate(' + -5 * lean + 'deg) scale(1.04)', opacity: 1, offset: 0.6 },
          { transform: 'none', opacity: 1 }
        ], { duration: WAVE_MS, delay: delay, easing: 'ease-in-out' });
      });
    }
    function onPointer(e) {
      // a finger only counts when it taps, not while it scrolls
      if (e.type === 'pointermove' && e.pointerType === 'touch') return;
      var now = performance.now();
      if (e.type === 'pointermove' && now - lastCheck < 60) return;
      lastCheck = now;
      point = { x: e.clientX, y: e.clientY };
      ripple();
    }
    addEventListener('pointermove', onPointer, { passive: true });
    addEventListener('pointerdown', onPointer, { passive: true });
  }

  // ---- 2. the shower -----------------------------------------------------------
  var SHOWER_FLOWERS = ['flower-01', 'flower-02', 'flower-03', 'flower-04', 'flower-05', 'flower-06', 'flower-07'];
  var STEP = 1000 / 12, showering = false;

  function shower() {
    if (showering || motion.matches) return;
    showering = true;
    var layer = document.createElement('div');
    layer.className = 'flower-shower';
    layer.setAttribute('aria-hidden', 'true');
    var W = document.documentElement.clientWidth, H = innerHeight, count = W < 600 ? 16 : 24, pieces = [];
    for (var i = 0; i < count; i++) {
      var img = document.createElement('img'), size = 30 + Math.random() * 26;
      img.alt = '';
      img.src = DIR + SHOWER_FLOWERS[i % SHOWER_FLOWERS.length] + '.webp';
      img.style.width = size.toFixed(0) + 'px';
      layer.appendChild(img);
      pieces.push({
        // starting up to a third of a screen above the top, and falling a
        // screen in 1.6 to 2.8 seconds: all gone within about 4 seconds
        el: img, x: Math.random() * W, y: -size - Math.random() * H * 0.35,
        vy: H * (0.36 + Math.random() * 0.26),
        phase: Math.random() * 6, swing: 10 + Math.random() * 16,
        r: Math.random() * 360, vr: (Math.random() - 0.5) * 400
      });
    }
    document.body.appendChild(layer);

    var start = performance.now(), last = 0;
    function frame(now) {
      if (now - last >= STEP) {
        last = now;
        var t = (now - start) / 1000, alive = 0;
        pieces.forEach(function (p) {
          var y = p.y + p.vy * t;
          if (y > H + 60) { if (p.el.parentNode) p.el.remove(); return; }
          alive++;
          var x = p.x + Math.sin(t * 2.4 + p.phase) * p.swing;
          p.el.style.transform = 'translate(' + x.toFixed(0) + 'px,' + y.toFixed(0) + 'px) rotate(' + (p.r + p.vr * t).toFixed(0) + 'deg)';
        });
        if (!alive) { layer.remove(); showering = false; return; }
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function remember(value) { try { sessionStorage.setItem(KEY, value + ':' + Date.now()); } catch (e) {} }

  // links and forms that shower
  document.addEventListener('click', function (e) {
    var link = e.target.closest && e.target.closest('a[data-shower]');
    if (!link || motion.matches) return;
    if (link.getAttribute('href').charAt(0) === '#') shower();
    else remember('nav');
  });
  document.addEventListener('submit', function (e) {
    if (e.target.matches && e.target.matches('form[data-shower]') && !e.defaultPrevented) remember('submit');
  });

  // the page after one of those: shower now? (Only ever the very next page.)
  var pending = null;
  try { pending = sessionStorage.getItem(KEY); sessionStorage.removeItem(KEY); } catch (e) {}
  if (pending && !motion.matches) {
    var kind = pending.split(':')[0], age = Date.now() - Number(pending.split(':')[1]);
    // a click through to here, just now; or a form that's ended here, well
    // (the round trip through Stripe can take a while)
    if ((kind === 'nav' && age < 8000) || (kind === 'submit' && age < 2 * 3600 * 1000 && document.querySelector('[data-celebrate]'))) {
      addEventListener('load', function () { setTimeout(shower, 300); }, { once: true });
    }
  }

  if (!motion.matches) setUpWave();
  motion.addEventListener('change', function () {
    if (!motion.matches && !document.querySelector('.poster-flowers')) setUpWave();
  });
})();
