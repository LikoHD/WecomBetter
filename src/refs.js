import { enrichDocStats, formatDocDate } from "./search.js";
import { FOOTER_ROOT_ID, FOOTER_SPACE_ID, REFS_MAX_VISIBLE, REFS_ROOT_ID, WANDER_ROOT_ID, parseDocPath } from "./shared.js";

const ICONS = {
  smartpage:
    '<svg class="wxrd-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path fill="#3999DA" d="M4 5.35C4 4.6 4.6 4 5.35 4h9.3C15.4 4 16 4.6 16 5.35v9.4c0 .69-.56 1.25-1.25 1.25h-9.4C4.6 16 4 15.4 4 14.65v-9.3z"/><path fill="#5FB8F3" d="M12.15 0C12.9 0 13.5.6 13.5 1.35v13.4c0 .69.56 1.25 1.25 1.25H1.35C.6 16 0 15.4 0 14.65V1.35C0 .6.6 0 1.35 0h10.8z"/><path fill="#fff" d="M4.3 6.64a.2.2 0 01.4 0l.66 1.87c.02.06.07.1.13.13l1.87.67a.2.2 0 010 .38l-1.87.67a.2.2 0 00-.13.13l-.67 1.87a.2.2 0 01-.38 0l-.67-1.87a.2.2 0 00-.13-.13l-1.87-.67a.2.2 0 010-.38l1.87-.67a.2.2 0 00.13-.13l.67-1.87z"/></svg>',
  doc:
    '<svg class="wxrd-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path fill="#2B7DE1" d="M3 1.75A1.75 1.75 0 014.75 0h5.09L13 3.2V14.25A1.75 1.75 0 0111.25 16h-6.5A1.75 1.75 0 013 14.25V1.75z"/><path fill="#7CB4F2" d="M9.7 0v2.4c0 .5.4.9.9.9H13L9.7 0z"/><path fill="#fff" d="M5 7h6v1.2H5V7zm0 2.3h6v1.2H5V9.3z"/></svg>',
  sheet:
    '<svg class="wxrd-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect width="16" height="16" rx="3" fill="#07C160"/><path fill="#fff" d="M3.2 3.2h9.6v1.4H3.2V3.2zm0 2.8h2.8v6.8H3.2V6zm4 0h5.6v2H7.2V6zm0 3.2h5.6v3.6H7.2V9.2z"/></svg>',
  smartsheet:
    '<svg class="wxrd-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect width="16" height="16" rx="3" fill="#00A5A8"/><path fill="#fff" d="M3 3.5h10v2H3v-2zm0 3.5h4.4v5.5H3V7zm5.6 0H13v2.4H8.6V7zm0 3.4H13V13H8.6v-2.6z"/></svg>',
  slide:
    '<svg class="wxrd-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect width="16" height="16" rx="3" fill="#F5A623"/><path fill="#fff" d="M3.2 3.4h9.6v7.2H3.2V3.4zm3.2 8.4h3.2V13H6.4v-1.2z"/></svg>',
};

const REFRESH_ICON =
  '<svg class="wxwd-refresh-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M11.577 5.211a7.8 7.8 0 105.938 2.274l.849-.849a9 9 0 11-7.195-2.598l-1.19-1.19.85-.848 2.474 2.475a.5.5 0 010 .707l-.495.495-1.98 1.98-.848-.849 1.597-1.597z" fill="currentColor" fill-rule="evenodd" fill-opacity=".9"/></svg>';
const CLOSE_ICON =
  '<svg class="wxrd-close-icon" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M4.22 4.22a.75.75 0 011.06 0L8 6.94l2.72-2.72a.75.75 0 111.06 1.06L9.06 8l2.72 2.72a.75.75 0 11-1.06 1.06L8 9.06l-2.72 2.72a.75.75 0 11-1.06-1.06L6.94 8 4.22 5.28a.75.75 0 010-1.06z"/></svg>';
const PERSON_ICON =
  '<svg class="wxrd-person" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.3 19.8v-.485c0-.229-.235-.605-.44-.705l-5.66-2.76c-1.527-.745-1.904-2.546-.81-3.843l.36-.428c.552-.654 1.05-2.014 1.05-2.868V7c0-1.545-1.254-2.8-2.8-2.8A2.803 2.803 0 009.2 7v1.71c0 .856.496 2.21 1.05 2.866l.36.429c1.097 1.299.715 3.099-.81 3.843L4.14 18.61c-.203.099-.44.479-.44.705v.485h16.6zM2.5 20v-.685c0-.685.498-1.483 1.114-1.784l5.66-2.762c.821-.4 1.012-1.288.42-1.99l-.362-.429C8.596 11.478 8 9.85 8 8.71V7a4 4 0 018 0v1.71c0 1.14-.6 2.773-1.332 3.642l-.361.428c-.59.699-.406 1.588.419 1.99l5.66 2.762c.615.3 1.114 1.093 1.114 1.783V20a1 1 0 01-1 1h-17a1 1 0 01-1-1z" fill="currentColor" fill-rule="evenodd" fill-opacity=".9"/></svg>';

const refsUi = {
  items: [],
  signature: "",
  expanded: false,
  statsKey: "",
  enriching: "",
};

let heldFooter = null;
const dismissedPages = new Set();

export function isFooterDismissed() {
  return dismissedPages.has(currentPageKey());
}

export function dismissFooter() {
  dismissedPages.add(currentPageKey());
  hideFooter();
}

const refStatsMemo = new Map();

function rememberDocStats(item) {
  if (!item?.id) return;
  const prev = refStatsMemo.get(item.id) || {};
  const createdAt = item.createdAt || prev.createdAt || 0;
  const members = Number(item.members) > 0 ? item.members : prev.members || 0;
  if (createdAt) item.createdAt = createdAt;
  if (members) item.members = members;
  if (createdAt || members) refStatsMemo.set(item.id, { createdAt, members });
}

function applyRefStats(items) {
  (items || []).forEach(rememberDocStats);
}

function needsRefStats(items) {
  return (items || []).some(function (item) {
    return item && item.id && (!item.createdAt || !(Number(item.members) > 0));
  });
}

function findRefsHost() {
  if (parseDocPath(location.pathname)?.kind === "smartpage") {
    // 滚动容器的直接子级才是整页画布；内层 jumper / #root-editable 是 React 编辑区，
    // 插进去会落在 min-height 撑开的首屏空白里，正文稍后加载就会整页跳动。
    return document.querySelector("#sc-scroll-container");
  }
  const zoom = document.querySelector("#zoomable-container");
  if (zoom?.parentElement) return zoom.parentElement;
  return document.querySelector("#scrollable-content") || document.querySelector("#scrollable");
}

function findCanvas(host) {
  if (!host) return null;
  if (parseDocPath(location.pathname)?.kind === "smartpage") {
    const editable = document.getElementById("root-editable");
    let node = editable;
    while (node && node.parentElement !== host) node = node.parentElement;
    if (node && node.parentElement === host) return node;
    const jumpers = host.querySelectorAll(":scope > .jumper-dom-container");
    return jumpers[jumpers.length - 1] || null;
  }
  return (
    host.querySelector(":scope > #zoomable-container") ||
    host.querySelector(":scope > #root-editable") ||
    host.querySelector(":scope > #sc-page-content")
  );
}

function blockText(el) {
  return String(el?.innerText || el?.textContent || "")
    .replace(/[\u200b\u200c\u200d\u2060\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isTitleOnlyLabel(text) {
  return /^(标题|无标题|无标题智能文档|无标题文档|untitled(?:\s+document)?)$/i.test(String(text || "").trim());
}

function isPlaceholderBodyText(text) {
  return /^(输入正文|输入文字|输入内容|点击输入|键入文字|\/)$/.test(String(text || "").trim());
}

function asTime(ts) {
  const n = Number(ts) || 0;
  if (!n) return 0;
  return n > 1e12 ? n : n * 1000;
}

function isCreatedToday(ts) {
  const ms = asTime(ts);
  if (!ms) return false;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function isViewerCreator(meta) {
  if (!meta) return false;
  if (meta.isSelf) return true;
  const name = String(meta.name || "").trim().toLowerCase();
  const viewer = String(meta.viewerId || "").trim().toLowerCase();
  return Boolean(name && viewer && name === viewer);
}

export function isBlankEditorPage() {
  const kind = parseDocPath(location.pathname)?.kind;
  if (kind === "smartpage") {
    const editable = document.getElementById("root-editable");
    if (!editable) return true;
    const titleEl = editable.querySelector(".sc-text-input-content, .textInput__pIjhc");
    let body = 0;
    editable.querySelectorAll(".sc-block-wrapper").forEach(function (el) {
      if (titleEl && (el === titleEl || el.contains(titleEl))) return;
      if (/sc-block-(image|video|file|embed|simple_table|table|smartsheet|sheet)/.test(String(el.className))) {
        body += 1;
        return;
      }
      const text = blockText(el);
      if (text && !isTitleOnlyLabel(text) && !isPlaceholderBodyText(text)) body += 1;
    });
    return body === 0;
  }
  return false;
}

export function shouldHideDocFooter(meta) {
  if (!isBlankEditorPage()) return false;
  if (!meta) return true;
  if (!isViewerCreator(meta)) return false;
  if (!meta.createdAt) return true;
  return isCreatedToday(meta.createdAt);
}

export function mainContentReady() {
  const kind = parseDocPath(location.pathname)?.kind;
  if (kind === "smartpage") {
    const scroll = document.querySelector("#sc-scroll-container");
    const jumper = scroll?.querySelector(":scope > .jumper-dom-container");
    const editable = document.querySelector("#root-editable");
    if (!scroll || !jumper || !editable) return false;
    return editable.getBoundingClientRect().height >= 80 && editable.childElementCount > 0;
  }
  if (kind === "doc") {
    const zoom =
      document.querySelector("#zoomable-container") || document.querySelector("#zoomable-content-canvas");
    if (!zoom) return false;
    return zoom.getBoundingClientRect().height >= 80;
  }
  return false;
}

let unlockFor = "";
let settleH = 0;
let settleAt = 0;
let revealFor = "";
let lastRefsN = -1;
let lastRefsAt = 0;
let lastFootH = -1;
let lastFootAt = 0;

export function resetFooterGate() {
  unlockFor = "";
  settleH = 0;
  settleAt = 0;
  revealFor = "";
  lastRefsN = -1;
  lastRefsAt = 0;
  lastFootH = -1;
  lastFootAt = 0;
  const footer = document.getElementById(FOOTER_ROOT_ID);
  if (footer) {
    footer.style.marginTop = "0px";
    footer.setAttribute("data-pending", "1");
  }
  const spacer = document.getElementById(FOOTER_SPACE_ID);
  if (spacer) spacer.setAttribute("data-pending", "1");
}

function currentDocId() {
  return parseDocPath(location.pathname)?.id || "";
}

export function currentPageKey() {
  const id = currentDocId();
  let page = "";
  try {
    page = new URLSearchParams(location.search).get("p") || "";
  } catch {
    page = "";
  }
  return `${id}:${page}`;
}

function contentHeightReady() {
  const scroll = document.querySelector("#sc-scroll-container");
  const editable = document.getElementById("root-editable");
  if (!scroll || !editable) return false;
  const superlist = editable.querySelector(".jumper-dom-superlist");
  const node = superlist || editable;
  const height = Math.round(node.getBoundingClientRect().height);
  if (height < 80) return false;
  const now = Date.now();
  if (Math.abs(height - settleH) > 2) {
    settleH = height;
    settleAt = now;
    return false;
  }
  return now - settleAt >= 240;
}

export function footerLayoutReady() {
  const id = currentPageKey();
  if (unlockFor && unlockFor !== id) resetFooterGate();
  if (!mainContentReady()) return false;
  if (unlockFor === id) return true;
  const kind = parseDocPath(location.pathname)?.kind;
  if (kind !== "smartpage") {
    unlockFor = id;
    return true;
  }
  if (!contentHeightReady()) return false;
  unlockFor = id;
  return true;
}

export function footerPending() {
  const footer = document.getElementById(FOOTER_ROOT_ID);
  return Boolean(footer && footer.getAttribute("data-pending") === "1");
}

function footerRevealReady() {
  const id = currentPageKey();
  if (revealFor === id) return true;
  if (!footerLayoutReady()) return false;
  const refs = document.getElementById(REFS_ROOT_ID);
  const wander = document.getElementById(WANDER_ROOT_ID);
  const footer = document.getElementById(FOOTER_ROOT_ID);
  if (!footer) return false;
  const refsN = refs ? refs.querySelectorAll(".wxrd-item").length : 0;
  const now = Date.now();
  if (refsN !== lastRefsN) {
    lastRefsN = refsN;
    lastRefsAt = now;
    return false;
  }
  if (now - lastRefsAt < 200) return false;
  const wanderReady = wander && wander.getAttribute("data-empty") === "0";
  if (!wanderReady && now - lastRefsAt < 800) return false;
  const height = Math.round(footer.getBoundingClientRect().height);
  if (height < 24) return false;
  if (height !== lastFootH) {
    lastFootH = height;
    lastFootAt = now;
    return false;
  }
  if (now - lastFootAt < 120) return false;
  revealFor = id;
  return true;
}

function syncPending(footer) {
  const pending = footerRevealReady() ? "0" : "1";
  footer.setAttribute("data-pending", pending);
  const spacer = document.getElementById(FOOTER_SPACE_ID);
  if (spacer) spacer.setAttribute("data-pending", pending);
}

const FOOTER_CONTENT_GAP = 100;

function lastMeaningfulBottom(root) {
  if (!root) return 0;
  const nodes = root.querySelectorAll(".sc-block-wrapper, table, iframe, embed, object, img, video");
  let bottom = 0;
  for (let i = 0; i < nodes.length; i += 1) {
    const el = nodes[i];
    if (el.closest(`#${FOOTER_ROOT_ID}`)) continue;
    const rect = el.getBoundingClientRect();
    if (rect.height < 6 || rect.width < 8) continue;
    if (rect.bottom > bottom) bottom = rect.bottom;
  }
  return bottom;
}

function alignFooter(footer) {
  const host = footer.parentElement;
  const target =
    document.querySelector("#sc-page-content") ||
    document.querySelector("#zoomable-content-canvas") ||
    document.querySelector("#zoomable-container") ||
    document.querySelector(".surface");
  if (!host || !target) return;
  const hostRect = host.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  if (targetRect.width < 240) return;
  const width = `${Math.round(targetRect.width)}px`;
  const marginLeft = `${Math.max(0, Math.round(targetRect.left - hostRect.left))}px`;
  if (footer.style.width !== width) footer.style.width = width;
  if (footer.style.marginLeft !== marginLeft) footer.style.marginLeft = marginLeft;

  const canvas = findCanvas(host);
  const content =
    (canvas && (canvas.querySelector("#root-editable") || canvas.querySelector("#sc-page-content"))) ||
    document.getElementById("root-editable") ||
    document.getElementById("sc-page-content");
  if (canvas && content && host.contains(canvas)) {
    const lastBottom = lastMeaningfulBottom(content);
    const bottom = lastBottom || content.getBoundingClientRect().bottom;
    const pull = `${Math.round(bottom + FOOTER_CONTENT_GAP - canvas.getBoundingClientRect().bottom)}px`;
    if (footer.style.marginTop !== pull) footer.style.marginTop = pull;
  } else if (footer.style.marginTop) {
    footer.style.marginTop = "0px";
  }
}

function ensureSpacer() {
  let spacer = document.getElementById(FOOTER_SPACE_ID);
  if (!spacer) {
    spacer = document.createElement("div");
    spacer.id = FOOTER_SPACE_ID;
    spacer.setAttribute("aria-hidden", "true");
  }
  return spacer;
}

function placeSpacer(footer) {
  const spacer = ensureSpacer();
  const host = footer.parentElement;
  if (host && footer.nextSibling !== spacer) host.insertBefore(spacer, footer.nextSibling);
  spacer.hidden = footer.getAttribute("data-empty") === "1";
}

function isColEmpty(el) {
  return !el || el.getAttribute("data-empty") !== "0";
}

export function syncFooterEmpty(footer) {
  const node = footer || findHeld(FOOTER_ROOT_ID);
  if (!node) return;
  node.setAttribute("data-empty", "0");
  const spacer = document.getElementById(FOOTER_SPACE_ID);
  if (spacer) spacer.hidden = false;
}

function footerParked(root, host, canvas) {
  if (!host || !canvas || root.parentElement !== host) return false;
  return canvas.nextElementSibling === root;
}

export function hideFooter() {
  const footer = document.getElementById(FOOTER_ROOT_ID) || heldFooter;
  footer?.remove();
  document.getElementById(FOOTER_SPACE_ID)?.remove();
}

export function placeFooter(footer) {
  if (isFooterDismissed()) {
    hideFooter();
    return;
  }
  const root = footer || document.getElementById(FOOTER_ROOT_ID) || heldFooter;
  if (!root) return;
  const host = findRefsHost();
  const canvas = host && findCanvas(host);
  if (!host || !canvas) {
    root.remove();
    document.getElementById(FOOTER_SPACE_ID)?.remove();
    return;
  }
  if (!footerParked(root, host, canvas)) {
    host.insertBefore(root, canvas.nextSibling);
  }
  placeSpacer(root);
  if (!footerLayoutReady()) {
    root.style.marginTop = "0px";
    root.setAttribute("data-pending", "1");
    const spacer = document.getElementById(FOOTER_SPACE_ID);
    if (spacer) spacer.setAttribute("data-pending", "1");
    return;
  }
  alignFooter(root);
  syncPending(root);
}

export function placeRefsRoot(root) {
  if (root?.id === FOOTER_ROOT_ID) {
    placeFooter(root);
    return;
  }
  if (root?.parentElement?.id === FOOTER_ROOT_ID) {
    placeFooter(root.parentElement);
    return;
  }
  placeFooter(document.getElementById(FOOTER_ROOT_ID) || root);
}

function findHeld(id) {
  return document.getElementById(id) || heldFooter?.querySelector(`#${id}`) || null;
}

function ensureCol(id, ariaLabel) {
  let col = findHeld(id);
  if (!col) {
    col = document.createElement("div");
    col.id = id;
    col.setAttribute("data-empty", "1");
    if (ariaLabel) col.setAttribute("aria-label", ariaLabel);
  }
  return col;
}

function ensureCloseBtn(footer) {
  let btn = footer.querySelector(":scope > .wxrd-close");
  if (btn) return btn;
  btn = document.createElement("button");
  btn.type = "button";
  btn.className = "wxrd-close";
  btn.setAttribute("aria-label", "关闭引用");
  btn.insertAdjacentHTML("afterbegin", CLOSE_ICON);
  btn.addEventListener("click", function (event) {
    event.preventDefault();
    event.stopPropagation();
    dismissFooter();
  });
  footer.appendChild(btn);
  return btn;
}

export function ensureFooter() {
  if (isFooterDismissed()) {
    hideFooter();
    return heldFooter || document.createElement("div");
  }
  let footer = document.getElementById(FOOTER_ROOT_ID) || heldFooter;
  if (!footer) {
    footer = document.createElement("div");
    footer.id = FOOTER_ROOT_ID;
    footer.setAttribute("data-empty", "1");
    footer.setAttribute("data-pending", "1");
  }
  heldFooter = footer;
  const refs = ensureCol(REFS_ROOT_ID, "本文关联文档");
  const wander = ensureCol(WANDER_ROOT_ID, "You may also wander");
  if (refs.parentElement !== footer) footer.insertBefore(refs, footer.firstChild);
  if (wander.parentElement !== footer) footer.appendChild(wander);
  if (refs.nextElementSibling !== wander) footer.insertBefore(refs, wander);
  ensureCloseBtn(footer);
  syncFooterEmpty(footer);
  placeFooter(footer);
  return footer;
}

function ensureRefsRoot() {
  ensureFooter();
  return findHeld(REFS_ROOT_ID);
}

export function unmountRefs() {
  const refs = document.getElementById(REFS_ROOT_ID);
  if (refs) {
    refs.replaceChildren();
    refs.setAttribute("data-empty", "1");
  }
  refsUi.items = [];
  refsUi.signature = "";
  refsUi.expanded = false;
  refsUi.statsKey = "";
  refsUi.enriching = "";
  syncFooterEmpty();
}

function paintMeta(item) {
  const date = formatDocDate(item.createdAt);
  const members = Number(item.members) || 0;
  if (!date && members <= 0) return null;
  const meta = document.createElement("span");
  meta.className = "wxrd-meta";
  if (date) {
    const time = document.createElement("span");
    time.className = "wxrd-meta-date";
    time.textContent = date;
    meta.appendChild(time);
  }
  if (members > 0) {
    const people = document.createElement("span");
    people.className = "wxrd-meta-members";
    people.insertAdjacentHTML("afterbegin", PERSON_ICON);
    const num = document.createElement("span");
    num.textContent = String(members);
    people.appendChild(num);
    meta.appendChild(people);
  }
  return meta;
}

function paintDocLink(item, itemClass, nameClass) {
  const link = document.createElement("a");
  link.className = itemClass;
  link.href = item.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.title = item.title;
  link.insertAdjacentHTML("afterbegin", ICONS[item.kind] || ICONS.doc);
  const name = document.createElement("span");
  name.className = nameClass;
  name.textContent = item.title;
  link.appendChild(name);
  const meta = paintMeta(item);
  if (meta) link.appendChild(meta);
  return link;
}

function itemSig(item) {
  return `${item.id}\t${item.title}\t${item.kind}\t${item.createdAt || 0}\t${item.members || 0}`;
}

export function renderRefDocs(items) {
  if (isFooterDismissed()) return;
  const list = Array.isArray(items) ? items : [];
  applyRefStats(list);
  const root = ensureRefsRoot();
  const visible = refsUi.expanded ? list : list.slice(0, REFS_MAX_VISIBLE);
  const signature = `${list.map(itemSig).join("|")}#${refsUi.expanded ? 1 : 0}`;
  refsUi.items = list;
  if (signature === refsUi.signature && root.childElementCount) {
    placeFooter();
    enrichRefStats(list);
    return;
  }

  refsUi.signature = signature;
  root.replaceChildren();
  root.setAttribute("data-empty", "0");
  syncFooterEmpty();

  const head = document.createElement("div");
  head.className = "wxrd-head";
  const title = document.createElement("div");
  title.className = "wxrd-head-title";
  title.textContent = `本文关联文档（${list.length}）`;
  head.appendChild(title);
  root.appendChild(head);

  if (!list.length) {
    const empty = document.createElement("div");
    empty.className = "wxrd-empty";
    empty.textContent = "暂无关联文档";
    root.appendChild(empty);
    placeFooter();
    return;
  }

  const listEl = document.createElement("div");
  listEl.className = "wxrd-list";
  visible.forEach(function (item) {
    listEl.appendChild(paintDocLink(item, "wxrd-item", "wxrd-name"));
  });
  root.appendChild(listEl);

  if (list.length > REFS_MAX_VISIBLE) {
    const more = document.createElement("button");
    more.type = "button";
    more.className = "wxrd-more";
    more.setAttribute("aria-expanded", refsUi.expanded ? "true" : "false");
    more.textContent = refsUi.expanded
      ? "收起"
      : `展示全部（还有 ${list.length - REFS_MAX_VISIBLE} 篇）`;
    more.addEventListener("click", function (event) {
      event.preventDefault();
      refsUi.expanded = !refsUi.expanded;
      refsUi.signature = "";
      renderRefDocs(refsUi.items);
    });
    root.appendChild(more);
  }
  placeFooter();
  enrichRefStats(list);
}

function enrichRefStats(items) {
  const list = items || [];
  const key = list
    .map(function (item) {
      return item?.id || "";
    })
    .join("|");
  if (!key || !needsRefStats(list)) {
    refsUi.statsKey = key;
    return;
  }
  if (refsUi.enriching === key || refsUi.statsKey === key) return;
  refsUi.enriching = key;
  enrichDocStats(list)
    .then(function () {
      applyRefStats(list);
      applyRefStats(refsUi.items);
      refsUi.statsKey = key;
      refsUi.signature = "";
      renderRefDocs(refsUi.items);
    })
    .finally(function () {
      if (refsUi.enriching === key) refsUi.enriching = "";
    });
}

export function paintWanderCol(items, options) {
  if (isFooterDismissed()) return;
  const footer = ensureFooter();
  const root = findHeld(WANDER_ROOT_ID);
  const list = Array.isArray(items) ? items : [];
  const opts = options && typeof options === "object" ? options : {};
  const loading = Boolean(opts.loading);
  root.replaceChildren();
  root.setAttribute("data-empty", loading || list.length ? "0" : "1");

  if (!loading && !list.length) {
    syncFooterEmpty(footer);
    placeFooter(footer);
    return;
  }

  const head = document.createElement("div");
  head.className = "wxwd-head";
  const title = document.createElement("div");
  title.className = "wxwd-head-title";
  title.textContent = `You may also wander（${list.length}）`;
  head.appendChild(title);
  const refresh = document.createElement("button");
  refresh.type = "button";
  refresh.className = "wxwd-refresh";
  refresh.setAttribute("aria-label", "刷新推荐文档");
  refresh.insertAdjacentHTML("afterbegin", REFRESH_ICON);
  refresh.addEventListener("click", function (event) {
    event.preventDefault();
    if (typeof opts.onRefresh === "function") opts.onRefresh();
  });
  head.appendChild(refresh);
  root.appendChild(head);

  if (loading && !list.length) {
    const status = document.createElement("div");
    status.className = "wxwd-status";
    status.textContent = "加载中…";
    root.appendChild(status);
  } else {
    const listEl = document.createElement("div");
    listEl.className = "wxwd-list";
    list.forEach(function (item) {
      listEl.appendChild(paintDocLink(item, "wxwd-item", "wxwd-name"));
    });
    root.appendChild(listEl);
  }

  syncFooterEmpty(footer);
  placeFooter(footer);
}
