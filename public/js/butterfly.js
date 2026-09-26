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
  - It sits under the sticky header on page content (and flying to it), and
    above it on the header (and flying to it), so it never crosses over the
    header and then pops underneath.
  - Its routes stay on the page (loops scale to the screen), so it neither
    adds a sideways scrollbar on phones nor sits pinned to an edge flapping.
  - On text and buttons it stands with its feet on the tops of the letters
    rather than over them, and doesn't flap there, so it never covers what's
    written; header stops that would cut off its head are skipped.
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
  // Its feet: the lowest drawn pixel of the resting (wings-up) frame.
  var FEET = 186 / BOX_H;
  function spriteH() { return size() * BOX_W / DRAWN_W * BOX_H / BOX_W; }
  function feetBelowAnchor() { return (FEET - AY) * spriteH(); }
  function headAboveAnchor() { return AY * spriteH(); }

  // The drawn part of the resting frame (columns 9–211, rows 3–186 of the
  // 221 x 304 box), relative to its anchor, for checking it won't cover text.
  function restingBox(p) {
    var w = size() * BOX_W / DRAWN_W, h = spriteH();
    return { left: p.x + (9 / BOX_W - AX) * w, right: p.x + (211 / BOX_W - AX) * w, top: p.y + (3 / BOX_H - AY) * h, bottom: p.y + (FEET - AY) * h - 1 };
  }
  var TEXT = '.site-name, .main-navigation a, .hero-description, .event-details, .home-text .button, .home-text .text-link, .credit-line, .site-footer p';
  function textLines() {                                       // every line of the page's text, in page coordinates
    var rects = [];
    document.querySelectorAll(TEXT).forEach(function (e) {
      var range = document.createRange(); range.selectNodeContents(e);
      Array.prototype.forEach.call(range.getClientRects(), function (r) {
        if (r.width > 0) rects.push({ el: e, left: r.left + scrollX, right: r.right + scrollX, top: r.top + scrollY, bottom: r.bottom + scrollY });
      });
    });
    return rects;
  }
  function coversText(p, own) {                                // would it sit over any text but its own perch?
    var b = restingBox(p);
    return textLines().some(function (r) {
      if (own && (r.el === own || r.el.contains(own) || own.contains(r.el))) return false;
      return r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top;
    });
  }

  // Where the tops of the capital letters are, below the top of a text's
  // box: font metrics from a canvas, measured once per font.
  var measure = document.createElement('canvas').getContext('2d'), capGaps = {};
  function capMetrics(e) {
    var cs = getComputedStyle(e), font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
    if (!capGaps[font]) {
      measure.font = font;
      var m = measure.measureText('H');
      capGaps[font] = { gap: (m.fontBoundingBoxAscent || 0) - m.actualBoundingBoxAscent, cap: m.actualBoundingBoxAscent / parseFloat(cs.fontSize) };
    }
    return capGaps[font];
  }
  // The first line of an element's text, and the top of its letters on it.
  function firstLine(e) {
    var range = document.createRange(); range.selectNodeContents(e);
    var rects = Array.prototype.filter.call(range.getClientRects(), function (r) { return r.width > 0; });
    if (!rects.length) return null;
    var top = rects[0].top, line = rects.filter(function (r) { return Math.abs(r.top - top) < 2; });
    var left = Math.min.apply(null, line.map(function (r) { return r.left; }));
    var right = Math.max.apply(null, line.map(function (r) { return r.right; }));
    return { x: left + scrollX, w: right - left, top: top + scrollY + capMetrics(e).gap };
  }
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

  // Where it sits relative to the sticky header: above it on the header, or
  // flying to it; under it on page content, or flying to it (so it passes
  // behind the header rather than over it and then popping underneath when
  // it lands). Taking off from the header, it stays above until it's clear
  // of it. Clickable only when resting at home.
  function setState(state, perch) {
    layer.dataset.state = state;                               // "flying" | "home" | "perched"
    if (state !== 'flying') layer.classList.toggle('on-header', !!(perch && perch.onHeader));
  }
  function layerForFlight() {
    var above = !!flight.target.onHeader;
    if (!above && flight.fromHeader && header) {
      var headTop = fly.y - scrollY - headAboveAnchor();
      if (headTop < header.getBoundingClientRect().bottom) above = true;
      else flight.fromHeader = false;                          // clear of the header now: stay under it
    }
    layer.classList.toggle('on-header', above);
  }

  // ---- perches: 3–4 stops anywhere on the page ------------------------------
  // On text and buttons it stands with its feet on the top of the letters
  // (or the button's edge), so it never covers what's written. On the
  // illustration it sits on things, as drawn.
  function perches() {
    var list = [];
    function add(fn, onHeader, onTop, own) { fn.onHeader = !!onHeader; fn.onTop = !!onTop; fn.own = own || null; list.push(fn); }
    function onTop(sel, from, to, kind, all) {                // along the top of an element: "text" or its "box"
      (all ? Array.prototype.slice.call(document.querySelectorAll(sel)) : [document.querySelector(sel)]).forEach(function (e) {
        if (!e) return;
        add(function (r) {
          var q = page(e), visible = q.w > 0 && q.h > 0, line = kind === 'text' && visible ? firstLine(e) : null;
          var x = line ? line.x + line.w * (from + (to - from) * r) : q.x + q.w * (from + (to - from) * r);
          var top = line ? line.top : q.y;
          return { x: x, y: top - feetBelowAnchor(), visible: visible };
        }, header && header.contains(e), true, e);
      });
    }
    // header
    onTop('.site-logo', 0.3, 0.7, 'box'); onTop('.site-name', 0.2, 0.9, 'text');
    onTop('.main-navigation a:not(.nav-rsvp)', 0.2, 0.8, 'text', true); onTop('.nav-rsvp', 0.3, 0.7, 'box');
    // homepage text
    onTop('.hero-description', 0.05, 0.95, 'text'); onTop('.event-details', 0.1, 0.9, 'text');
    onTop('.home-text .button', 0.2, 0.8, 'box'); onTop('.home-text .text-link', 0.2, 0.8, 'text'); onTop('.credit-line', 0.1, 0.9, 'text');
    // footer
    onTop('.footer-title', 0.05, 0.95, 'text'); onTop('.footer-inner > div > p:nth-child(2)', 0.1, 0.9, 'text');
    onTop('.footer-credit', 0.2, 0.8, 'text'); onTop('.footer-contact', 0.1, 0.9, 'text');
    // on the tops of the arcing title and dates: only the flatter middle of
    // each arc, where the letters stand nearly upright
    [['#poster-arc-top', 1, 0.3, 0.7, '.poster-arc-title'], ['#poster-arc-bottom', -1, 0.3, 0.7, '.poster-arc-date']].forEach(function (a) {
      var path = document.querySelector(a[0]), text = document.querySelector(a[4]); if (!path || !text) return;
      var svg = path.ownerSVGElement;
      add(function (r) {
        var len = path.getTotalLength(), t = a[2] + (a[3] - a[2]) * r, p = path.getPointAtLength(len * t);
        // letter height in the SVG's units, plus a little clearance for the tilted letters' corners
        var capUnits = parseFloat(getComputedStyle(text).fontSize) * capMetrics(text).cap + 6;
        var dx = p.x - 450, dy = p.y - 490, n = Math.hypot(dx, dy) || 1;       // out from the arcs' centre
        var pt = svg.createSVGPoint(); pt.x = p.x + dx / n * capUnits * a[1]; pt.y = p.y + dy / n * capUnits * a[1];
        var q = pt.matrixTransform(svg.getScreenCTM());
        return { x: q.x + scrollX, y: q.y + scrollY - feetBelowAnchor(), visible: true };
      }, false, true);
    });
    // the illustration: treetop, branches, disco ball, flowers, hills, mushroom caps, tulips
    [[0.52, 0.03], [0.30, 0.10], [0.82, 0.14], [0.71, 0.43], [0.20, 0.60], [0.73, 0.83], [0.60, 0.80], [0.45, 0.55], [0.40, 0.90]].forEach(function (f) {
      add(function () { var a = page(art); return { x: a.x + a.w * f[0], y: a.y + a.h * f[1], visible: true }; });
    });
    return list;
  }

  function pickPerch(from, recent, leaving) {
    var width = document.documentElement.clientWidth;
    // Resting tucked under the header (on page content scrolled beneath it),
    // it can't fly up onto the header without popping out in front of it,
    // so it picks somewhere else this time.
    var hb = header && header.getBoundingClientRect(), box = restingBox(from);
    var underHeader = !!(hb && leaving && !leaving.onHeader && box.top - scrollY < hb.bottom && box.bottom - scrollY > hb.top);
    var cands = perches().map(function (fn, i) {
      var r = Math.random(), bound = function () { return fn(r); };
      bound.onHeader = fn.onHeader; bound.onTop = fn.onTop; bound.own = fn.own;
      return { i: i, fn: bound };
    }).filter(function (c) {
      var p = c.fn();
      // hidden elements (e.g. the nav links behind the phone menu) report a
      // zero-size box at the top-left of the page: skip them
      // a header stop too near the top of the screen would cut off its head
      if (c.fn.onHeader && (underHeader || p.y - scrollY - headAboveAnchor() < 0)) return false;
      if (!(p.visible && recent.indexOf(c.i) < 0 && p.x > 30 && p.x < width - 30 && Math.hypot(p.x - from.x, p.y - from.y) > 260)) return false;
      // no room above this text (another line close above it): skip it
      return !(c.fn.onTop && coversText(p, c.fn.own));
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

  function flyTo(target, then, fromHeader) {
    var from = { x: fly.x, y: fly.y }, to = target();
    var dx = to.x - from.x, dy = to.y - from.y, dist = Math.hypot(dx, dy) || 1;
    var legs = Math.max(2, Math.min(5, Math.round(dist / 260))), bends = [];
    for (var i = 1; i < legs; i++) {                           // a meandering route, a loop or two
      // loops scale down on narrow screens so they fit
      bends.push({ t: i / legs, swing: (Math.random() - .5) * Math.min(dist * 0.6, 320, document.documentElement.clientWidth * 0.5) });
    }
    // Flights to the sticky header are worked out relative to the screen
    // (where the header stays) rather than the page, so scrolling mid-flight
    // doesn't carry it off and back.
    var screen = !!target.onHeader;
    if (screen) from.y -= scrollY;
    flight = { from: from, bends: bends, target: target, screen: screen, fromHeader: !!fromHeader, t: 0, start: performance.now(), dur: Math.min(1400 + dist * 2.6, 9000), then: then };
    setState('flying');
    layerForFlight();
  }
  function flightPoint(t) {
    var from = flight.from, to = flight.target(), sy = flight.screen ? scrollY : 0;
    to = { x: to.x, y: to.y - sy };
    var dx = to.x - from.x, dy = to.y - from.y, dist = Math.hypot(dx, dy) || 1, nx = -dy / dist, ny = dx / dist;
    // keep the route's bends on the page, so its loops don't run off the
    // side (where it would sit pinned to the edge, flapping)
    var margin = size() * 1.2, maxX = document.documentElement.clientWidth - margin;
    var maxY = flight.screen ? innerHeight - margin : document.documentElement.scrollHeight - margin;
    var pts = [from].concat(flight.bends.map(function (b) {
      return {
        x: Math.min(Math.max(from.x + dx * b.t + nx * b.swing, margin), maxX),
        y: Math.min(Math.max(from.y + dy * b.t + ny * b.swing - 40, margin), maxY)
      };
    }), [to]);
    var p = along(pts, ease(t));
    return { x: p.x, y: p.y + sy };
  }

  // ---- the tour -------------------------------------------------------------
  var tour = null;                                             // { left, perch, until, recent }

  function wanderStep(now) {
    if (now < tour.until) return;
    var stay, leaving = tour.perch;
    if (tour.left === 0 && tour.perch === home) tour.left = 3 + Math.floor(Math.random() * 2);   // set off
    if (tour.left > 0) {
      var next = pickPerch({ x: fly.x, y: fly.y }, tour.recent, leaving);
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
    }, leaving.onHeader);
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
      var t = flight.t = Math.min((now - flight.start) / flight.dur, 1);
      var p = flightPoint(t);
      moveTo(p.x, p.y + Math.sin(t * Math.PI * 10) * 6);    // a little bob
      fly.wing = CYCLE[tick % 4];                              // one flap every 4 steps
      layerForFlight();
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
    if (!flight && tour.perch.onTop) {
      fly.wing = 0;                                            // stands still on text and buttons
    } else if (!flight) {
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
  function onResize() {
    if (!running) { restAtHome(); return; }
    // redraw straight away: waiting for the next step would leave it where
    // the old, wider page's edge was for a moment
    if (!flight && tour) { var pp = tour.perch(); fly.x = pp.x; fly.y = pp.y; }
    draw();
  }

  // While resting (or flying to the header), follow on every scroll rather
  // than on the next 12 fps step: anything on the sticky header would
  // otherwise be carried off with the page for a moment and snap back.
  addEventListener('scroll', function () {
    if (!running || !tour) return;
    if (flight) {
      if (!flight.screen) return;                              // page flights don't move with the screen
      var p = flightPoint(flight.t); fly.x = p.x; fly.y = p.y + Math.sin(flight.t * Math.PI * 10) * 6; layerForFlight(); draw();
      return;
    }
    var pp = tour.perch(); fly.x = pp.x; fly.y = pp.y; draw();
  }, { passive: true });
  addEventListener('resize', onResize);
  addEventListener('load', onResize);            // fonts and images can shift the poster
  motion.addEventListener('change', function () { motion.matches ? stop() : start(); });

  if (motion.matches) restAtHome(); else start();
})();
