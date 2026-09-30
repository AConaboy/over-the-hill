/* Keeps the sun rays centred on the spinning disco ball as the page scrolls.
   (From the sunrise design made in Claude Design.)
   Once the ball has scrolled away, the centre stays just above the screen,
   so the rays keep beaming down behind the rest of the page, softer.
   Runs inline, straight after the poster (Poster.astro copies it into the
   page), so the rays are in place before the page first paints; until
   then they're parked off-screen. */
(function () {
  var svg = document.querySelector('.sunrise-rays');
  var ball = document.querySelector('.poster-ball');
  if (!svg || !ball) return;
  var pos = svg.querySelector('.pos'), scale = svg.querySelector('.scale');
  var strength = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ray-strength-page')) || 0.35;
  var header = document.querySelector('.site-header');   // the footer's further down: not parsed yet
  var ticking = false;

  function place() {
    ticking = false;
    var r = ball.getBoundingClientRect();
    var vw = innerWidth, vh = innerHeight;
    var cx = r.left + r.width / 2;
    var cy = Math.max(r.top + r.height / 2, -vh * 0.45);
    var len = Math.hypot(Math.max(cx, vw - cx), Math.max(cy, vh - cy)) * 1.15;
    pos.setAttribute('transform', 'translate(' + cx + ' ' + cy + ')');
    scale.setAttribute('transform', 'scale(' + len + ')');
    var past = Math.min(Math.max(-r.top / (r.height * 3), 0), 1);
    svg.style.opacity = 1 - past * (1 - strength);
    // Only show the rays between the header and the footer. They sit behind
    // both anyway; this stops them showing in the gap a "rubber-band" scroll
    // opens above the header or below the footer on browsers that still bounce.
    var top = header ? Math.max(0, header.getBoundingClientRect().bottom) : 0;
    var footer = document.querySelector('.site-footer');
    var bottom = footer ? Math.max(0, vh - footer.getBoundingClientRect().bottom) : 0;
    svg.style.clipPath = 'inset(' + top + 'px 0 ' + bottom + 'px 0)';
  }
  function request() { if (!ticking) { ticking = true; requestAnimationFrame(place); } }

  // The ball starts still and small to download; start it spinning once
  // everything else has loaded, so the big animation doesn't hold up the
  // page. After that, this visit's later pages start it spinning straight
  // away (see the inline script in Poster.astro). Still for reduced motion.
  var still = ball.dataset.still || ball.getAttribute('src'), spin = ball.dataset.spin;
  var motion = matchMedia('(prefers-reduced-motion: reduce)');
  function setBall() {
    if (!spin) return;
    if (motion.matches) { ball.src = still; return; }
    if (ball.getAttribute('src') === spin) return;
    var img = new Image();
    img.onload = function () {
      if (motion.matches) return;
      ball.src = spin;
      try { sessionStorage.setItem('oth-ball-spinning', '1'); } catch (e) {}
    };
    img.src = spin;
  }
  if (document.readyState === 'complete') setBall(); else addEventListener('load', setBall);
  motion.addEventListener('change', setBall);

  addEventListener('scroll', request, { passive: true });
  addEventListener('resize', request);
  ball.addEventListener('load', request);
  place();
})();
