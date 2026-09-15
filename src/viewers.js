import {
  FLOAT_LAYER_ID,
  MAX_VISIBLE,
  ROOT_ID,
  SILENT_PANEL_CLASS,
  copyText,
  displayName,
  findVisibleCollabButton,
} from "./shared.js";

const ui = {
  viewers: [],
  signature: "",
  tooltipTimer: 0,
  toastTimer: 0,
  layer: null,
  tipWatch: null,
  tipSeen: null,
};

// 原生成员卡的文案特征。整个编辑器只有一个 .dui-tooltip-container 复用节点，分享/文档
// 动态/文档操作/工具栏的 tooltip 都走它，所以不能整体隐藏，只能按内容认人。
const MEMBER_TIP_RE = /名成员|正在查看/;
const TIP_CONTAINER = ".dui-tooltip-container";
const MUTE_ATTR = "data-wxov-mute";

// 成员卡是唯一把文案排成 <p> 两行（「N 名成员」+「xxx 正在查看」）的 tooltip，其它
// tooltip 都是纯文本、没有 <p>。据此区分，避免把「邀请成员加入」这类正常提示也误伤。
function isMemberTip(el) {
  const lines = el.querySelectorAll("p");
  if (!lines.length) return false;
  return [...lines].some(function (line) {
    return MEMBER_TIP_RE.test(line.textContent || "");
  });
}

// 复用节点会被换成别的 tooltip，所以每次变动都要重新判断，命中就静音、不命中就放行。
// 注意：这里会写 MUTE_ATTR，所以 observer 绝不能监听 attributes——否则自己的写入会
// 再次触发自己，变成死循环把渲染进程打满。
function syncTipMute(el) {
  const mute = isMemberTip(el);
  const had = el.getAttribute(MUTE_ATTR) === "1";
  if (mute === had) return;
  if (mute) el.setAttribute(MUTE_ATTR, "1");
  else el.removeAttribute(MUTE_ATTR);
}

function watchTipContainer(el) {
  if (!el || ui.tipSeen?.has(el)) return;
  ui.tipSeen?.add(el);
  syncTipMute(el);
  const inner = new MutationObserver(function () {
    syncTipMute(el);
  });
  inner.observe(el, { childList: true, subtree: true, characterData: true });
}

function scanTipContainers() {
  document.querySelectorAll(TIP_CONTAINER).forEach(watchTipContainer);
}

function watchNativeMemberTip() {
  if (!document.body) return;
  if (!ui.tipSeen) ui.tipSeen = new WeakSet();
  // 每轮都扫一遍：容器是按需创建的，可能在 observer 装好之前就已存在。
  scanTipContainers();
  if (ui.tipWatch) return;
  // 容器挂在 body 下按需创建，只盯 body 的直接子节点增减，不做全树监听。
  ui.tipWatch = new MutationObserver(scanTipContainers);
  ui.tipWatch.observe(document.body, { childList: true });
}

export function unmountViewers() {
  hideFloat();
  document.getElementById(ROOT_ID)?.remove();
  document.getElementById(FLOAT_LAYER_ID)?.remove();
  ui.viewers = [];
  ui.signature = "";
  ui.layer = null;
  ui.tipWatch?.disconnect();
  ui.tipWatch = null;
  ui.tipSeen = null;
  document.querySelectorAll(`${TIP_CONTAINER}[${MUTE_ATTR}]`).forEach(function (el) {
    el.removeAttribute(MUTE_ATTR);
  });
  document.documentElement.classList.remove(SILENT_PANEL_CLASS);
}

function findHost() {
  const btn = findVisibleCollabButton();
  return btn ? btn.parentElement : null;
}

function fallbackNode(id) {
  const span = document.createElement("span");
  span.className = "wxov-fallback";
  span.textContent = String(id || "?")
    .trim()
    .slice(0, 1)
    .toUpperCase();
  return span;
}

function avatarInner(viewer) {
  if (!viewer.avatar) return fallbackNode(viewer.id);
  const img = document.createElement("img");
  img.src = viewer.avatar;
  img.alt = "";
  img.referrerPolicy = "no-referrer";
  img.addEventListener("error", function () {
    img.replaceWith(fallbackNode(viewer.id));
  });
  return img;
}

function placeViewersRoot(root) {
  const host = findHost();
  const btn = host && host.querySelector(".ent-collab-users");
  if (host && btn) {
    if (root.parentElement !== host || root.nextSibling !== btn) {
      host.insertBefore(root, btn);
    }
    host.style.overflow = "visible";
    if (getComputedStyle(host).display === "block") {
      host.style.display = "flex";
      host.style.alignItems = "center";
    }
    root.style.position = "";
    root.style.top = "";
    root.style.right = "";
    root.style.zIndex = "";
    root.style.visibility = "";
    return;
  }
  if (!document.documentElement.contains(root)) {
    document.documentElement.appendChild(root);
  }
  root.style.visibility = "hidden";
}

function ensureRoot() {
  let root = document.getElementById(ROOT_ID);
  if (!root) {
    root = document.createElement("div");
    root.id = ROOT_ID;
    root.setAttribute("data-empty", "1");
  }
  placeViewersRoot(root);
  return root;
}

function ensureLayer() {
  if (ui.layer && document.body.contains(ui.layer)) return ui.layer;
  const layer = document.createElement("div");
  layer.id = FLOAT_LAYER_ID;
  document.body.appendChild(layer);
  ui.layer = layer;
  return layer;
}

function placeCard(anchor, card) {
  const rect = anchor.getBoundingClientRect();
  card.style.left = `${rect.left + rect.width / 2}px`;
  card.style.top = `${rect.bottom + 8}px`;
}

function hideFloat() {
  clearTimeout(ui.tooltipTimer);
  if (ui.layer) ui.layer.replaceChildren();
}

function openCard(className) {
  const layer = ensureLayer();
  layer.replaceChildren();
  const card = document.createElement("div");
  card.className = className;
  layer.appendChild(card);
  return card;
}

function showTip(anchor, viewer) {
  const card = openCard("wxov-card");
  const idEl = document.createElement("span");
  idEl.className = "wxov-tip-id";
  idEl.textContent = displayName(viewer);
  card.append(idEl);
  placeCard(anchor, card);
}

async function copyId(viewer, anchor) {
  const id = viewer?.id;
  if (!id) return;
  const ok = await copyText(id);
  if (ok) showTip(anchor, viewer);
  clearTimeout(ui.toastTimer);
  ui.toastTimer = window.setTimeout(hideFloat, 1400);
}

function stopAndCopy(event, viewer, anchor) {
  event.preventDefault();
  event.stopPropagation();
  copyId(viewer, anchor);
}

function bindHoverCopy(el, viewer) {
  el.addEventListener("mouseenter", function () {
    showTip(el, viewer);
  });
  el.addEventListener("focus", function () {
    showTip(el, viewer);
  });
  el.addEventListener("mouseleave", hideFloat);
  el.addEventListener("blur", hideFloat);
  el.addEventListener("click", function (event) {
    stopAndCopy(event, viewer, el);
  });
}

function makeAvatarButton(viewer, z) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "wxov-avatar";
  btn.style.zIndex = String(z);
  btn.setAttribute("aria-label", displayName(viewer));
  btn.appendChild(avatarInner(viewer));
  bindHoverCopy(btn, viewer);
  return btn;
}

function showOverflow(anchor, hidden) {
  clearTimeout(ui.tooltipTimer);
  const card = openCard("wxov-card is-pop");
  hidden.forEach(function (viewer) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "wxov-pop-item";
    item.appendChild(avatarInner(viewer));
    const idEl = document.createElement("span");
    idEl.className = "wxov-pop-id";
    idEl.textContent = displayName(viewer);
    item.appendChild(idEl);
    item.addEventListener("click", function (event) {
      stopAndCopy(event, viewer, item);
    });
    card.appendChild(item);
  });
  card.addEventListener("mouseenter", function () {
    clearTimeout(ui.tooltipTimer);
  });
  card.addEventListener("mouseleave", hideFloat);
  placeCard(anchor, card);
}

export function renderViewers(viewers, total) {
  if (!viewers.length && !total && !ui.viewers.length) return;

  watchNativeMemberTip();
  const root = ensureRoot();
  const signature = `${viewers.map((v) => `${v.id}\n${v.avatar}`).join("|")}#${viewers.length}/${total}`;
  if (signature === ui.signature && root.childElementCount) {
    placeViewersRoot(root);
    return;
  }

  const samePeople =
    ui.viewers.length === viewers.length &&
    ui.viewers.every(function (item, index) {
      return item && viewers[index] && item.id === viewers[index].id;
    });
  if (samePeople && root.childElementCount) {
    ui.viewers = viewers;
    ui.signature = signature;
    const visible = viewers.slice(0, MAX_VISIBLE);
    const imgs = root.querySelectorAll(".wxov-avatar img");
    imgs.forEach(function (img, index) {
      const viewer = visible[visible.length - 1 - index];
      if (viewer?.avatar && img.getAttribute("src") !== viewer.avatar) img.src = viewer.avatar;
    });
    const count = root.querySelector(".wxov-count");
    if (count) {
      count.textContent = `${viewers.length}/${total}`;
      count.setAttribute("aria-label", `在看 ${viewers.length} 人，共 ${total} 人`);
    }
    placeViewersRoot(root);
    return;
  }

  ui.viewers = viewers;
  ui.signature = signature;
  root.replaceChildren();
  root.setAttribute("data-empty", viewers.length || total ? "0" : "1");
  if (!viewers.length && !total) return;

  const visible = viewers.slice(0, MAX_VISIBLE);
  const hidden = viewers.slice(MAX_VISIBLE);
  const stack = document.createElement("div");
  stack.className = "wxov-stack";
  stack.setAttribute("aria-label", `正在查看 ${viewers.length} 人`);

  if (hidden.length) {
    const more = document.createElement("button");
    more.type = "button";
    more.className = "wxov-more";
    more.style.zIndex = "1";
    more.textContent = `+${hidden.length}`;
    more.setAttribute("aria-label", `另外 ${hidden.length} 人正在查看`);
    more.addEventListener("mouseenter", function () {
      showOverflow(more, hidden);
    });
    more.addEventListener("focus", function () {
      showOverflow(more, hidden);
    });
    more.addEventListener("mouseleave", function () {
      ui.tooltipTimer = window.setTimeout(hideFloat, 180);
    });
    stack.appendChild(more);
  }

  visible
    .slice()
    .reverse()
    .forEach(function (viewer, index) {
      stack.appendChild(makeAvatarButton(viewer, index + 2));
    });

  if (viewers.length) root.appendChild(stack);

  const count = document.createElement("span");
  count.className = "wxov-count";
  count.textContent = `${viewers.length}/${total}`;
  count.setAttribute("aria-label", `在看 ${viewers.length} 人，共 ${total} 人`);
  root.appendChild(count);
}
