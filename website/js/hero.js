/* ==========================================================================
   WecomBetter 官网 —— Builder H：S0 导航 / S1 Hero / S2 Marquee
   v2：M1 日出天空（三层结构，无平移蠕动）· M2 加载编排 ·
       M4.5 窗口反向视差 · M5 搜索循环 · M6 Marquee 克隆
   IIFE 包裹，无全局泄漏
   ========================================================================== */
(function () {
  'use strict';

  var docEl = document.documentElement;
  var mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* 初始隐藏类在脚本执行第一时间加上（defer 脚本先于首帧绘制执行，
     避免 FOUC）；无 JS 时永远没有 .hero-boot，元素天然可见。 */
  docEl.classList.add('hero-boot');

  function onReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  function onMediaChange(mq, fn) {
    if (mq.addEventListener) mq.addEventListener('change', fn);
    else if (mq.addListener) mq.addListener(fn);
  }

  function rand(a, b) {
    return a + Math.random() * (b - a);
  }

  /* ---------------- M2 加载编排 ---------------- */
  function initChoreography() {
    /* 双层 rAF：确保 .hero-boot 初始态先完成一次排版，再触发过渡 */
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        docEl.classList.add('is-on');
        /* 入场结束后摘除编排类，让 hover 等常态过渡恢复纯净 */
        setTimeout(function () {
          docEl.classList.remove('hero-boot');
          docEl.classList.remove('is-on');
        }, 3000);
      });
    });
  }

  /* ---------------- M1 v2 Canvas 日出天空 ----------------
     三层结构：平底色 #FFCB30 → 径向渐变云层斑块（深云影/亮云/光晕奶油/金底，
     中央偏下横向"日带"）→ 四角暗角（CSS 侧另有 .hero-haze 底部 20px 棕渐变）。
     动画只有低频形态/透明度蠕动，无任何平移、无粒子。 */
  function initSky() {
    var canvas = document.querySelector('.hero-sky');
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext('2d');
    var W = 0;
    var H = 0;
    var rafId = 0;
    var running = false;
    var inView = true;
    var startT = performance.now();
    var lastT = startT;
    var blobs = [];

    /* 色板（rgb 分量字符串，仅这四色 + 暗角棕） */
    var DEEP = '216, 167, 35';   /* #D8A723 深云影 */
    var BRIGHT = '237, 188, 49'; /* #EDBC31 亮云 */
    var CREAM = '255, 247, 216'; /* #FFF7D8 光晕奶油 */
    var GOLD = '254, 203, 49';   /* #FECB31 金底 */

    /* 静态构图（x/y/rx/ry 为画幅比例，T 为蠕动周期秒），绘制顺序即数组顺序：
       深云影打底 → 金底过渡 → 亮云 → 奶油日带最上层 */
    var SPEC = [
      { x: 0.10, y: 0.12, rx: 0.30, ry: 0.13, c: DEEP, a: 0.50, T: 38 },
      { x: 0.52, y: 0.07, rx: 0.26, ry: 0.10, c: DEEP, a: 0.38, T: 32 },
      { x: 0.89, y: 0.13, rx: 0.27, ry: 0.12, c: DEEP, a: 0.46, T: 35 },
      { x: 0.04, y: 0.50, rx: 0.15, ry: 0.12, c: DEEP, a: 0.30, T: 30 },
      { x: 0.97, y: 0.52, rx: 0.15, ry: 0.11, c: DEEP, a: 0.28, T: 39 },
      { x: 0.30, y: 0.92, rx: 0.30, ry: 0.14, c: GOLD, a: 0.45, T: 34 },
      { x: 0.74, y: 0.94, rx: 0.28, ry: 0.13, c: GOLD, a: 0.40, T: 29 },
      { x: 0.18, y: 0.33, rx: 0.22, ry: 0.10, c: BRIGHT, a: 0.42, T: 28 },
      { x: 0.83, y: 0.30, rx: 0.20, ry: 0.09, c: BRIGHT, a: 0.40, T: 33 },
      { x: 0.14, y: 0.80, rx: 0.25, ry: 0.11, c: BRIGHT, a: 0.36, T: 36 },
      { x: 0.87, y: 0.77, rx: 0.22, ry: 0.10, c: BRIGHT, a: 0.36, T: 27 },
      /* 横向"日带"：最亮区在垂直 40%~70%、水平中段，像太阳低垂的辉光 */
      { x: 0.50, y: 0.62, rx: 0.56, ry: 0.20, c: BRIGHT, a: 0.50, T: 34 },
      { x: 0.50, y: 0.47, rx: 0.24, ry: 0.09, c: GOLD, a: 0.40, T: 37 },
      { x: 0.36, y: 0.52, rx: 0.18, ry: 0.085, c: CREAM, a: 0.55, T: 26 },
      { x: 0.65, y: 0.66, rx: 0.20, ry: 0.09, c: CREAM, a: 0.50, T: 31 },
      { x: 0.50, y: 0.57, rx: 0.38, ry: 0.13, c: CREAM, a: 0.85, T: 29 }
    ];

    function buildScene() {
      blobs = SPEC.map(function (b) {
        return {
          x: b.x, y: b.y, rx: b.rx, ry: b.ry, c: b.c, a: b.a,
          f: 1 / b.T,
          f2: 1 / (b.T * 0.83 + 4), /* 尺寸蠕动与透明度蠕动错频 */
          ph: rand(0, Math.PI * 2),
          ph2: rand(0, Math.PI * 2)
        };
      });
    }

    function draw(now) {
      var t = (now - startT) / 1000;
      var i;
      var b;

      ctx.clearRect(0, 0, W, H);

      /* ① 平底色 */
      ctx.fillStyle = '#FFCB30';
      ctx.fillRect(0, 0, W, H);

      /* ② 云层斑块：低频正弦只改透明度与形态，位置不动 */
      for (i = 0; i < blobs.length; i++) {
        b = blobs[i];
        var wobA = Math.sin(t * b.f * Math.PI * 2 + b.ph);
        var wobR = Math.sin(t * b.f2 * Math.PI * 2 + b.ph2);
        var alpha = b.a * (1 + 0.16 * wobA);
        var rx = b.rx * W * (1 + 0.05 * wobR);
        var ry = b.ry * H * (1 + 0.05 * wobA);
        ctx.save();
        ctx.translate(b.x * W, b.y * H);
        ctx.scale(1, ry / rx);
        var g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
        g.addColorStop(0, 'rgba(' + b.c + ', ' + alpha.toFixed(3) + ')');
        g.addColorStop(0.65, 'rgba(' + b.c + ', ' + (alpha * 0.5).toFixed(3) + ')');
        g.addColorStop(1, 'rgba(' + b.c + ', 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, rx, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      /* ③ 四角轻微压暗（径向暗角，角部离心力最强自然最暗） */
      var vg = ctx.createRadialGradient(
        W * 0.5, H * 0.5, Math.min(W, H) * 0.35,
        W * 0.5, H * 0.5, Math.max(W, H) * 0.78
      );
      vg.addColorStop(0, 'rgba(120, 82, 12, 0)');
      vg.addColorStop(1, 'rgba(120, 82, 12, 0.13)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
    }

    function tick(now) {
      if (!running) return;
      lastT = now;
      draw(now);
      rafId = requestAnimationFrame(tick);
    }

    function play() {
      if (running || mqReduce.matches) return;
      running = true;
      lastT = performance.now();
      rafId = requestAnimationFrame(tick);
    }

    function pause() {
      running = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
    }

    function sync() {
      if (mqReduce.matches) {
        pause();
        draw(startT); /* 静态渲染一帧（t=0 的构图），不循环 */
      } else if (inView && !document.hidden) {
        play();
      } else {
        pause();
      }
    }

    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth;
      H = canvas.clientHeight;
      if (!W || !H) return;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!running) draw(startT);
    }

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
        sync();
      }, { threshold: 0 }).observe(canvas);
    }
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('resize', resize);
    window.addEventListener('pagehide', pause);
    onMediaChange(mqReduce, sync);

    resize();
    buildScene();
    sync();
  }

  /* ---------------- M4.5 Hero 窗口反向视差 ----------------
     标题/天空随滚动 1:1 自然上移（不加干预）；唯独窗口额外
     translateY = -0.35 × scrollY，封顶 -140px，先离场。 */
  function initParallax() {
    var hero = document.querySelector('.hero');
    var win = document.querySelector('.hero-window');
    if (!hero || !win) return;
    var heroH = 0;
    var ticking = false;
    var attached = false;

    function measure() {
      heroH = hero.offsetHeight;
    }

    function apply() {
      ticking = false;
      var y = window.scrollY || window.pageYOffset || 0;
      if (y > heroH) return; /* 出 hero 区后停算（此刻早已封顶 -140） */
      var off = Math.max(-140, -0.35 * y);
      /* 位移小于 0.5px 时清空内联样式，不干扰入场编排的 transform */
      win.style.transform = off <= -0.5 ? 'translateY(' + off.toFixed(1) + 'px)' : '';
    }

    function onScroll() {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(apply);
      }
    }

    function sync() {
      if (mqReduce.matches) {
        if (attached) {
          window.removeEventListener('scroll', onScroll);
          attached = false;
        }
        win.style.transform = '';
      } else if (!attached) {
        measure();
        window.addEventListener('scroll', onScroll, { passive: true });
        attached = true;
        apply();
      }
    }

    window.addEventListener('resize', function () {
      if (attached) measure();
    });
    onMediaChange(mqReduce, sync);
    sync();
  }

  /* ---------------- M5 窗口内搜索循环（总周期约 6s） ---------------- */
  function initSearchLoop() {
    var win = document.querySelector('.hero-window');
    if (!win) return;
    var textEl = win.querySelector('.hero-search-text');
    if (!textEl) return;

    var QUERY = '周报模板';
    var T_BLINK = 1000;  /* 光标闪烁预热 */
    var T_TYPE = 80;     /* 逐字 80ms */
    var T_PAUSE = 200;   /* 打完稍作停顿 */
    var T_SLIDE = 620;   /* 建议列表滑入（含 80ms×3 stagger） */
    var T_HOLD = 1400;   /* 停留 */
    var T_FADE = 450;    /* 整体淡出 */
    var T_REST = 1600;   /* 清空后空场休息 */
    var timers = [];

    function later(fn, ms) {
      timers.push(setTimeout(fn, ms));
    }
    function clearAll() {
      for (var i = 0; i < timers.length; i++) clearTimeout(timers[i]);
      timers = [];
    }

    function showStatic() {
      /* reduced-motion：直接呈现最终态，不循环 */
      clearAll();
      win.classList.remove('is-fading');
      win.classList.add('is-suggest');
      textEl.textContent = QUERY;
    }

    function cycle() {
      clearAll();
      win.classList.remove('is-fading');
      win.classList.remove('is-suggest');
      textEl.textContent = '';

      var i;
      for (i = 1; i <= QUERY.length; i++) {
        (function (n) {
          later(function () {
            textEl.textContent = QUERY.slice(0, n);
          }, T_BLINK + (n - 1) * T_TYPE);
        })(i);
      }

      var tSuggest = T_BLINK + QUERY.length * T_TYPE + T_PAUSE;
      later(function () {
        win.classList.add('is-suggest');
      }, tSuggest);

      var tFade = tSuggest + T_SLIDE + T_HOLD;
      later(function () {
        win.classList.remove('is-suggest');
        win.classList.add('is-fading');
      }, tFade);

      later(cycle, tFade + T_FADE + T_REST);
    }

    function sync() {
      if (mqReduce.matches) {
        showStatic();
        return;
      }
      if (document.hidden) {
        clearAll();
        return;
      }
      clearAll();
      later(cycle, 400);
    }

    document.addEventListener('visibilitychange', sync);
    onMediaChange(mqReduce, sync);

    /* 首轮稍等窗口入场动画落定再开演 */
    if (mqReduce.matches) showStatic();
    else later(cycle, 1600);
  }

  /* ---------------- M6 Marquee：克隆一份实现无缝 -50% 衔接 ---------------- */
  function initMarquee() {
    var m = document.querySelector('.marquee');
    if (!m) return;
    var track = m.querySelector('.marquee-track');
    var group = m.querySelector('.marquee-group');
    if (!track || !group) return;
    var clone = group.cloneNode(true);
    clone.setAttribute('aria-hidden', 'true');
    track.appendChild(clone);
    m.classList.add('marquee-ready');
  }

  onReady(function () {
    initChoreography();
    initSky();
    initParallax();
    initSearchLoop();
    initMarquee();
  });
})();
