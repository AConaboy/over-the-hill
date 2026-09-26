/*
  The poster butterfly, wandering about the homepage ("Wander", from the
  prototype made in Claude Design).

  It rests where it's drawn on the poster, then makes 3–4 stops anywhere on
  the page (the header, the arcing lettering, the tagline, the RSVP button,
  the footer, bits of the illustration) on meandering routes, and flies home.
  It favours far-off stops. Clicking it while it rests at home hurries it
  along. Three drawn frames (wings up / middle / down) are swapped by hand and
  it moves in stepped 12 fps jumps, so it feels hand-animated.

  Reduced motion: it rests on the poster and never flies.

  Fixes over the prototype:
  - Flights steer to their stop's *current* position every frame, so
    scrolling (the sticky header), resizing or the poster refitting mid-flight
    can't make it land in the wrong place and then jump.
  - Time spent in a hidden tab is skipped, so it doesn't leap to the end of
    a flight (or rush off) when you come back.
  - It never blocks a click on a link or button it's resting on; it's only
    clickable at home on the poster.
  - Resting on page content it tucks under the sticky header; resting on the
    header (or flying) it's above it.
  - It's kept inside the page width, so its loops can't add a sideways
    scrollbar on phones.
*/
(function () {
  var FRAMES = ['/images/butterfly-frame-1.webp', '/images/butterfly-frame-3.webp', '/images/butterfly-frame-2.webp']; // up, middle, down
  var CYCLE = [0, 1, 2, 1];                  // up, middle, down, middle
  var STEP = 1000 / 12;                      // 12 fps
  var motion = matchMedia('(prefers-reduced-motion: reduce)');

  var art = document.querySelector('.poster-illustration');
  var header = document.querySelector('.site-header');
  if (!art) return;

  // ---- the sprite -------------------------------------------------------
  var layer = document.createElement('div');
  layer.className = 'butterfly-layer';
  layer.setAttribute('aria-hidden', 'true');
  var el = document.createElement('div');
  el.className = 'butterfly';
  el.innerHTML = FRAMES.map(function (src, i) {
    return '<img class="' + ['up', 'mid', 'down'][i] + '" src="' + src + '" alt="" draggable="false">';
  }).join('');
  layer.appendChild(el);
  document.body.appendChild(layer);

  var fly = { x: 0, y: 0, face: 1, tilt: 0, wing: 0, restFlap: 0 };

  // ---- geometry ---------------------------------------------------------
  function page(e) { var r = e.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }; }
  function size() { return page(art).w * 0.0965; }            // same size as in the drawing
  function home() { var a = page(art); return { x: a.x + a.w * 0.740, y: a.y + a.h * 0.697 }; }

  function catmull(p0, p1, p2, p3, t) {
    var t2 = t * t, t3 = t2 * t;
    function f(a, b, c, d) { return 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3); }
    return { x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) };
  }
  function along(pts, t) {                                     // t 0..1 along a smooth path through pts
    var n = pts.length - 1, s = Math.min(t * n, n - 1e-6), i = Math.floor(s);
    return catmull(pts[Math.max(i - 1, 0)], pts[i], pts[i + 1], pts[Math.min(i + 2, n)], s - i);
  }
  function ease(t) { return t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  // All three frames share a 221 x 304 box; the wings-up butterfly (194px
  // wide) is centred at (110.3, 95.3) in it, which is the point we position.
  var BOX_W = 221, BOX_H = 304, DRAWN_W = 194, AX = 110.3 / BOX_W, AY = 95.3 / BOX_H;
  el.style.transformOrigin = (AX * 100) + '% ' + (AY * 100) + '%';

  // How far the sprite reaches left, right and down from its anchor once
  // flipped and tilted (the tilted corners stick out beyond the upright box).
  function reach(w, h) {
    var a = fly.tilt * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a), left = 0, right = 0, down = 0;
    [[-AX * w, -AY * h], [(1 - AX) * w, -AY * h], [-AX * w, (1 - AY) * h], [(1 - AX) * w, (1 - AY) * h]].forEach(function (c) {
      var x = c[0] * cos - c[1] * sin, y = c[0] * sin + c[1] * cos;
      if (fly.face < 0) x = -x;
      left = Math.max(left, -x); right = Math.max(right, x); down = Math.max(down, y);
    });
    return { left: left, right: right, down: down };
  }

  function draw() {
    var w = size() * BOX_W / DRAWN_W, h = w * BOX_H / BOX_W, r = reach(w, h);
    // Keep the whole sprite inside the page width (no sideways scrollbar on
    // phones) and above the bottom of the page.
    var maxX = document.documentElement.clientWidth - r.right;
    var maxY = document.documentElement.scrollHeight - r.down;
    var x = Math.min(Math.max(fly.x, r.left), maxX), y = Math.min(fly.y, maxY);
    el.style.width = w + 'px';
    el.style.transform = 'translate(' + (x - w * AX).toFixed(0) + 'px,' + (y - h * AY).toFixed(0) + 'px) scaleX(' + fly.face + ') rotate(' + fly.tilt.toFixed(0) + 'deg)';
    el.dataset.wing = fly.wing;
  }
  function moveTo(x, y) {
    var dx = x - fly.x, dy = y - fly.y;
    if (Math.abs(dx) > 0.5) fly.face = dx < 0 ? -1 : 1;
    fly.tilt = Math.max(-18, Math.min(18, dy * 0.6)) * fly.face;
    fly.x = x; fly.y = y;
  }

  // Where it sits relative to the sticky header: above it while flying or
  // perched on the header, tucked under it while perched on page content,
  // and clickable only when resting at home.
  function setState(state, perch) {
    layer.dataset.state = state;                               // "flying" | "home" | "perched"
    layer.classList.toggle('on-header', state === 'flying' || !!(perch && perch.onHeader));
  }

  // ---- perches: 3–4 stops anywhere on the page ------------------------------
  function perches() {
    var list = [];
    function onTop(sel, from, to, all) {                       // somewhere along the top edge of an element
      (all ? Array.prototype.slice.call(document.querySelectorAll(sel)) : [document.querySelector(sel)]).forEach(function (e) {
        if (!e) return;
        var fn = function (r) { var q = page(e); return { x: q.x + q.w * (from + (to - from) * r), y: q.y + 4, visible: q.w > 0 && q.h > 0 }; };
        fn.onHeader = !!(header && header.contains(e));
        list.push(fn);
      });
    }
    // header
    onTop('.site-logo', 0.3, 0.7); onTop('.site-name', 0.2, 0.9);
    onTop('.main-navigation a:not(.nav-rsvp)', 0.2, 0.8, true); onTop('.nav-rsvp', 0.3, 0.7);
    // homepage text
    onTop('.hero-description', 0.05, 0.95); onTop('.event-details', 0.1, 0.9);
    onTop('.home-text .button', 0.2, 0.8); onTop('.home-text .text-link', 0.2, 0.8); onTop('.credit-line', 0.1, 0.9);
    // footer
    onTop('.footer-title', 0.05, 0.95); onTop('.footer-inner > div > p:nth-child(2)', 0.1, 0.9);
    onTop('.footer-credit', 0.2, 0.8); onTop('.footer-contact', 0.1, 0.9);
    // on top of the arcing title and dates (points along the SVG arcs)
    [['#poster-arc-top', 1, 0.08, 0.92, 72], ['#poster-arc-bottom', -1, 0.1, 0.9, 50]].forEach(function (a) {
      var path = document.querySelector(a[0]); if (!path) return;
      var svg = path.ownerSVGElement;
      list.push(function (r) {
        var len = path.getTotalLength(), t = a[2] + (a[3] - a[2]) * r, p = path.getPointAtLength(len * t);
        var dx = p.x - 450, dy = p.y - 490, n = Math.hypot(dx, dy) || 1;       // out from the arcs' centre
        var pt = svg.createSVGPoint(); pt.x = p.x + dx / n * a[4] * a[1]; pt.y = p.y + dy / n * a[4] * a[1];
        var q = pt.matrixTransform(svg.getScreenCTM());
        return { x: q.x + scrollX, y: q.y + scrollY, visible: true };
      });
    });
    // the illustration: treetop, branches, disco ball, flowers, hills, mushroom caps, tulips
    [[0.52, 0.03], [0.30, 0.10], [0.82, 0.14], [0.71, 0.43], [0.20, 0.60], [0.73, 0.83], [0.60, 0.80], [0.45, 0.55], [0.40, 0.90]].forEach(function (f) {
      list.push(function () { var a = page(art); return { x: a.x + a.w * f[0], y: a.y + a.h * f[1], visible: true }; });
    });
    return list;
  }

  function pickPerch(from, recent) {
    var width = document.documentElement.clientWidth;
    var cands = perches().map(function (fn, i) {
      var r = Math.random(), bound = function () { return fn(r); };
      bound.onHeader = fn.onHeader;
      return { i: i, fn: bound };
    }).filter(function (c) {
      var p = c.fn();
      // hidden elements (e.g. the nav links behind the phone menu) report a
      // zero-size box at the top-left of the page: skip them
      return p.visible && recent.indexOf(c.i) < 0 && p.x > 30 && p.x < width - 30 && Math.hypot(p.x - from.x, p.y - from.y) > 260;
    });
    if (!cands.length) return null;
    // favour far-away perches so it really explores
    var w = cands.map(function (c) { var p = c.fn(); return Math.pow(Math.hypot(p.x - from.x, p.y - from.y), 1.2); });
    var sum = w.reduce(function (a, b) { return a + b; }, 0), x = Math.random() * sum;
    for (var i = 0; i < cands.length; i++) { x -= w[i]; if (x <= 0) return cands[i]; }
    return cands[cands.length - 1];
  }

  // ---- flights --------------------------------------------------------------
  // The route's bends are kept as offsets from the straight line, and the
  // destination is re-read every frame, so the route stretches with the page
  // instead of arriving somewhere stale.
  var flight = null;                                           // { from, bends, target, start, dur, then }

  function flyTo(target, then) {
    var from = { x: fly.x, y: fly.y }, to = target();
    var dx = to.x - from.x, dy = to.y - from.y, dist = Math.hypot(dx, dy) || 1;
    var legs = Math.max(2, Math.min(5, Math.round(dist / 260))), bends = [];
    for (var i = 1; i < legs; i++) {                           // a meandering route, a loop or two
      bends.push({ t: i / legs, swing: (Math.random() - .5) * Math.min(dist * 0.6, 320) });
    }
    flight = { from: from, bends: bends, target: target, start: performance.now(), dur: Math.min(1400 + dist * 2.6, 9000), then: then };
    setState('flying');
  }
  function flightPoint(t) {
    var from = flight.from, to = flight.target();
    var dx = to.x - from.x, dy = to.y - from.y, dist = Math.hypot(dx, dy) || 1, nx = -dy / dist, ny = dx / dist;
    var pts = [from].concat(flight.bends.map(function (b) {
      return { x: from.x + dx * b.t + nx * b.swing, y: from.y + dy * b.t + ny * b.swing - 40 };
    }), [to]);
    return along(pts, ease(t));
  }

  // ---- the tour -------------------------------------------------------------
  var tour = null;                                             // { left, perch, until, recent }

  function wanderStep(now) {
    if (now < tour.until) return;
    var stay;
    if (tour.left === 0 && tour.perch === home) tour.left = 3 + Math.floor(Math.random() * 2);   // set off
    if (tour.left > 0) {
      var next = pickPerch({ x: fly.x, y: fly.y }, tour.recent);
      if (!next) { tour.left = 0; tour.perch = home; stay = 9000; }
      else {
        tour.left--; tour.perch = next.fn;
        tour.recent.push(next.i); if (tour.recent.length > 5) tour.recent.shift();
        stay = 2500 + Math.random() * 3000;
      }
    } else { tour.perch = home; stay = 8000 + Math.random() * 5000; }
    var perch = tour.perch;
    flyTo(perch, function () {
      tour.until = performance.now() + stay;
      setState(perch === home ? 'home' : 'perched', perch);
    });
    tour.until = Infinity;                                     // set properly once it lands
  }

  // click it while it rests at home to send it off early
  el.addEventListener('click', function () {
    if (!flight && tour && tour.perch === home) tour.until = 0;
  });

  // ---- main loop (stepped at 12 fps) ---------------------------------------
  var tick = 0, lastStep = 0, restFlapAt = 0, running = false, hiddenAt = 0;

  function restAtHome() {
    flight = null; tour = null;
    var h = home(); fly.x = h.x; fly.y = h.y; fly.face = 1; fly.tilt = 0; fly.wing = 0;
    setState('home');
    draw();
  }

  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    if (now - lastStep < STEP) return;
    lastStep = now; tick++;

    if (!tour) tour = { left: 0, perch: home, until: now + 3000, recent: [] };

    if (flight) {
      var t = Math.min((now - flight.start) / flight.dur, 1);
      var p = flightPoint(t);
      moveTo(p.x, p.y + Math.sin(t * Math.PI * 10) * 6);    // a little bob
      fly.wing = CYCLE[tick % 4];                              // one flap every 4 steps
      if (t >= 1) {
        var then = flight.then, landedHome = flight.target === home;
        flight = null; fly.tilt = 0; fly.wing = 0;
        if (landedHome) fly.face = 1;                          // face the way it's drawn on the poster
        if (then) then();
      }
    } else {
      var pp = tour.perch(); fly.x = pp.x; fly.y = pp.y;       // sit on the perch as the page scrolls or resizes
      wanderStep(now);
    }

    // resting: a lazy single flap now and then (middle, down, middle, up)
    if (!flight) {
      if (fly.restFlap > 0) { fly.wing = CYCLE[fly.restFlap]; fly.restFlap = (fly.restFlap + 1) % 4; }
      else if (now > restFlapAt) { fly.restFlap = 2; fly.wing = 1; restFlapAt = now + 2200 + Math.random() * 2500; }
      else fly.wing = 0;
    }
    draw();
  }

  function start() {
    if (running) return;
    restAtHome();
    running = true;
    requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    restAtHome();
  }

  // Skip time spent in a hidden tab (animation frames pause there, the clock
  // doesn't), so a flight doesn't jump to its end when you come back.
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { hiddenAt = performance.now(); return; }
    if (!hiddenAt) return;
    var gap = performance.now() - hiddenAt; hiddenAt = 0;
    if (flight) flight.start += gap;
    if (tour && isFinite(tour.until)) tour.until += gap;
  });

  // Reduced motion: rest at home, kept in place on resize; follow the
  // setting if it changes while the page is open.
  function onResize() { if (!running) restAtHome(); }

  // While resting, follow the perch on every scroll rather than on the next
  // 12 fps step: a perch on the sticky header would otherwise be carried off
  // with the page for a moment and snap back.
  addEventListener('scroll', function () {
    if (!running || flight || !tour) return;
    var pp = tour.perch(); fly.x = pp.x; fly.y = pp.y; draw();
  }, { passive: true });
  addEventListener('resize', onResize);
  addEventListener('load', onResize);            // fonts and images can shift the poster
  motion.addEventListener('change', function () { motion.matches ? stop() : start(); });

  if (motion.matches) restAtHome(); else start();
})();
