import { DOC_META_ROOT_ID, FLOAT_LAYER_ID, copyText, isDocDetailPage, parseDocPath } from "./shared.js";

const ui = {
  signature: "",
  mode: "",
  tipTimer: 0,
  docId: "",
  meta: null,
  root: null,
  parts: null,
};

function asTime(ts) {
  const n = Number(ts) || 0;
  if (!n) return 0;
  return n > 1e12 ? n : n * 1000;
}

export function formatPrettyDate(ts) {
  const ms = asTime(ts);
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

function attachToHtml(root) {
  if (root.parentElement !== document.documentElement) {
    document.documentElement.appendChild(root);
  }
}

function keepLastPlace(root, mode) {
  if (!root || ui.mode !== mode || !document.documentElement.contains(root)) return false;
  return mode !== "doc" || root.style.position === "fixed";
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

function alignDocOverlay(root, title) {
  const rect = title.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const bar = document.getElementById("workbench-titlebar");
  const barBottom = bar?.getBoundingClientRect().bottom || rect.bottom;
  root.dataset.mode = "doc";
  root.style.position = "fixed";
  root.style.left = `${Math.round(rect.left)}px`;
  root.style.top = `${Math.round(Math.max(rect.bottom, barBottom) + 10)}px`;
  root.style.width = "max-content";
  root.style.maxWidth = `${Math.max(280, Math.round(window.innerWidth - rect.left - 24))}px`;
  root.style.zIndex = "40";
  attachToHtml(root);
  return true;
}

function alignSmartpage(root, block) {
  root.dataset.mode = "smartpage";
  root.style.position = "";
  root.style.left = "";
  root.style.top = "";
  root.style.width = "";
  root.style.maxWidth = "";
  root.style.zIndex = "";
  if (block.nextSibling !== root) block.insertAdjacentElement("afterend", root);
}

export function placeDocMeta(root) {
  if (!root) return false;
  const kind = parseDocPath(location.pathname)?.kind || "";
  if (kind === "smartpage") {
    const block = findSmartTitleBlock();
    if (block?.parentElement) {
      alignSmartpage(root, block);
      return markPlaced(root, "smartpage");
    }
    if (keepLastPlace(root, "smartpage")) return true;
    parkPending(root);
    return false;
  }

  const title = document.getElementById("melo-doc-title");
  if (title && alignDocOverlay(root, title)) return markPlaced(root, "doc");
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
  };
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
}
