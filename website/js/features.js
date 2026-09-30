/* WecomBetter 官网 · S3 功能编号列表（M4 sticky 切换 + M5 窗 1 打字循环） */
(function () {
  'use strict';

  var section = document.getElementById('features');
  if (!section) return;

  var reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  var mobileMQ = window.matchMedia('(max-width: 960px)');

  var items = Array.prototype.slice.call(section.querySelectorAll('.feat-item'));
  var stageBody = section.querySelector('.feat-stage .feat-win-body');
  if (!items.length || !stageBody) return;

  var panes = Array.prototype.slice.call(stageBody.querySelectorAll('.feat-pane'));
  var slots = items.map(function (item) {
    return item.querySelector('.feat-win-body');
  });

  var capLive = section.querySelector('.feat-cap-live');
  var capNum = capLive ? capLive.querySelector('.feat-cap-num') : null;
  var capName = capLive ? capLive.querySelector('.feat-cap-name') : null;
  var NAMES = ['顶栏快捷搜索', '正在查看头像', '本文关联文档'];

  var current = 0;

  /* ---------- M4 · 编号列表 × sticky 演示窗切换 ---------- */

  function activate(i) {
    var idx;
    for (idx = 0; idx < items.length; idx += 1) {
      items[idx].classList.toggle('is-active', idx === i);
    }
    if (i === current) return;
    var oldPane = panes[current];
    var newPane = panes[i];
    current = i;
    if (mobileMQ.matches) return;

    oldPane.classList.remove('is-active');
    oldPane.classList.add('is-leaving');
    window.setTimeout(function () {
      oldPane.classList.remove('is-leaving');
    }, 320);
    newPane.classList.remove('is-leaving');
    newPane.classList.add('is-active');

    if (capNum && capName) {
      capLive.classList.add('is-swap');
      window.setTimeout(function () {
        capNum.textContent = '0' + (i + 1);
        capName.textContent = NAMES[i];
        capLive.classList.remove('is-swap');
      }, 200);
    }
  }

  /* 视口中心线（上下各收 45%）判定；同帧多项命中时取中心最近者 */
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      var best = null;
      var bestDist = Infinity;
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var r = entry.target.getBoundingClientRect();
        var d = Math.abs((r.top + r.bottom) / 2 - window.innerHeight / 2);
        if (d < bestDist) {
          bestDist = d;
          best = entry.target;
        }
      });
      if (best) activate(items.indexOf(best));
    }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });
    items.forEach(function (item) { io.observe(item); });
  }

  /* ---------- 响应式：≤960px 把窗格从 sticky 舞台移入各列表项 ---------- */

  function placePanes() {
    if (mobileMQ.matches) {
      panes.forEach(function (pane, i) {
        pane.classList.add('is-static');
        pane.classList.remove('is-leaving');
        if (slots[i]) slots[i].appendChild(pane);
      });
    } else {
      panes.forEach(function (pane, i) {
        pane.classList.remove('is-static');
        pane.classList.remove('is-leaving');
        pane.classList.toggle('is-active', i === current);
        stageBody.appendChild(pane);
      });
    }
  }

  if (mobileMQ.addEventListener) mobileMQ.addEventListener('change', placePanes);
  else if (mobileMQ.addListener) mobileMQ.addListener(placePanes);
  /* 兜底：某些环境（模拟器/分屏拖拽）MQ change 可能不及时，resize 时再校准一次 */
  var placeRaf = 0;
  window.addEventListener('resize', function () {
    if (placeRaf) return;
    placeRaf = window.requestAnimationFrame(function () {
      placeRaf = 0;
      placePanes();
    });
  });
  placePanes();

  /* ---------- M5 · 窗 1：快捷搜索打字循环（80ms/字） ---------- */

  var paneS = section.querySelector('.feat-pane-s');
  if (paneS) {
    var box = paneS.querySelector('.feat-s-box');
    var queryEl = paneS.querySelector('.feat-s-query');
    var WORD = '会议纪要';

    if (reduceMQ.matches) {
      /* reduced-motion：直接显示终态 */
      queryEl.textContent = WORD;
      box.classList.add('is-focus');
      paneS.classList.add('is-open');
    } else {
      var sleep = function (ms) {
        return new Promise(function (resolve) { window.setTimeout(resolve, ms); });
      };
      var loop = async function () {
        for (;;) {
          box.classList.add('is-focus');
          await sleep(950);
          for (var n = 0; n < WORD.length; n += 1) {
            queryEl.textContent = WORD.slice(0, n + 1);
            await sleep(80);
          }
          await sleep(300);
          paneS.classList.add('is-open');
          await sleep(1900);
          paneS.classList.remove('is-open');
          box.classList.remove('is-focus');
          await sleep(420);
          queryEl.textContent = '';
          await sleep(1050);
        }
      };
      loop();
    }
  }
})();
