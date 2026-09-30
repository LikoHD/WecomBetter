/* WecomBetter 官网全局行为：M3 滚动 reveal + 平滑锚点 */

(function () {
  'use strict';

  var STAGGER_STEP = 80;

  function setupReveals() {
    var reveals = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
    if (!reveals.length) return;

    // 同父元素的 .reveal 兄弟按 DOM 顺序自动 stagger（0/80/160/240…），手写 data-delay 优先
    var groups = new Map();
    reveals.forEach(function (el) {
      var parent = el.parentElement || document.body;
      if (!groups.has(parent)) groups.set(parent, []);
      groups.get(parent).push(el);
    });

    groups.forEach(function (siblings) {
      var auto = siblings.filter(function (el) {
        return !el.hasAttribute('data-delay');
      });
      auto.forEach(function (el, i) {
        el.setAttribute('data-delay', String(i * STAGGER_STEP));
      });
    });

    reveals.forEach(function (el) {
      var delay = parseInt(el.getAttribute('data-delay'), 10);
      if (delay > 0) el.style.transitionDelay = delay + 'ms';
    });

    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || !('IntersectionObserver' in window)) {
      reveals.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      });
    }, { threshold: 0.15 });

    reveals.forEach(function (el) { io.observe(el); });
  }

  function setupSmoothAnchors() {
    document.addEventListener('click', function (event) {
      var origin = event.target;
      var link = origin instanceof Element ? origin.closest('a[href^="#"]') : null;
      if (!link) return;
      var id = link.getAttribute('href');
      if (id.length < 2) return;
      var target = document.querySelector(id);
      if (!target) return;
      event.preventDefault();
      var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
      if (history.replaceState) history.replaceState(null, '', id);
    });
  }

  function init() {
    setupReveals();
    setupSmoothAnchors();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
