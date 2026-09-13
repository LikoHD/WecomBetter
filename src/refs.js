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
    const editable = document.querySelector("#root-editable");
    if (editable?.parentElement) return editable.parentElement;
    return document.querySelector("#sc-page-content") || document.querySelector("#sc-scroll-container");
  }
  const zoom = document.querySelector("#zoomable-container");
  if (zoom?.parentElement) return zoom.parentElement;
  return document.querySelector("#scrollable-content") || document.querySelector("#scrollable");
}

function findCanvas(host) {
  if (!host) return null;
  return (
    host.querySelector(":scope > #zoomable-container") ||
    host.querySelector(":scope > #root-editable") ||
    host.querySelector(":scope > #sc-page-content")
  );
}

export function mainContentReady() {
  const kind = parseDocPath(location.pathname)?.kind;
  if (kind === "smartpage") {
    const editable = document.querySelector("#root-editable");
    if (!editable) return false;
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
  footer.style.width = `${Math.round(targetRect.width)}px`;
  footer.style.marginLeft = `${Math.max(0, Math.round(targetRect.left - hostRect.left))}px`;
  footer.style.marginTop = "";
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
  const empty = isColEmpty(findHeld(REFS_ROOT_ID)) && isColEmpty(findHeld(WANDER_ROOT_ID));
  node.setAttribute("data-empty", empty ? "1" : "0");
  const spacer = document.getElementById(FOOTER_SPACE_ID);
  if (spacer) spacer.hidden = empty;
}

function footerParked(root, host, canvas, sensor) {
  if (root.parentElement !== host) return false;
  const next = root.nextElementSibling;
  if (canvas) return canvas.nextElementSibling === root;
  if (next?.id === FOOTER_SPACE_ID) return true;
  if (sensor) return next === sensor;
  return next == null;
}

export function hideFooter() {
  const footer = document.getElementById(FOOTER_ROOT_ID) || heldFooter;
  footer?.remove();
  document.getElementById(FOOTER_SPACE_ID)?.remove();
}

export function placeFooter(footer) {
  const root = footer || document.getElementById(FOOTER_ROOT_ID) || heldFooter;
  if (!root) return;
  if (!mainContentReady()) {
    root.remove();
    document.getElementById(FOOTER_SPACE_ID)?.remove();
    return;
  }
  const host = findRefsHost();
  if (host) {
    const canvas = findCanvas(host);
    const sensor = host.querySelector(":scope > .resize-sensor");
    if (!footerParked(root, host, canvas, sensor)) {
      if (canvas) host.insertBefore(root, canvas.nextSibling);
      else if (sensor) host.insertBefore(root, sensor);
      else host.appendChild(root);
    }
  } else if (!document.documentElement.contains(root)) {
    (document.body || document.documentElement).appendChild(root);
  }
  placeSpacer(root);
  alignFooter(root);
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

export function ensureFooter() {
  let footer = document.getElementById(FOOTER_ROOT_ID) || heldFooter;
  if (!footer) {
    footer = document.createElement("div");
    footer.id = FOOTER_ROOT_ID;
    footer.setAttribute("data-empty", "1");
  }
  heldFooter = footer;
  const refs = ensureCol(REFS_ROOT_ID, "本文关联文档");
  const wander = ensureCol(WANDER_ROOT_ID, "You may also wander");
  if (refs.parentElement !== footer) footer.insertBefore(refs, footer.firstChild);
  if (wander.parentElement !== footer) footer.appendChild(wander);
  if (refs.nextElementSibling !== wander) footer.insertBefore(refs, wander);
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
  root.setAttribute("data-empty", list.length ? "0" : "1");
  syncFooterEmpty();
  if (!list.length) {
    placeFooter();
    return;
  }

  const head = document.createElement("div");
  head.className = "wxrd-head";
  const title = document.createElement("div");
  title.className = "wxrd-head-title";
  title.textContent = `本文关联文档（${list.length}）`;
  head.appendChild(title);
  root.appendChild(head);

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
