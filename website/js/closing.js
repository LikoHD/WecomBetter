/* WecomBetter 官网 · 收尾区脚本（M7 页尾日出）
   滚动进入视口时给 .cta-sun 加 .is-in：translateY(60px)→0、opacity .6→1，
   同时启动 8s 光辉脉动（均见 closing.css）。reduced-motion 由 CSS 兜底为终态。 */
(function () {
  "use strict";

  function init() {
    var sun = document.querySelector(".cta-sun");
    if (!sun) return;

    if (!("IntersectionObserver" in window)) {
      sun.classList.add("is-in");
      return;
    }

    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            sun.classList.add("is-in");
            io.disconnect();
          }
        });
      },
      { threshold: 0.15 }
    );

    io.observe(sun);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
