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
};

export function unmountViewers() {
  hideFloat();
  document.getElementById(ROOT_ID)?.remove();
  document.getElementById(FLOAT_LAYER_ID)?.remove();
  ui.viewers = [];
  ui.signature = "";
  ui.layer = null;
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
    return;
  }
  if (!document.documentElement.contains(root)) {
    root.style.position = "fixed";
    root.style.top = "12px";
    root.style.right = "168px";
    root.style.zIndex = "2147483000";
    document.documentElement.appendChild(root);
  }
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

  const root = ensureRoot();
  const signature = `${viewers.map((v) => `${v.id}\n${v.avatar}`).join("|")}#${viewers.length}/${total}`;
  if (signature === ui.signature && root.childElementCount) return;

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
