import { asMs, fetchCreatorAvatar } from "./search.js";
import { DOC_META_ROOT_ID, FLOAT_LAYER_ID, copyText, isDocDetailPage, parseDocPath } from "./shared.js";

const ui = {
  signature: "",
  mode: "",
  tipTimer: 0,
  docId: "",
  meta: null,
  root: null,
  parts: null,
  inset: null,
};

const CANVAS_GAP = 8;
const META_FALLBACK_H = 26;

const avatarCache = new Map();
let avatarFetching = "";

export function formatPrettyDate(ts) {
  const ms = asMs(ts);
  if (!ms) return "";
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diff = Math.round((start - day) / 86400000);
  if (diff === 0) return "今天";
  if (diff === 1) return "昨天";
  if (date.getFullYear() === now.getFullYear()) {
    return `${date.getMonth() + 1}月${date.getDate()}日`;
  }
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function letterOf(name) {
  return String(name || "?")
    .trim()
    .slice(0, 1)
    .toUpperCase();
}

function fallbackNode(name) {
  const span = document.createElement("span");
  span.className = "wxdm-fallback";
  span.textContent = letterOf(name);
  return span;
}

function avatarNode(meta) {
  if (!meta.avatar) return fallbackNode(meta.name);
  const img = document.createElement("img");
  img.className = "wxdm-photo";
  img.src = meta.avatar;
  img.alt = "";
  img.referrerPolicy = "no-referrer";
  img.addEventListener("error", function () {
    img.replaceWith(fallbackNode(meta.name));
  });
  return img;
}

function ensureTipLayer() {
  let layer = document.getElementById(FLOAT_LAYER_ID);
  if (!layer) {
    layer = document.createElement("div");
    layer.id = FLOAT_LAYER_ID;
    document.body.appendChild(layer);
  }
  return layer;
}

function hideTip() {
  clearTimeout(ui.tipTimer);
  document.querySelector(`#${FLOAT_LAYER_ID} .wxdm-tip`)?.remove();
}

function showTip(anchor, id) {
  if (!id) return;
  const layer = ensureTipLayer();
  layer.querySelector(".wxdm-tip")?.remove();
  const card = document.createElement("div");
  card.className = "wxov-card wxdm-tip";
  const text = document.createElement("span");
  text.className = "wxov-tip-id";
  text.textContent = id;
  card.appendChild(text);
  layer.appendChild(card);
  const rect = anchor.getBoundingClientRect();
  card.style.left = `${rect.left + rect.width / 2}px`;
  card.style.top = `${rect.bottom + 8}px`;
}

async function copyId(id, anchor) {
  if (!id) return;
  const ok = await copyText(id);
  if (ok) showTip(anchor, id);
  clearTimeout(ui.tipTimer);
  ui.tipTimer = window.setTimeout(hideTip, 1400);
}

function bindAvatar(btn) {
  btn.addEventListener("mouseenter", function () {
    showTip(btn, btn.dataset.id);
  });
  btn.addEventListener("focus", function () {
    showTip(btn, btn.dataset.id);
  });
  btn.addEventListener("mouseleave", hideTip);
  btn.addEventListener("blur", hideTip);
  btn.addEventListener("click", function (event) {
    event.preventDefault();
    event.stopPropagation();
    copyId(btn.dataset.id, btn);
  });
}

function findSmartTitleBlock() {
  const title = document.querySelector(
    "#root-editable .sc-text-input-content, #sc-page-content .sc-text-input-content, #root-editable .textInput__pIjhc, #sc-page-content .textInput__pIjhc"
  );
  if (!title || title.closest(`#${DOC_META_ROOT_ID}`)) return null;
  let node = title.closest(".block-wrapper-padding") || title;
  while (node.parentElement) {
    const parent = node.parentElement;
    if (parent.id === "root-editable" || parent.id === "sc-page-content") break;
    const siblings = [...parent.children].filter(function (el) {
      return el.id !== DOC_META_ROOT_ID && el.getBoundingClientRect().height > 8;
    });
    if (siblings.length > 1) return node;
    node = parent;
  }
  return node;
}

function dropExtraMeta(keep) {
  document.querySelectorAll(`#${DOC_META_ROOT_ID}`).forEach(function (el) {
    if (el !== keep) el.remove();
  });
}

function attachToHtml(root) {
  if (root.parentElement !== document.documentElement) {
    document.documentElement.appendChild(root);
  }
  dropExtraMeta(root);
}

function keepLastPlace(root, mode) {
  if (!root || ui.mode !== mode || !document.documentElement.contains(root)) return false;
  return mode !== "doc" || root.style.position === "fixed" || root.style.position === "absolute";
}

function parkPending(root) {
  attachToHtml(root);
  root.setAttribute("data-pending", "1");
}

function markPlaced(root, mode) {
  root.removeAttribute("data-pending");
  ui.mode = mode;
  return true;
}

function hasDocPages() {
  return Boolean(document.querySelector(".melo-page-container-view, .melo-page-main-view"));
}

// 画布文档真正稳定的容器：.melo-doc-view 是所有分页的共同父节点，滚动时不会被虚拟化
// 回收，也不裁剪子元素（page-0 自身是 overflow:hidden 且会被复用成 page-2/page-3）。
function findDocCanvas() {
  const view = document.querySelector(".melo-doc-view");
  if (!view) return null;
  const rect = view.getBoundingClientRect();
  return rect.width > 40 ? view : null;
}

// 量出首页正文真正从哪里开始，坐标一律换算成「相对 canvas（.melo-doc-view）」再缓存。
// 不能缓存视口坐标：滚动后视口坐标就过期了，拿它和实时 rect 做差会让元信息漂走。
// 页边距也不能从 pgMar 推算：Web/页面版式下编辑器渲染的实际留白和模型里的 pgMar 不是
// 一回事（实测 1417 twip≈94px，渲染却只留 42px），按模型算就会把创建人信息压到标题上。
// 用首个 .paragraph-drag-cover（第一段的段落框）同时取上边和左边：它就是正文起点，
// 比「遍历整页取最小 top」省掉几十次强制重排，实测 Web/连页/页面三种版式下两者的
// top 完全一致（42/94/42），而左边必须用它——遍历会取到更靠左的拖拽把手/快捷菜单。
function measureFirstPageInset(canvas) {
  const page = document.querySelector(".melo-page-container-view.page-0");
  if (!page || !canvas) return null;
  const pageRect = page.getBoundingClientRect();
  if (pageRect.height <= 0) return null;
  const para = page.querySelector(".paragraph-drag-cover");
  if (!para) return null;
  const paraRect = para.getBoundingClientRect();
  if (paraRect.height < 6 || paraRect.width < 12) return null;
  const top = paraRect.top - pageRect.top;
  if (top < 0) return null;
  const canvasRect = canvas.getBoundingClientRect();
  return {
    contentTop: Math.round(pageRect.top - canvasRect.top + top),
    contentLeft: Math.round(paraRect.left - canvasRect.left),
  };
}

function findDocTitleAnchor() {
  const input = document.getElementById("melo-doc-title");
  if (input && !input.closest("#workbench-titlebar")) {
    const rect = input.getBoundingClientRect();
    if (rect.width > 40 && rect.height > 16 && rect.top > 70) return { el: input, mode: "text" };
  }
  const canvas = findDocCanvas();
  if (canvas) return { el: canvas, mode: "canvas" };
  if (hasDocPages()) return null;
  if (input) return { el: input, mode: "bar" };
  return null;
}

function contentFloor() {
  const content = document.getElementById("workbench-content-container");
  if (content) return content.getBoundingClientRect().top + 8;
  const bar = document.getElementById("workbench-titlebar");
  return (bar?.getBoundingClientRect().bottom || 0) + 8;
}

function alignDocOverlay(root, anchor) {
  const title = anchor?.el || anchor;
  const mode = anchor?.mode || "text";
  const rect = title.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  if (mode === "canvas") {
    // 挂在 .melo-doc-view（所有分页的稳定父节点）上，用 absolute 落在首页顶部页边距里，
    // 随文档原生滚动、显示在标题上方。不能挂 page-0：那个 DOM 节点会被虚拟化复用成
    // page-2/page-3，元信息会跟着跑到文档中部反复出现。
    const canvas = title;
    const pos = getComputedStyle(canvas).position;
    if (pos === "static") canvas.style.position = "relative";
    root.dataset.mode = "doc";
    root.style.position = "absolute";
    if (root.parentElement !== canvas) canvas.appendChild(root);
    const inset = measureFirstPageInset(canvas) || ui.inset;
    if (inset) ui.inset = inset;
    const height = root.offsetHeight || META_FALLBACK_H;
    // 正文起点往上一个身位放元信息；页边距不够高时贴顶，宁可紧一点也不压住标题。
    root.style.top = `${Math.max(CANVAS_GAP, inset ? inset.contentTop - height - CANVAS_GAP : CANVAS_GAP)}px`;
    root.style.left = `${inset && inset.contentLeft > 0 ? inset.contentLeft : 64}px`;
    root.style.width = "max-content";
    root.style.maxWidth = "min(560px, calc(100% - 88px))";
    root.style.zIndex = "6";
    dropExtraMeta(root);
    return true;
  }
  // 以下是非画布（浮层）路径才用的定位；画布路径已在上面 return，不必付这几次强制重排。
  const floor = contentFloor();
  const left = Math.round(rect.left);
  let top = Math.round(Math.max(floor, rect.bottom + 8));
  if (mode === "bar") {
    top = Math.round(Math.max(floor + 152, rect.bottom + 10));
  }
  root.dataset.mode = "doc";
  root.style.position = "fixed";
  root.style.left = `${left}px`;
  root.style.top = `${top}px`;
  root.style.width = "max-content";
  root.style.maxWidth = `${Math.max(280, Math.round(window.innerWidth - left - 24))}px`;
  root.style.zIndex = "200";
  attachToHtml(root);
  return true;
}

function alignSmartpage(root, block) {
  // 之前的插入方式：作为标题块的后一个兄弟节点插入正文流中，随文档原生滚动，不浮层。
  root.dataset.mode = "smartpage";
  root.style.position = "";
  root.style.left = "";
  root.style.top = "";
  root.style.width = "";
  root.style.maxWidth = "";
  root.style.zIndex = "";
  if (block.nextSibling !== root) block.insertAdjacentElement("afterend", root);
  dropExtraMeta(root);
  return true;
}

export function placeDocMeta(root) {
  if (!root) return false;
  const kind = parseDocPath(location.pathname)?.kind || "";
  if (kind === "smartpage") {
    const block = findSmartTitleBlock();
    if (block?.parentElement) {
      if (alignSmartpage(root, block)) return markPlaced(root, "smartpage");
    }
    if (keepLastPlace(root, "smartpage")) return true;
    parkPending(root);
    return false;
  }

  const title = findDocTitleAnchor();
  if (title && alignDocOverlay(root, title)) return markPlaced(root, "doc");
  // 画布容器还没渲染出来：保留上次位置或停放，等它就位再插回去。
  if (keepLastPlace(root, "doc")) return true;
  parkPending(root);
  return false;
}

function heldRoot() {
  return document.getElementById(DOC_META_ROOT_ID) || ui.root;
}

function ensureRoot() {
  let root = heldRoot();
  if (!root) {
    root = document.createElement("div");
    root.id = DOC_META_ROOT_ID;
    root.setAttribute("data-empty", "1");
  }
  ui.root = root;
  dropExtraMeta(root);
  return root;
}

function makeSep(extraClass) {
  const sep = document.createElement("span");
  sep.className = `wxdm-sep ${extraClass}`;
  sep.setAttribute("aria-hidden", "true");
  sep.textContent = "|";
  return sep;
}

function buildRow() {
  const row = document.createElement("div");
  row.className = "wxdm-row";

  const person = document.createElement("span");
  person.className = "wxdm-person";
  const face = document.createElement("button");
  face.type = "button";
  face.className = "wxdm-avatar";
  face.setAttribute("aria-label", "复制创建人 Id");
  bindAvatar(face);
  const name = document.createElement("span");
  name.className = "wxdm-name";
  person.append(face, name);

  const updated = document.createElement("span");
  updated.className = "wxdm-time wxdm-updated";
  const created = document.createElement("span");
  created.className = "wxdm-time wxdm-created";
  const sepUpdated = makeSep("wxdm-sep-updated");
  const sepCreated = makeSep("wxdm-sep-created");

  row.append(person, sepUpdated, updated, sepCreated, created);
  return { row, person, face, name, updated, created, sepUpdated, sepCreated };
}

function ensureParts(root) {
  if (ui.parts && root.contains(ui.parts.row)) return ui.parts;
  const parts = buildRow();
  root.replaceChildren(parts.row);
  ui.parts = parts;
  return parts;
}

function patchAvatar(face, meta) {
  const img = face.querySelector(".wxdm-photo");
  const fallback = face.querySelector(".wxdm-fallback");
  if (meta.avatar) {
    if (img) {
      if (img.getAttribute("src") !== meta.avatar) img.src = meta.avatar;
      return;
    }
    face.replaceChildren(avatarNode(meta));
    return;
  }
  const letter = letterOf(meta.name);
  if (fallback) {
    if (fallback.textContent !== letter) fallback.textContent = letter;
    return;
  }
  face.replaceChildren(fallbackNode(meta.name));
}

function fill(root, meta) {
  const parts = ensureParts(root);
  const hasPerson = Boolean(meta.name || meta.avatar);
  const updated = formatPrettyDate(meta.updatedAt);
  const created = formatPrettyDate(meta.createdAt);

  parts.person.hidden = !hasPerson;
  if (hasPerson) {
    patchAvatar(parts.face, meta);
    parts.face.dataset.id = meta.name || "";
    parts.face.setAttribute("aria-label", meta.name ? `复制 ${meta.name}` : "复制创建人 Id");
    parts.name.textContent = meta.name || "";
    parts.name.hidden = !meta.name;
  }

  parts.updated.textContent = updated ? `最近编辑 ${updated}` : "";
  parts.created.textContent = created ? `创建于 ${created}` : "";
  parts.updated.hidden = !updated;
  parts.created.hidden = !created;
  parts.sepUpdated.hidden = !(hasPerson && updated);
  parts.sepCreated.hidden = !((hasPerson || updated) && created);
  root.setAttribute("data-empty", hasPerson || updated || created ? "0" : "1");
}

function hasPaint(meta) {
  return Boolean(meta && (meta.name || meta.createdAt || meta.updatedAt));
}

function metaSignature(meta) {
  return `${meta.name}\t${meta.avatar}\t${meta.createdAt}\t${meta.updatedAt}`;
}

function mergeMeta(prev, next) {
  if (!next || typeof next !== "object") return prev;
  if (!prev) return next;
  return {
    name: next.name || prev.name,
    avatar: next.avatar || prev.avatar,
    createdAt: next.createdAt || prev.createdAt,
    updatedAt: next.updatedAt || prev.updatedAt,
    creatorVid: next.creatorVid || prev.creatorVid,
  };
}

function ensureCreatorAvatar(meta) {
  const vid = String(meta?.creatorVid || "").trim();
  const name = String(meta?.name || "").trim();
  const key = vid || name;
  if (!key || meta?.avatar || !ui.docId) return;
  if (avatarCache.has(key)) {
    const url = avatarCache.get(key);
    if (url) renderDocMeta({ avatar: url });
    return;
  }
  if (avatarFetching === key) return;
  avatarFetching = key;
  const docId = ui.docId;
  fetchCreatorAvatar(docId, vid, name)
    .then(function (url) {
      avatarCache.set(key, url || "");
      if (url && ui.docId === docId) renderDocMeta({ avatar: url });
    })
    .catch(function () {
      avatarCache.set(key, "");
    })
    .then(function () {
      if (avatarFetching === key) avatarFetching = "";
    });
}

export function unmountDocMeta() {
  hideTip();
  heldRoot()?.remove();
  ui.signature = "";
  ui.mode = "";
  ui.docId = "";
  ui.meta = null;
  ui.root = null;
  ui.parts = null;
  ui.inset = null;
}

export function renderDocMeta(meta) {
  if (!isDocDetailPage()) {
    unmountDocMeta();
    return;
  }

  const docId = parseDocPath(location.pathname)?.id || "";
  const existing = heldRoot();
  if (ui.docId && ui.docId !== docId) {
    ui.meta = null;
    ui.signature = "";
    ui.mode = "";
    ui.inset = null;
    if (existing) existing.setAttribute("data-empty", "1");
  }
  ui.docId = docId;

  const next = mergeMeta(ui.meta, meta);
  if (!hasPaint(next)) {
    if (existing) placeDocMeta(existing);
    return;
  }

  const root = ensureRoot();
  ui.meta = next;
  const signature = metaSignature(next);
  if (signature !== ui.signature || !ui.parts || !root.contains(ui.parts.row)) {
    ui.signature = signature;
    fill(root, next);
  }
  placeDocMeta(root);
  ensureCreatorAvatar(next);
}
