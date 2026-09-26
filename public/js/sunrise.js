/* Keeps the sun rays centred on the spinning disco ball as the page scrolls.
   Once the ball has scrolled away, the centre stays just above the screen,
   so the rays keep beaming down behind the rest of the page, softer. */
(function () {
  var svg = document.querySelector('.sunrise-rays');
  var ball = document.querySelector('.poster-ball');
  if (!svg || !ball) return;
  var pos = svg.querySelector('.pos'), scale = svg.querySelector('.scale');
  var strength = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ray-strength-page')) || 0.35;
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
  }
  function request() { if (!ticking) { ticking = true; requestAnimationFrame(place); } }

  addEventListener('scroll', request, { passive: true });
  addEventListener('resize', request);
  ball.addEventListener('load', request);
  place();
})();
