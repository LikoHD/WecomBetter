import {
  INSERT_DOC_EVENT,
  MENTION_EVENT,
  MENTION_ROOT_ID,
  MSG_SOURCE,
  PICK_MENTION_EVENT,
  cleanText,
  extensionAlive,
  nativeMentionPanel,
} from "./shared.js";
import { fetchRecentDocs, fileIcon, formatDocDate, searchDocs } from "./search.js";

const DEBOUNCE_MS = 180;
const LIST_LIMIT = 8;
const RECENT_POOL = 24;
const PEOPLE_POLL_MS = 200;
const RECENT_TTL = 120000;
const SEARCH_TTL = 60000;
const MENTION_GUARD_CLASS = "wxmd-mention-on";
const NATIVE_AT_LAYER_ID = "AT_MANAGER_ID";
const CLOSE_MS = 150;

const PERSON_ICON =
  '<svg class="wxmd-glyph" viewBox="0 0 20 20" aria-hidden="true"><path fill="currentColor" d="M10 10.2a3.1 3.1 0 100-6.2 3.1 3.1 0 000 6.2zM4.4 16.2c.5-2.3 2.6-3.6 5.6-3.6s5.1 1.3 5.6 3.6H4.4z"/></svg>';
const MORE_ICON =
  '<svg class="wxmd-glyph" viewBox="0 0 20 20" aria-hidden="true"><path fill="currentColor" d="M4 5.2h12v1.3H4V5.2zm0 4.1h12v1.3H4V9.3zm0 4.2h8v1.3H4v-1.3z"/></svg>';

let mounted = false;
let guardOn = false;
let guardWait = false;
let paintedPeople = "";
let paintedDocs = "";
let ignorePeopleKey = "";
let acceptPeopleAt = 0;
let warming = null;

const memory = {
  recent: null,
  search: new Map(),
  people: new Map(),
};

const ui = {
  root: null,
  open: false,
  query: "",
  people: [],
  docs: [],
  active: -1,
  seq: 0,
  timer: 0,
  peopleTimer: 0,
  caret: null,
  error: "",
  emptyConfirmed: false,
  pin: null,
  closeTimer: 0,
  dismissed: false,
};

export function setMentionGuard(on) {
  guardOn = Boolean(on);
  const root = document.documentElement;
  if (!root) {
    if (!guardWait) {
      guardWait = true;
      document.addEventListener(
        "DOMContentLoaded",
        function () {
          guardWait = false;
          setMentionGuard(guardOn);
        },
        { once: true }
      );
    }
    return;
  }
  root.classList.toggle(MENTION_GUARD_CLASS, guardOn);
}

function readPeople() {
  const panel = nativeMentionPanel();
  if (!panel) return [];
  const people = [];
  panel.querySelectorAll(".od_editor_atPopPanel_item").forEach(function (el) {
    const label = cleanText(el.querySelector(".od_editor_atPopPanel_item_text")?.textContent || el.textContent);
    if (!label) return;
    const img = el.querySelector("img");
    people.push({
      kind: label.startsWith("所有人") ? "all" : "person",
      label,
      avatar: img?.getAttribute("src") || "",
    });
  });
  const more = panel.querySelector(".od_editor_atPopPanel_more");
  if (more) {
    people.push({
      kind: "more",
      label: cleanText(more.textContent) || "从通讯录选择…",
      avatar: "",
    });
  }
  return people;
}

function peopleKey(list) {
  return (list || [])
    .map(function (item) {
      return `${item.kind}\t${item.label}\t${item.avatar}`;
    })
    .join("\n");
}

function docsKey(list) {
  return (list || [])
    .map(function (item) {
      return `${item.id}\t${item.title}\t${item.time}`;
    })
    .join("\n");
}

function clonePeople(list) {
  return (list || []).map(function (item) {
    return { kind: item.kind, label: item.label, avatar: item.avatar };
  });
}

function isFresh(entry, ttl) {
  return Boolean(entry && Date.now() - entry.at < ttl);
}

function rememberDocs(query, docs) {
  const list = docs.slice();
  if (!query) {
    memory.recent = { at: Date.now(), docs: list };
    return;
  }
  memory.search.delete(query);
  memory.search.set(query, { at: Date.now(), docs: list.slice(0, LIST_LIMIT) });
  while (memory.search.size > 24) {
    const oldest = memory.search.keys().next().value;
    memory.search.delete(oldest);
  }
}

function previewDocs(query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return memory.recent ? memory.recent.docs.slice(0, LIST_LIMIT) : null;
  const cached = memory.search.get(query);
  if (cached) return cached.docs.slice();
  const source = memory.recent?.docs || [];
  const filtered = source
    .filter(function (item) {
      return String(item.title || "").toLowerCase().includes(q);
    })
    .slice(0, LIST_LIMIT);
  return filtered.length ? filtered : null;
}

function rememberPeople(query, list) {
  memory.people.delete(query);
  memory.people.set(query, { at: Date.now(), people: clonePeople(list) });
  while (memory.people.size > 24) {
    const oldest = memory.people.keys().next().value;
    memory.people.delete(oldest);
  }
}

function rows() {
  return ui.people
    .map(function (item) {
      return { type: "person", person: item };
    })
    .concat(
      ui.docs.map(function (item) {
        return { type: "doc", doc: item };
      })
    );
}

function caretKey() {
  if (!ui.caret) return "";
  return [ui.caret.left, ui.caret.top, ui.caret.bottom].map(function (value) {
    return Math.round(value);
  }).join(",");
}

function place() {
  const root = ui.root;
  if (!root || !ui.open) return;
  const width = 320;
  const margin = 8;
  const height = root.offsetHeight || 280;
  const key = caretKey();
  let left = ui.caret ? ui.caret.left : margin;
  let top = ui.caret ? ui.caret.bottom + 8 : margin;
  if (left + width > window.innerWidth - margin) left = Math.max(margin, window.innerWidth - width - margin);
  if (ui.pin && ui.pin.key === key) {
    left = ui.pin.left;
    top = ui.pin.top;
  }
  if (top + height > window.innerHeight - margin) {
    const above = (ui.caret ? ui.caret.top : margin) - height - 8;
    top = above >= margin ? above : margin;
  }
  if (top < margin) top = margin;
  ui.pin = { key, left, top };
  root.style.width = `${width}px`;
  const nextLeft = `${Math.round(left)}px`;
  const nextTop = `${Math.round(top)}px`;
  if (root.style.left !== nextLeft) root.style.left = nextLeft;
  if (root.style.top !== nextTop) root.style.top = nextTop;
}

function sectionTitle(text) {
  const el = document.createElement("div");
  el.className = "wxmd-section";
  el.textContent = text;
  return el;
}

function bindRow(row, index) {
  row.addEventListener("mouseenter", function () {
    ui.active = index;
    paintActive();
  });
}

function renderPeople(startIndex) {
  const frag = document.createDocumentFragment();
  if (!ui.people.length) {
    const known = memory.people.get(ui.query) || memory.people.get("");
    const reserve = known?.people?.length || 0;
    if (!reserve || !nativeMentionPanel()) return frag;
    frag.append(sectionTitle("联系人"));
    const hold = document.createElement("div");
    hold.className = "wxmd-hold";
    hold.style.height = `${reserve * 32}px`;
    frag.append(hold);
    return frag;
  }
  frag.append(sectionTitle("联系人"));
  ui.people.forEach(function (person, offset) {
    const index = startIndex + offset;
    const row = document.createElement("button");
    row.type = "button";
    row.className = "wxmd-item";
    if (person.kind === "more") row.classList.add("is-more");
    row.setAttribute("role", "option");
    row.dataset.index = String(index);
    const icon = document.createElement("span");
    icon.className = "wxmd-avatar";
    if (person.avatar) {
      const img = document.createElement("img");
      img.alt = "";
      img.src = person.avatar;
      icon.append(img);
    } else {
      icon.innerHTML = person.kind === "more" ? MORE_ICON : PERSON_ICON;
    }
    const name = document.createElement("span");
    name.className = "wxmd-name";
    name.textContent = person.label;
    row.append(icon, name);
    bindRow(row, index);
    frag.append(row);
  });
  return frag;
}

function renderDocs(startIndex) {
  const frag = document.createDocumentFragment();
  if (!ui.docs.length && !ui.emptyConfirmed && !ui.error) return frag;
  frag.append(sectionTitle(ui.query ? "文档" : "最近文档"));
  if (ui.error && !ui.docs.length) {
    const empty = document.createElement("div");
    empty.className = "wxmd-empty";
    empty.textContent = ui.error;
    frag.append(empty);
    return frag;
  }
  if (!ui.docs.length) {
    const empty = document.createElement("div");
    empty.className = "wxmd-empty";
    empty.textContent = ui.query ? "没有匹配的文档" : "暂无最近文档";
    frag.append(empty);
    return frag;
  }
  ui.docs.forEach(function (item, offset) {
    const index = startIndex + offset;
    const row = document.createElement("button");
    row.type = "button";
    row.className = "wxmd-item";
    row.setAttribute("role", "option");
    row.dataset.index = String(index);
    const icon = document.createElement("span");
    icon.className = "wxmd-icon";
    icon.innerHTML = fileIcon(item.kind);
    const body = document.createElement("span");
    body.className = "wxmd-body";
    const name = document.createElement("span");
    name.className = "wxmd-name";
    name.textContent = item.title || "未命名文档";
    const meta = document.createElement("span");
    meta.className = "wxmd-meta";
    const edited = formatDocDate(item.time);
    meta.textContent = edited ? `修改于 ${edited}` : "";
    body.append(name, meta);
    row.append(icon, body);
    bindRow(row, index);
    frag.append(row);
  });
  return frag;
}

function paintChrome() {
  const root = ui.root;
  if (!root) return;
  const head = root.querySelector(".wxmd-head");
  const title = root.querySelector(".wxmd-title");
  if (head) head.hidden = !ui.query;
  if (title) title.textContent = ui.query ? `搜索「${ui.query}」` : "";
  root.querySelectorAll(".wxmd-section").forEach(function (el) {
    if (el.textContent === "文档" || el.textContent === "最近文档") {
      el.textContent = ui.query ? "文档" : "最近文档";
    }
  });
  const empty = root.querySelector(".wxmd-docs .wxmd-empty");
  if (empty && !ui.error) empty.textContent = ui.query ? "没有匹配的文档" : "暂无最近文档";
}

function ensureSkeleton() {
  const root = ui.root;
  if (root.querySelector(".wxmd-people")) return;
  paintedPeople = "";
  paintedDocs = "";
  root.replaceChildren();

  const head = document.createElement("div");
  head.className = "wxmd-head";
  const title = document.createElement("div");
  title.className = "wxmd-title";
  head.append(title);
  root.append(head);

  const list = document.createElement("div");
  list.className = "wxmd-list";
  list.setAttribute("role", "listbox");
  const people = document.createElement("div");
  people.className = "wxmd-people";
  const docs = document.createElement("div");
  docs.className = "wxmd-docs";
  list.append(people, docs);
  root.append(list);

  const foot = document.createElement("div");
  foot.className = "wxmd-foot";
  foot.textContent = "方向键选择，回车插入";
  root.append(foot);
}

function render() {
  const root = ui.root;
  if (!root) return;
  ensureSkeleton();
  const listRows = rows();
  if (ui.active >= listRows.length) ui.active = listRows.length ? 0 : -1;
  if (ui.active < 0 && listRows.length) ui.active = 0;

  const peopleMark = !ui.people.length && nativeMentionPanel() ? "hold" : "";
  const peopleNow = `${peopleKey(ui.people)}\u0001${peopleMark}`;
  const peopleSlot = root.querySelector(".wxmd-people");
  if (peopleSlot && peopleNow !== paintedPeople) {
    paintedPeople = peopleNow;
    peopleSlot.replaceChildren(renderPeople(0));
  }

  const docsNow = [ui.people.length, ui.error, ui.emptyConfirmed ? "1" : "0", docsKey(ui.docs)].join("\u0001");
  const docsSlot = root.querySelector(".wxmd-docs");
  if (docsSlot && docsNow !== paintedDocs) {
    paintedDocs = docsNow;
    docsSlot.replaceChildren(renderDocs(ui.people.length));
  }

  paintChrome();
  paintActive();
  place();
}

function paintActive() {
  const root = ui.root;
  if (!root) return;
  root.querySelectorAll(".wxmd-item").forEach(function (row) {
    row.classList.toggle("is-active", Number(row.dataset.index) === ui.active);
  });
}

function stopPeopleWatch() {
  window.clearInterval(ui.peopleTimer);
  ui.peopleTimer = 0;
}

function panelOrigin() {
  if (!ui.caret || !ui.pin) return "left top";
  return ui.pin.top < ui.caret.top ? "left bottom" : "left top";
}

function close() {
  window.clearTimeout(ui.timer);
  ui.timer = 0;
  stopPeopleWatch();
  ui.active = -1;
  ui.pin = null;
  const root = ui.root;
  const visible = Boolean(ui.open && root && root.classList.contains("is-in"));
  ui.open = false;
  if (!root) return;
  if (!visible) {
    root.classList.remove("is-in", "is-out");
    return;
  }
  root.classList.remove("is-in");
  root.style.transformOrigin = root.style.transformOrigin || "left top";
  root.classList.add("is-out");
  window.clearTimeout(ui.closeTimer);
  ui.closeTimer = window.setTimeout(function () {
    ui.closeTimer = 0;
    if (ui.open || !ui.root) return;
    ui.root.classList.remove("is-out");
    ui.root.style.pointerEvents = "";
    ui.root.style.visibility = "";
  }, CLOSE_MS);
}

function noteQueryChange(query, previousQuery, wasOpen) {
  const live = readPeople();
  const liveKey = peopleKey(live);
  if (wasOpen && query !== previousQuery) {
    ignorePeopleKey = liveKey;
    acceptPeopleAt = Date.now() + 320;
  } else {
    ignorePeopleKey = "";
    acceptPeopleAt = 0;
  }
  const cached = memory.people.get(query);
  if (cached?.people?.length) ui.people = clonePeople(cached.people);
  else if (!wasOpen && live.length) ui.people = clonePeople(live);
}

function applyPreview(query, wasOpen) {
  const docs = previewDocs(query);
  if (docs && docs.length) {
    ui.emptyConfirmed = false;
    ui.error = "";
    if (docsKey(docs) !== docsKey(ui.docs)) ui.docs = docs.slice();
    return;
  }
  if (docs && !docs.length) {
    ui.docs = [];
    ui.emptyConfirmed = true;
    ui.error = "";
    return;
  }
  ui.emptyConfirmed = false;
  ui.error = "";
  if (!wasOpen) ui.docs = [];
  else {
    const q = query.trim().toLowerCase();
    ui.docs = ui.docs
      .filter(function (item) {
        return String(item.title || "").toLowerCase().includes(q);
      })
      .slice(0, LIST_LIMIT);
  }
}

function syncPeople() {
  if (!ui.open) return;
  muteNativeLayer();
  const next = readPeople();
  if (!next.length) return;
  const key = peopleKey(next);
  if (ignorePeopleKey && key === ignorePeopleKey && Date.now() < acceptPeopleAt) return;
  const changed = key !== peopleKey(ui.people);
  ignorePeopleKey = "";
  const cached = memory.people.get(ui.query);
  if (!changed && cached && peopleKey(cached.people) === key) return;
  if (changed) ui.people = clonePeople(next);
  rememberPeople(ui.query, changed ? next : ui.people);
  if (changed) render();
}

function watchPeople() {
  if (ui.peopleTimer) return;
  ui.peopleTimer = window.setInterval(function () {
    if (!ui.open) return;
    syncPeople();
  }, PEOPLE_POLL_MS);
}

function openPanel(resetPin) {
  if (!ui.root) return;
  const opening = !ui.open;
  if (resetPin) ui.pin = null;
  window.clearTimeout(ui.closeTimer);
  ui.closeTimer = 0;
  ui.open = true;
  ui.root.classList.remove("is-out");
  ui.root.style.pointerEvents = "auto";
  ui.root.style.visibility = "visible";
  muteNativeLayer();
  watchPeople();
  render();
  if (!opening) return;
  ui.root.classList.remove("is-in");
  ui.root.style.transformOrigin = panelOrigin();
  void ui.root.offsetWidth;
  ui.root.classList.add("is-in");
}

function fetchRecent() {
  if (isFresh(memory.recent, RECENT_TTL)) return Promise.resolve(memory.recent.docs);
  if (!warming) {
    warming = fetchRecentDocs(RECENT_POOL)
      .then(function (docs) {
        rememberDocs("", docs);
        return docs;
      })
      .finally(function () {
        warming = null;
      });
  }
  return warming;
}

async function load(query) {
  const seq = ++ui.seq;
  if (!query && isFresh(memory.recent, RECENT_TTL)) return;
  if (query && isFresh(memory.search.get(query), SEARCH_TTL)) return;
  try {
    let docs = [];
    if (!query) docs = await fetchRecent();
    else {
      docs = await searchDocs(query, 5);
      if (!docs.length) docs = await searchDocs(query, 6);
      docs = docs.slice(0, LIST_LIMIT);
      rememberDocs(query, docs);
    }
    if (seq !== ui.seq || !ui.open || ui.query !== query) return;
    const next = docs.slice(0, LIST_LIMIT);
    ui.emptyConfirmed = next.length === 0;
    ui.error = "";
    if (docsKey(next) === docsKey(ui.docs)) return;
    ui.docs = next;
    render();
  } catch {
    if (seq !== ui.seq || !ui.open || ui.query !== query || ui.docs.length) return;
    ui.error = "文档列表加载失败";
    ui.emptyConfirmed = false;
    render();
  }
}

function scheduleLoad(query) {
  window.clearTimeout(ui.timer);
  ui.timer = 0;
  const entry = query ? memory.search.get(query) : memory.recent;
  if (isFresh(entry, query ? SEARCH_TTL : RECENT_TTL)) return;
  ui.timer = window.setTimeout(function () {
    ui.timer = 0;
    load(query);
  }, query ? DEBOUNCE_MS : 0);
}

let chooseStamp = 0;

function coversEditor(el) {
  return Boolean(
    el.querySelector?.("#zoomable-container, #root-editable, #sc-page-content, #melo-container, [contenteditable='true']")
  );
}

// 普通文档里 #AT_MANAGER_ID 再往上是画布的公共浮层，链接卡片等控件也挂在那，不能一起屏蔽。
function muteNativeLayer() {
  document.querySelectorAll(".od_editor_atPopPanel").forEach(function (panel) {
    let node = panel;
    while (node && node !== document.body && node !== document.documentElement) {
      node.style.setProperty("pointer-events", "none", "important");
      if (node.id === NATIVE_AT_LAYER_ID) break;
      const parent = node.parentElement;
      if (!parent || coversEditor(parent)) break;
      node = parent;
    }
  });
}

function onMentionPointer(event) {
  if (!guardOn || !ui.open || !ui.root || event.button !== 0) return;
  muteNativeLayer();
  ui.root.style.pointerEvents = "auto";
  ui.root.style.visibility = "visible";
  const raw = event.target && event.target.nodeType === 1 ? event.target : event.target?.parentElement;
  const hit = document.elementFromPoint(event.clientX, event.clientY);
  const row = (raw && raw.closest?.(".wxmd-item")) || (hit && hit.closest?.(".wxmd-item"));
  const onPanel = (raw && ui.root.contains(raw)) || (hit && ui.root.contains(hit));
  if (!onPanel && !(row && ui.root.contains(row))) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (!row || !ui.root.contains(row)) return;
  choose(Number(row.dataset.index));
}

export function installMentionPointerGuard() {
  document.addEventListener("pointerdown", onMentionPointer, true);
}

function choose(index) {
  const now = Date.now();
  if (now - chooseStamp < 350) return;
  const row = rows()[index];
  if (!row || !extensionAlive()) return;
  chooseStamp = now;
  if (row.type === "person") {
    document.dispatchEvent(
      new CustomEvent(PICK_MENTION_EVENT, {
        bubbles: true,
        detail: {
          source: MSG_SOURCE,
          kind: row.person.kind,
          label: row.person.label,
        },
      })
    );
    close();
    return;
  }
  if (!row.doc?.url) return;
  document.dispatchEvent(
    new CustomEvent(INSERT_DOC_EVENT, {
      bubbles: true,
      detail: {
        source: MSG_SOURCE,
        url: row.doc.url,
        title: row.doc.title || "",
      },
    })
  );
  close();
}

function move(step) {
  const list = rows();
  if (!list.length) return;
  const next = ui.active < 0 ? 0 : (ui.active + step + list.length) % list.length;
  ui.active = next;
  paintActive();
  const current = ui.root?.querySelector(".wxmd-item.is-active");
  if (current && typeof current.scrollIntoView === "function") {
    current.scrollIntoView({ block: "nearest" });
  }
}

function onKeyDown(event) {
  if (!ui.open) return;
  if (event.key === "ArrowDown") {
    event.preventDefault();
    event.stopPropagation();
    move(1);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    event.stopPropagation();
    move(-1);
  } else if (event.key === "Enter" && !event.isComposing) {
    event.preventDefault();
    event.stopPropagation();
    if (ui.active >= 0) choose(ui.active);
  } else if (event.key === "Escape") {
    ui.dismissed = true;
    close();
  }
}

function onMention(event) {
  const detail = event.detail;
  if (!detail || detail.source !== MSG_SOURCE || !ui.root) return;
  if (!detail.active) {
    ui.dismissed = false;
    close();
    return;
  }
  // Esc 之后 @ 还在光标前，页面会继续报告；等这次 @ 结束再允许打开。
  if (ui.dismissed) return;
  const query = String(detail.query || "");
  const wasOpen = ui.open;
  const queryChanged = !wasOpen || query !== ui.query;
  ui.caret = detail.caret || null;
  if (!queryChanged) {
    place();
    return;
  }
  const previous = ui.query;
  ui.query = query;
  noteQueryChange(query, previous, wasOpen);
  applyPreview(query, wasOpen);
  ui.active = rows().length ? 0 : -1;
  openPanel(!wasOpen);
  syncPeople();
  scheduleLoad(query);
}

function ensureRoot() {
  let root = document.getElementById(MENTION_ROOT_ID);
  if (!root) {
    const parent = document.body || document.documentElement;
    if (!parent) return false;
    root = document.createElement("div");
    root.id = MENTION_ROOT_ID;
    root.setAttribute("aria-label", "提及联系人或文档");
    parent.appendChild(root);
  }
  if (root.dataset.wxmdBound !== "1") {
    root.dataset.wxmdBound = "1";
    root.addEventListener("mousedown", function (event) {
      event.preventDefault();
    });
  }
  ui.root = root;
  return true;
}

export function unmountMention() {
  close();
  ui.dismissed = false;
  setMentionGuard(false);
  if (mounted) {
    document.removeEventListener(MENTION_EVENT, onMention);
    document.removeEventListener("keydown", onKeyDown, true);
    mounted = false;
  }
  paintedPeople = "";
  paintedDocs = "";
  const root = document.getElementById(MENTION_ROOT_ID);
  if (root) root.remove();
  ui.root = null;
}

export function mountMention() {
  if (!extensionAlive()) return;
  setMentionGuard(true);
  if (!ensureRoot()) return;
  if (mounted) return;
  mounted = true;
  document.addEventListener(MENTION_EVENT, onMention);
  document.addEventListener("keydown", onKeyDown, true);
  fetchRecent().catch(function () {});
}
