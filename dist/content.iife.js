(() => {
  // src/shared.js
  var MSG_SOURCE = "wecom-better";
  var ROOT_ID = "wxdoc-online-viewers";
  var REFS_ROOT_ID = "wxdoc-ref-docs";
  var FOOTER_ROOT_ID = "wxdoc-doc-footer";
  var FOOTER_SPACE_ID = "wxdoc-doc-footer-space";
  var WANDER_ROOT_ID = "wxdoc-wander-docs";
  var SEARCH_ROOT_ID = "wxdoc-quick-search";
  var SEARCH_PANEL_ID = "wxdoc-quick-search-panel";
  var SEARCH_SETTINGS_ID = "wxdoc-quick-search-settings";
  var CREATE_PLUS_ID = "wxdoc-create-plus";
  var TITLEBAR_TOOLS_ID = "wxdoc-titlebar-tools";
  var DOC_META_ROOT_ID = "wxdoc-doc-meta";
  var FLOAT_LAYER_ID = "wxov-float-layer";
  var SILENT_PANEL_CLASS = "wxov-silent-panel";
  var MAX_VISIBLE = 8;
  var REFS_MAX_VISIBLE = 10;
  var DOC_HOST = "doc.weixin.qq.com";
  var DOC_PATH_RE = /^\/(doc|smartpage|sheet|smartsheet|slide|mind|flowchart)\/([^/?#]+)/i;
  var DEFAULT_FEATURES = {
    viewers: true,
    refs: true,
    search: true,
    docMeta: true,
    webLayout: true,
    create: true
  };
  var SNAPSHOT_EVENT = "wecom-better:snapshot";
  var HELLO_EVENT = "wecom-better:hello";
  var WEB_LAYOUT_EVENT = "wecom-better:web-layout";
  function displayName(viewer) {
    if (viewer.name && viewer.name !== viewer.id) return `${viewer.id}${viewer.name}`;
    return viewer.id;
  }
  function parseDocPath(pathname) {
    const matched = String(pathname || "").match(DOC_PATH_RE);
    return matched ? { kind: matched[1].toLowerCase(), id: matched[2] } : null;
  }
  function isOwnDoc(meta) {
    if (!meta) return false;
    if (meta.isSelf) return true;
    const name = String(meta.name || "").trim().toLowerCase();
    const viewer = String(meta.viewerId || "").trim().toLowerCase();
    if (name && viewer && name === viewer) return true;
    const vid = String(meta.creatorVid || "").trim();
    const selfVid = String(meta.selfVid || "").trim();
    return Boolean(vid && selfVid && vid === selfVid);
  }
  function parseDocUrl(url) {
    const raw = String(url || "").trim();
    if (!raw) return null;
    try {
      let parsed;
      if (/^https?:\/\//i.test(raw)) parsed = new URL(raw);
      else if (raw.startsWith("//")) parsed = new URL(`https:${raw}`);
      else if (raw.startsWith("/")) parsed = new URL(raw, `https://${DOC_HOST}`);
      else return null;
      if (parsed.hostname !== DOC_HOST) return null;
      return parseDocPath(parsed.pathname);
    } catch {
      return null;
    }
  }
  function isDocDetailPage(pathname = location.pathname) {
    const current = parseDocPath(pathname);
    return Boolean(current && (current.kind === "doc" || current.kind === "smartpage"));
  }
  function isHomePage(pathname = location.pathname) {
    return /^\/home(?:\/|$)/i.test(pathname);
  }
  function findHomeSearchAnchor() {
    const header = document.querySelector(".xd-web-header");
    if (!header) return null;
    return { host: header, before: null };
  }
  function isRefDocsPage(pathname = location.pathname) {
    return isDocDetailPage(pathname);
  }
  function findVisibleCollabButton() {
    const buttons = [...document.querySelectorAll(".ent-collab-users")];
    return buttons.find((el) => el.offsetParent !== null) || buttons[0] || null;
  }
  function titlebarReady(bar) {
    if (!bar) return false;
    const rect = bar.getBoundingClientRect();
    return rect.height >= 24 && rect.height <= 120 && rect.top < 80 && rect.width > 80;
  }
  function asTitlebarChild(el, bar) {
    if (!el || !bar || !bar.contains(el)) return null;
    let node = el;
    while (node.parentElement && node.parentElement !== bar) node = node.parentElement;
    return node.parentElement === bar ? node : null;
  }
  function moveBefore(el, host, before) {
    if (!el || !host) return;
    if (el.parentElement === host && el.nextSibling === before) return;
    host.insertBefore(el, before);
  }
  function findToolsAnchor() {
    const bar = document.getElementById("workbench-titlebar");
    if (!titlebarReady(bar)) return null;
    const before = asTitlebarChild(document.getElementById("headerbar-member"), bar) || asTitlebarChild(document.getElementById(ROOT_ID), bar) || asTitlebarChild(findVisibleCollabButton(), bar);
    if (before) return { host: bar, before };
    const pusher = [...bar.children].find((el) => /titlebar-pusher/.test(String(el.className)));
    if (pusher) return { host: bar, before: pusher.nextSibling };
    return { host: bar, before: null };
  }
  function extensionAlive() {
    try {
      return Boolean(globalThis.chrome?.runtime?.id);
    } catch {
      return false;
    }
  }
  async function storageGet(area, defaults) {
    if (!extensionAlive()) return { ...defaults };
    try {
      return await chrome.storage[area].get(defaults);
    } catch {
      return { ...defaults };
    }
  }
  async function storageSet(area, values) {
    if (!extensionAlive()) return false;
    try {
      await chrome.storage[area].set(values);
      return true;
    } catch {
      return false;
    }
  }
  async function copyText(text) {
    const value = String(text || "");
    if (!value) return false;
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(value);
        return true;
      } catch {
      }
    }
    const input = document.createElement("textarea");
    input.value = value;
    input.setAttribute("readonly", "");
    input.style.position = "fixed";
    input.style.left = "-9999px";
    document.body.appendChild(input);
    input.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    input.remove();
    return ok;
  }
  function mergeFeatures(partial) {
    const extra = partial && typeof partial === "object" ? partial : {};
    return { ...DEFAULT_FEATURES, ...extra };
  }
  async function readFeatures() {
    const stored = await storageGet("sync", { features: DEFAULT_FEATURES });
    return mergeFeatures(stored.features);
  }

  // src/search.js
  var SEARCH_TYPES = ["8", "9", "101", "102", "103", "104", "105", "106", "107", "108"];
  var HISTORY_KEY = "wecomBetterSearchHistory";
  var SCOPE_KEY = "wecomBetterSearchScope";
  var DEBOUNCE_MS = 200;
  var LEAVE_CLOSE_MS = 160;
  var KEYWORD_MAX = 64;
  var FETCH_LIMIT = 30;
  var SECTION_VISIBLE = 10;
  var RECENT_LIMIT = 8;
  var HISTORY_LIMIT = 3;
  var DEFAULT_SCOPE = { title: true, body: true };
  var SEARCH_ICON = '<svg class="wxqs-glyph" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="M8.5 2a6.5 6.5 0 104.23 11.44l4.42 4.41a.5.5 0 00.7-.7l-4.41-4.42A6.5 6.5 0 008.5 2zM3 8.5a5.5 5.5 0 1111 0 5.5 5.5 0 01-11 0z"/></svg>';
  var TIME_ICON = '<svg class="wxqs-glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M12.6 11.503l3.891 3.891-.848.849L11.4 12V6h1.2v5.503zM12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm0-1.2a8.8 8.8 0 100-17.6 8.8 8.8 0 000 17.6z" fill="currentColor" fill-rule="evenodd" fill-opacity=".9"/></svg>';
  var CLEAR_ICON = '<svg class="wxqs-glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm0-1.2a8.8 8.8 0 100-17.6 8.8 8.8 0 000 17.6zm.849-8.8l3.11 3.111-.848.849L12 12.849l-3.111 3.11-.849-.848L11.151 12l-3.11-3.111.848-.849L12 11.151l3.111-3.11.849.848L12.849 12z" fill="currentColor" fill-rule="evenodd" fill-opacity=".9"/></svg>';
  var MENU_ICON = '<svg class="wxqs-glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14v1.2H5V7zm0 4.4h14v1.2H5v-1.2zm0 4.4h14v1.2H5v-1.2z" fill="currentColor"/></svg>';
  var FILE_ICONS = {
    smartpage: '<svg class="wxqs-file-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path fill="#3999DA" d="M4 5.35C4 4.6 4.6 4 5.35 4h9.3C15.4 4 16 4.6 16 5.35v9.4c0 .69-.56 1.25-1.25 1.25h-9.4C4.6 16 4 15.4 4 14.65v-9.3z"/><path fill="#5FB8F3" d="M12.15 0C12.9 0 13.5.6 13.5 1.35v13.4c0 .69.56 1.25 1.25 1.25H1.35C.6 16 0 15.4 0 14.65V1.35C0 .6.6 0 1.35 0h10.8z"/><path fill="#fff" d="M4.3 6.64a.2.2 0 01.4 0l.66 1.87c.02.06.07.1.13.13l1.87.67a.2.2 0 010 .38l-1.87.67a.2.2 0 00-.13.13l-.67 1.87a.2.2 0 01-.38 0l-.67-1.87a.2.2 0 00-.13.13l-1.87-.67a.2.2 0 010-.38l1.87-.67a.2.2 0 00.13-.13l.67-1.87z"/></svg>',
    doc: '<svg class="wxqs-file-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path fill="#2B7DE1" d="M3 1.75A1.75 1.75 0 014.75 0h5.09L13 3.2V14.25A1.75 1.75 0 0111.25 16h-6.5A1.75 1.75 0 013 14.25V1.75z"/><path fill="#7CB4F2" d="M9.7 0v2.4c0 .5.4.9.9.9H13L9.7 0z"/><path fill="#fff" d="M5 7h6v1.2H5V7zm0 2.3h6v1.2H5V9.3z"/></svg>',
    sheet: '<svg class="wxqs-file-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect width="16" height="16" rx="3" fill="#07C160"/><path fill="#fff" d="M3.2 3.2h9.6v1.4H3.2V3.2zm0 2.8h2.8v6.8H3.2V6zm4 0h5.6v2H7.2V6zm0 3.2h5.6v3.6H7.2V9.2z"/></svg>',
    smartsheet: '<svg class="wxqs-file-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect width="16" height="16" rx="3" fill="#00A5A8"/><path fill="#fff" d="M3 3.5h10v2H3v-2zm0 3.5h4.4v5.5H3V7zm5.6 0H13v2.4H8.6V7zm0 3.4H13V13H8.6v-2.6z"/></svg>',
    slide: '<svg class="wxqs-file-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect width="16" height="16" rx="3" fill="#F5A623"/><path fill="#fff" d="M3.2 3.4h9.6v7.2H3.2V3.4zm3.2 8.4h3.2V13H6.4v-1.2z"/></svg>',
    mind: '<svg class="wxqs-file-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect width="16" height="16" rx="3" fill="#8B5CF6"/><path fill="#fff" d="M7.2 3.2h1.6v4.1h3.4v1.4H8.8v4.1H7.2V8.7H3.8V7.3h3.4V3.2z"/></svg>',
    flowchart: '<svg class="wxqs-file-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect width="16" height="16" rx="3" fill="#6366F1"/><path fill="#fff" d="M5.2 3.2h5.6v2.4H5.2V3.2zm0 3.6h2.4v2.4H5.2V6.8zm3.2 0h2.4v2.4H8.4V6.8zM5.2 10.4h5.6v2.4H5.2v-2.4z"/></svg>',
    collect: '<svg class="wxqs-file-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect width="16" height="16" rx="3" fill="#267EF0"/><path fill="#fff" d="M4 4h8v1.3H4V4zm0 2.5h8v1.3H4V6.5zm0 2.5h5.2V10.3H4V9z"/></svg>',
    pdf: '<svg class="wxqs-file-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path fill="#E54545" d="M3 1.75A1.75 1.75 0 014.75 0h5.09L13 3.2V14.25A1.75 1.75 0 0111.25 16h-6.5A1.75 1.75 0 013 14.25V1.75z"/><path fill="#F28B82" d="M9.7 0v2.4c0 .5.4.9.9.9H13L9.7 0z"/><path fill="#fff" d="M5.1 8.2h1.3c.9 0 1.5.5 1.5 1.3 0 .8-.6 1.3-1.5 1.3H5.8V12H5.1V8.2zm.7 1.9h.5c.4 0 .7-.2.7-.6s-.3-.6-.7-.6h-.5v1.2zM8.6 8.2h1.4c1.1 0 1.8.7 1.8 1.9s-.7 1.9-1.8 1.9H8.6V8.2zm.7 3.1h.6c.6 0 1-.4 1-1.2s-.4-1.2-1-1.2h-.6v2.4z"/></svg>'
  };
  var FILE_TYPE_KIND = {
    8: "smartsheet",
    30: "collect",
    50: "doc",
    51: "sheet",
    59: "collect",
    72: "smartpage",
    101: "doc",
    102: "sheet",
    103: "slide",
    104: "collect",
    105: "mind",
    106: "flowchart",
    107: "pdf",
    108: "smartpage"
  };
  var ui = {
    root: null,
    panel: null,
    settings: null,
    input: null,
    clear: null,
    open: false,
    settingsOpen: false,
    keyword: "",
    items: [],
    titleFiles: [],
    bodyFiles: [],
    expandedTitle: false,
    expandedBody: false,
    scope: { ...DEFAULT_SCOPE },
    active: -1,
    debounce: 0,
    leaveTimer: 0,
    seq: 0,
    recent: null,
    history: [],
    loading: false,
    error: ""
  };
  function cookieSid() {
    const matched = document.cookie.match(/(?:^|;\s*)(?:wedoc_sid|wedrive_sid|tdoc_sid)=([^;]+)/);
    return matched ? matched[1] : "";
  }
  function unwrapBody(data) {
    if (data && data.body && typeof data.body === "object") return data.body;
    return data || {};
  }
  function requestOk(data) {
    const ret = data?.head?.ret;
    return ret === 0 || ret === "0" || ret == null;
  }
  function cgiQuery() {
    const query = new URLSearchParams();
    const sid = cookieSid();
    if (sid) query.set("sid", sid);
    query.set("wedoc_xsrf", "1");
    return query;
  }
  function encodeForm(fields) {
    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(fields || {})) {
      if (Array.isArray(value)) value.forEach(function(item) {
        body.append(key, String(item));
      });
      else body.set(key, String(value ?? ""));
    }
    return body;
  }
  async function cgiPost(path, body, contentType) {
    const res = await fetch(`${path}?${cgiQuery()}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": contentType },
      body
    });
    if (!res.ok) throw new Error(`cgi ${res.status}`);
    return res.json();
  }
  function postForm(path, fields) {
    return cgiPost(path, encodeForm(fields), "application/x-www-form-urlencoded");
  }
  function postJson(path, fields) {
    return cgiPost(path, JSON.stringify(fields || {}), "application/json;charset=utf-8");
  }
  function asMs(value) {
    const n = Number(value) || 0;
    if (!n) return 0;
    return n > 1e12 ? n : n * 1e3;
  }
  function formatDocDate(ts) {
    const ms = asMs(ts);
    if (!ms) return "";
    const date = new Date(ms);
    if (Number.isNaN(date.getTime())) return "";
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}/${m}/${d}`;
  }
  var MEMBER_COUNT_KEYS = [
    "member_cnt",
    "memberCnt",
    "member_count",
    "memberCount",
    "auth_count",
    "auth_cnt",
    "auth_num",
    "member_num",
    "acl_count"
  ];
  function positiveCount(value) {
    if (Array.isArray(value)) return value.length;
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  function pickMemberCount(raw) {
    if (raw == null) return 0;
    if (typeof raw !== "object" || Array.isArray(raw)) return positiveCount(raw);
    for (let i = 0; i < MEMBER_COUNT_KEYS.length; i += 1) {
      const n = positiveCount(raw[MEMBER_COUNT_KEYS[i]]);
      if (n) return n;
    }
    return positiveCount(raw.member) || positiveCount(raw.members);
  }
  function readMemberCnt(data) {
    const body = unwrapBody(data);
    const sources = [body, data, body.data, body.info];
    for (let i = 0; i < sources.length; i += 1) {
      const n = pickMemberCount(sources[i]);
      if (n) return n;
    }
    return 0;
  }
  function readViewing(file) {
    const keys = ["online_cnt", "viewing_cnt", "collab_cnt", "online_count", "viewing_count"];
    for (let i = 0; i < keys.length; i += 1) {
      const n = Number(file[keys[i]]);
      if (Number.isFinite(n) && n >= 0) return n;
    }
    return 0;
  }
  var STATS_KEY = "wecomBetterDocStats";
  var MEMBER_TTL_MS = 3 * 24 * 60 * 60 * 1e3;
  var STATS_MAX = 2e3;
  var memberMemory = /* @__PURE__ */ new Map();
  var statsStore = null;
  var statsReady = null;
  var statsWriteTimer = 0;
  function isMembersFresh(entry) {
    const at = Number(entry?.membersAt) || 0;
    const n = Number(entry?.members) || 0;
    return n > 0 && at > 0 && Date.now() - at < MEMBER_TTL_MS;
  }
  async function loadStatsStore() {
    if (statsStore) return statsStore;
    if (!statsReady) {
      statsReady = storageGet("local", { [STATS_KEY]: {} }).then(function(stored) {
        const raw = stored[STATS_KEY];
        statsStore = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
        return statsStore;
      });
    }
    return statsReady;
  }
  function pruneStats(store) {
    const keys = Object.keys(store);
    if (keys.length <= STATS_MAX) return;
    const ranked = keys.map(function(id) {
      return { id, at: Number(store[id]?.membersAt) || 0, createdAt: Number(store[id]?.createdAt) || 0 };
    }).sort(function(a, b) {
      return a.at - b.at;
    });
    let extra = keys.length - STATS_MAX;
    ranked.forEach(function(row) {
      const cur = store[row.id];
      if (!cur) return;
      if (cur.createdAt) {
        if (cur.members != null || cur.membersAt) store[row.id] = { createdAt: cur.createdAt };
        return;
      }
      if (extra > 0) {
        delete store[row.id];
        extra -= 1;
      }
    });
  }
  function scheduleStatsWrite() {
    if (!statsStore) return;
    window.clearTimeout(statsWriteTimer);
    statsWriteTimer = window.setTimeout(function() {
      pruneStats(statsStore);
      storageSet("local", { [STATS_KEY]: statsStore });
    }, 240);
  }
  function hydrateItem(item, store) {
    if (!item?.id) return;
    const entry = store[item.id];
    if (!entry) return;
    if (!item.createdAt && entry.createdAt) item.createdAt = entry.createdAt;
    if (!(Number(item.members) > 0) && isMembersFresh(entry)) item.members = entry.members;
  }
  function rememberItem(item, store) {
    if (!item?.id) return false;
    const prev = store[item.id] && typeof store[item.id] === "object" ? store[item.id] : {};
    const next = {};
    let changed = false;
    const createdAt = Number(item.createdAt || prev.createdAt) || 0;
    if (createdAt) next.createdAt = createdAt;
    if (createdAt && createdAt !== Number(prev.createdAt)) changed = true;
    if (Number(item.members) > 0) {
      const same = Number(prev.members) === Number(item.members) && isMembersFresh(prev);
      next.members = item.members;
      next.membersAt = same ? prev.membersAt : Date.now();
      if (!same) changed = true;
    } else if (isMembersFresh(prev)) {
      next.members = prev.members;
      next.membersAt = prev.membersAt;
    }
    if (!next.createdAt && next.members == null) return false;
    store[item.id] = next;
    return changed;
  }
  function normalizeFile(file) {
    if (!file || typeof file !== "object") return null;
    if (file.file_status != null && Number(file.file_status) !== 1) return null;
    const url = String(file.doc_url || "").trim();
    if (!url) return null;
    const parsed = parseDocUrl(url);
    const kind = parsed?.kind || (/\/forms\//i.test(url) ? "collect" : "") || FILE_TYPE_KIND[Number(file.file_type)] || "doc";
    const title = String(file.name || "").replace(/[\u200b\u200c\u200d\u2060\ufeff]/g, "").replace(/\s+/g, " ").trim();
    const snippet = stripHl(file.search_body_hl && file.search_body_hl[0]);
    return {
      id: String(file.doc_id || file.file_id || url),
      title: title || "\u672A\u547D\u540D\u6587\u6863",
      url,
      kind,
      creator: String(file.creater_name || file.update_name || "").trim(),
      creatorVid: String(file.creater_vid || file.s_creater_vid || "").trim(),
      time: asMs(file.open_time || file.mtime || file.ctime),
      createdAt: asMs(file.ctime || file.create_time || file.createTime),
      snippet,
      members: pickMemberCount(file),
      viewing: readViewing(file)
    };
  }
  function stripHl(html) {
    return String(html || "").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  }
  function currentDocId() {
    return parseDocPath(location.pathname)?.id || "";
  }
  function takeFiles(list, limit) {
    const self = currentDocId();
    const seen = /* @__PURE__ */ new Set();
    const out = [];
    for (const raw of list || []) {
      const file = normalizeFile(raw);
      if (!file || seen.has(file.id)) continue;
      if (self && (file.id === self || file.url.includes(self))) continue;
      seen.add(file.id);
      out.push(file);
      if (out.length >= limit) break;
    }
    return out;
  }
  async function searchDocs(keyword, func, extra) {
    const data = await postForm("/diskfile/search", {
      func: String(func),
      or_text_match: keyword,
      sync_key: "",
      limit: String(FETCH_LIMIT),
      hl_fragment_len: "20",
      and_file_type: SEARCH_TYPES,
      ...extra && typeof extra === "object" ? extra : {}
    });
    if (!requestOk(data)) throw new Error(data?.head?.msg || "search failed");
    return takeFiles(unwrapBody(data).files, FETCH_LIMIT);
  }
  async function postDocMemberMgr(docId, func, pick) {
    const id = String(docId || "").trim();
    if (!id) return null;
    const tries = [
      function() {
        return postJson("/wedoc/doc_member_mgr", { docid: id, func });
      },
      function() {
        return postJson("/wedoc/doc_member_mgr", { doc_id: id, func });
      },
      function() {
        return postForm("/wedoc/doc_member_mgr", { docid: id, func: String(func) });
      }
    ];
    for (let i = 0; i < tries.length; i += 1) {
      try {
        const data = await tries[i]();
        if (!requestOk(data)) continue;
        const hit = pick(data);
        if (hit) return hit;
      } catch {
      }
    }
    return null;
  }
  async function fetchMemberCount(docId) {
    return await postDocMemberMgr(docId, 6, readMemberCnt) || 0;
  }
  function memberList(data) {
    const body = unwrapBody(data);
    const boxed = body?.member;
    if (Array.isArray(boxed?.member)) return boxed.member;
    if (Array.isArray(boxed?.members)) return boxed.members;
    if (Array.isArray(boxed)) return boxed;
    if (Array.isArray(body?.members)) return body.members;
    return [];
  }
  async function fetchCreatorAvatar(docId, creatorVid, englishName) {
    const vid = String(creatorVid || "").trim();
    const name = String(englishName || "").trim().toLowerCase();
    const image = await postDocMemberMgr(docId, 1, function(data) {
      const list = memberList(data);
      if (!list.length) return "";
      const hit = list.find(function(item) {
        return vid && String(item?.vid || "") === vid;
      }) || list.find(function(item) {
        return name && String(item?.english_name || "").toLowerCase() === name;
      }) || list.find(function(item) {
        return name && String(item?.name || "").toLowerCase().startsWith(`${name}(`);
      });
      return String(hit?.image || hit?.avatar || hit?.userPic || "").trim();
    });
    return image || "";
  }
  async function getDocMemberCount(docId) {
    const id = String(docId || "").trim();
    if (!id) return 0;
    if (memberMemory.has(id)) return memberMemory.get(id);
    const store = await loadStatsStore();
    const cached = store[id];
    if (isMembersFresh(cached)) {
      memberMemory.set(id, cached.members);
      return cached.members;
    }
    const n = await fetchMemberCount(id);
    if (n > 0) {
      memberMemory.set(id, n);
      store[id] = {
        createdAt: Number(cached?.createdAt) || 0,
        members: n,
        membersAt: Date.now()
      };
      if (!store[id].createdAt) delete store[id].createdAt;
      scheduleStatsWrite();
    }
    return n;
  }
  function asInfoList(body) {
    if (!body || typeof body !== "object") return [];
    if (Array.isArray(body.doc_infos)) return body.doc_infos;
    if (Array.isArray(body.infos)) return body.infos;
    if (Array.isArray(body.list)) return body.list;
    if (Array.isArray(body.files)) return body.files;
    if (body.doc_info && typeof body.doc_info === "object") return [body.doc_info];
    return [];
  }
  function applyInfoFields(item, raw) {
    if (!item || !raw || typeof raw !== "object") return;
    const created = asMs(raw.create_time || raw.ctime || raw.createTime || raw.created_at);
    if (created && !item.createdAt) item.createdAt = created;
    const members = pickMemberCount(raw);
    if (members && !item.members) item.members = members;
    const viewing = readViewing(raw);
    if (viewing && !item.viewing) item.viewing = viewing;
  }
  async function getDocCreateTime(docId) {
    const id = String(docId || "").trim();
    if (!id) return 0;
    let data = null;
    try {
      data = await postJson("/wedoc/meta_info", { doc_id: id });
    } catch {
      data = await postForm("/wedoc/meta_info", { doc_id: id });
    }
    if (!requestOk(data)) return 0;
    const body = unwrapBody(data);
    const info = body.create_info || body.meta || body.doc_info || body;
    return asMs(
      info.create_time || info.ctime || info.createTime || info.created_at || body.create_time
    );
  }
  async function batchGetDocInfo(docIds) {
    const ids = [...new Set((docIds || []).map(function(id) {
      return String(id || "").trim();
    }).filter(Boolean))];
    if (!ids.length) return [];
    let data = null;
    try {
      data = await postJson("/wedoc/batch_get_doc_info", { doc_ids: ids });
    } catch {
      data = await postForm("/wedoc/batch_get_doc_info", { doc_ids: ids });
    }
    if (!requestOk(data)) return [];
    return asInfoList(unwrapBody(data));
  }
  async function hydrateDocStats(items) {
    const store = await loadStatsStore();
    let changed = false;
    (items || []).forEach(function(item) {
      hydrateItem(item, store);
      if (rememberItem(item, store)) changed = true;
    });
    if (changed) scheduleStatsWrite();
    return items;
  }
  async function enrichDocStats(items) {
    const list = (items || []).filter(Boolean);
    const store = await loadStatsStore();
    list.forEach(function(item) {
      hydrateItem(item, store);
    });
    const missingCreate = list.filter(function(item) {
      return item.id && !item.createdAt;
    });
    if (missingCreate.length) {
      const infos = await batchGetDocInfo(
        missingCreate.map(function(item) {
          return item.id;
        })
      ).catch(function() {
        return [];
      });
      const byId = /* @__PURE__ */ new Map();
      infos.forEach(function(raw) {
        const id = String(raw?.doc_id || raw?.id || raw?.docid || "").trim();
        if (id) byId.set(id, raw);
      });
      missingCreate.forEach(function(item) {
        const raw = byId.get(item.id);
        if (raw) applyInfoFields(item, raw);
      });
      const still = missingCreate.filter(function(item) {
        return !item.createdAt;
      });
      await Promise.all(
        still.map(function(item) {
          return getDocCreateTime(item.id).then(function(ts) {
            if (ts) item.createdAt = ts;
          }).catch(function() {
          });
        })
      );
    }
    await Promise.all(
      list.map(function(item) {
        if (!item.id || Number(item.members) > 0) return Promise.resolve();
        return getDocMemberCount(item.id).then(function(n) {
          if (n > 0) item.members = n;
        }).catch(function() {
        });
      })
    );
    let changed = false;
    list.forEach(function(item) {
      if (rememberItem(item, store)) changed = true;
    });
    if (changed) scheduleStatsWrite();
    return list;
  }
  function normalizeScope(raw) {
    const next = {
      title: raw?.title !== false,
      body: raw?.body !== false
    };
    if (!next.title && !next.body) return { ...DEFAULT_SCOPE };
    return next;
  }
  async function readScope() {
    if (!extensionAlive()) return ui.scope;
    const stored = await storageGet("sync", { [SCOPE_KEY]: DEFAULT_SCOPE });
    ui.scope = normalizeScope(stored[SCOPE_KEY]);
    return ui.scope;
  }
  async function writeScope(partial) {
    const next = normalizeScope({ ...ui.scope, ...partial });
    if (!next.title && !next.body) return ui.scope;
    ui.scope = next;
    await storageSet("sync", { [SCOPE_KEY]: next });
    return next;
  }
  async function recentDocs() {
    const data = await postForm("/diskfile/newfilemgr", { func: "22" });
    if (!requestOk(data)) throw new Error(data?.head?.msg || "recent failed");
    return takeFiles(unwrapBody(data).files, RECENT_LIMIT);
  }
  async function readHistory() {
    const stored = await storageGet("local", { [HISTORY_KEY]: [] });
    const list = stored[HISTORY_KEY];
    return Array.isArray(list) ? list.map((item) => String(item || "").trim()).filter(Boolean).slice(0, HISTORY_LIMIT) : [];
  }
  async function pushHistory(keyword) {
    const value = String(keyword || "").trim();
    if (!value) return;
    const next = [value, ...(ui.history || []).filter((item) => item !== value)].slice(0, HISTORY_LIMIT);
    ui.history = next;
    await storageSet("local", { [HISTORY_KEY]: next });
  }
  function isPlaced(root) {
    if (isHomePage()) {
      const home = findHomeSearchAnchor();
      return Boolean(home && root.parentElement === home.host);
    }
    const tools = document.getElementById(TITLEBAR_TOOLS_ID);
    const plus = document.getElementById(CREATE_PLUS_ID);
    if (tools && root.parentElement === tools) {
      return plus && plus.parentElement === tools ? root.nextSibling === plus : true;
    }
    const anchor = findToolsAnchor();
    if (!anchor) return false;
    return root.parentElement === anchor.host && root.nextSibling === anchor.before;
  }
  function pinHomeSearch(root, header) {
    const rect = header.getBoundingClientRect();
    const center = rect.width > 0 ? rect.left + rect.width / 2 : window.innerWidth / 2;
    root.style.display = "";
    root.style.position = "fixed";
    root.style.top = "30px";
    root.style.left = `${Math.round(center)}px`;
    root.style.right = "auto";
    root.style.bottom = "auto";
    root.style.transform = "translateX(-50%)";
    root.style.margin = "0";
    root.style.alignSelf = "flex-start";
    root.style.zIndex = "5";
    moveBefore(root, header, null);
  }
  function clearHomePin(root) {
    root.style.position = "";
    root.style.top = "";
    root.style.left = "";
    root.style.right = "";
    root.style.bottom = "";
    root.style.transform = "";
    root.style.margin = "";
    root.style.alignSelf = "";
  }
  function placeRoot(root) {
    if (isHomePage()) {
      root.classList.add("is-home");
      const home = findHomeSearchAnchor();
      if (home) {
        pinHomeSearch(root, home.host);
        return;
      }
      root.style.display = "none";
      if (!document.documentElement.contains(root)) document.documentElement.appendChild(root);
      return;
    }
    root.classList.remove("is-home");
    clearHomePin(root);
    const tools = document.getElementById(TITLEBAR_TOOLS_ID);
    const plus = document.getElementById(CREATE_PLUS_ID);
    if (tools) {
      if (plus && plus.parentElement === tools) moveBefore(root, tools, plus);
      else if (root.parentElement !== tools) tools.insertBefore(root, tools.firstChild);
      root.style.display = "";
      return;
    }
    const anchor = findToolsAnchor();
    if (anchor) {
      moveBefore(root, anchor.host, anchor.before);
      root.style.display = "";
      return;
    }
    root.style.display = "none";
    if (!document.documentElement.contains(root)) {
      (document.body || document.documentElement).appendChild(root);
    }
  }
  function placePanel() {
    if (!ui.panel || !ui.root || !ui.open) return;
    const field = ui.root.querySelector(".wxqs-field");
    if (!field) return;
    const rect = field.getBoundingClientRect();
    const width = Math.max(140, Math.round(rect.width));
    let left = rect.left;
    if (left + width > window.innerWidth - 12) left = Math.max(12, window.innerWidth - width - 12);
    ui.panel.style.left = `${Math.round(left)}px`;
    ui.panel.style.top = `${Math.round(rect.bottom + 6)}px`;
    ui.panel.style.width = `${width}px`;
  }
  function placeSettings() {
    if (!ui.settings || !ui.settingsOpen) return;
    const btn = ui.panel?.querySelector(".wxqs-scope");
    const field = ui.root?.querySelector(".wxqs-field");
    const rect = (btn || field)?.getBoundingClientRect();
    if (!rect) return;
    const width = 220;
    let left = rect.right - width;
    if (left < 12) left = 12;
    if (left + width > window.innerWidth - 12) left = Math.max(12, window.innerWidth - width - 12);
    const height = ui.settings.offsetHeight || 118;
    let top = rect.top - height - 6;
    if (top < 8) top = rect.bottom + 6;
    ui.settings.style.left = `${Math.round(left)}px`;
    ui.settings.style.top = `${Math.round(top)}px`;
    ui.settings.style.width = `${width}px`;
  }
  function isSearchUi(node) {
    return Boolean(
      node && (ui.root?.contains(node) || ui.panel?.contains(node) || ui.settings?.contains(node))
    );
  }
  function cancelLeaveClose() {
    window.clearTimeout(ui.leaveTimer);
    ui.leaveTimer = 0;
  }
  function closeSearchUi() {
    cancelLeaveClose();
    setSettingsOpen(false);
    setOpen(false);
  }
  function scheduleLeaveClose() {
    cancelLeaveClose();
    ui.leaveTimer = window.setTimeout(closeSearchUi, LEAVE_CLOSE_MS);
  }
  function onSearchEnter() {
    cancelLeaveClose();
  }
  function onSearchBoxEnter() {
    cancelLeaveClose();
    const next = ui.input?.value.trim().slice(0, KEYWORD_MAX) || "";
    scheduleQuery(next);
  }
  function onSearchLeave(event) {
    if (isSearchUi(event.relatedTarget)) return;
    if (event.currentTarget === ui.panel || event.currentTarget === ui.settings) {
      closeSearchUi();
      return;
    }
    scheduleLeaveClose();
  }
  function formatTime(ts) {
    if (!ts) return "";
    const ms = ts > 1e12 ? ts : ts * 1e3;
    const date = new Date(ms);
    if (Number.isNaN(date.getTime())) return "";
    const now = /* @__PURE__ */ new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const diff = Math.round((start - day) / 864e5);
    if (diff === 0) return "\u4ECA\u5929";
    if (diff === 1) return "\u6628\u5929";
    if (date.getFullYear() === now.getFullYear()) {
      return `${date.getMonth() + 1}\u6708${date.getDate()}\u65E5`;
    }
    return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
  }
  function appendHighlighted(el, text, keyword) {
    const value = String(text || "");
    const needle = String(keyword || "").trim();
    if (!needle) {
      el.textContent = value;
      return;
    }
    const lower = value.toLowerCase();
    const hit = lower.indexOf(needle.toLowerCase());
    if (hit < 0) {
      el.textContent = value;
      return;
    }
    el.append(value.slice(0, hit));
    const mark = document.createElement("em");
    mark.textContent = value.slice(hit, hit + needle.length);
    el.append(mark, value.slice(hit + needle.length));
  }
  function setOpen(next) {
    ui.open = next;
    ui.root?.classList.toggle("is-open", next);
    if (ui.panel) ui.panel.hidden = !next;
    if (next) {
      cancelLeaveClose();
      placePanel();
    } else if (!ui.settingsOpen) {
      cancelLeaveClose();
    }
  }
  function setSettingsOpen(next) {
    ui.settingsOpen = next;
    ui.root?.classList.toggle("is-settings", next);
    const scope = ui.panel?.querySelector(".wxqs-scope");
    if (scope) scope.setAttribute("aria-expanded", next ? "true" : "false");
    if (ui.settings) ui.settings.hidden = !next;
    if (next) {
      cancelLeaveClose();
      renderSettings();
      placeSettings();
    }
  }
  function setActive(index) {
    ui.active = index;
    if (!ui.panel) return;
    ui.panel.querySelectorAll("[data-wxqs-index]").forEach(function(el) {
      el.classList.toggle("is-active", Number(el.dataset.wxqsIndex) === index);
    });
    const current = ui.panel.querySelector(`[data-wxqs-index="${index}"]`);
    current?.scrollIntoView({ block: "nearest" });
  }
  function moreSearchUrl(keyword) {
    const url = new URL("https://doc.weixin.qq.com/home/search");
    if (keyword) url.searchParams.set("keyword", keyword);
    url.searchParams.set("tab", ui.scope.title !== false ? "0" : "2");
    return url.toString();
  }
  function makeFoot() {
    const row = document.createElement("div");
    row.className = "wxqs-foot-row";
    const foot = document.createElement("a");
    foot.className = "wxqs-foot";
    foot.href = moreSearchUrl(ui.keyword);
    foot.dataset.wxqsIndex = String(ui.items.length);
    foot.textContent = ui.keyword ? `\u5728\u7F51\u9875\u4E2D\u641C\u7D22\u300C${ui.keyword}\u300D` : "\u5728\u7F51\u9875\u4E2D\u641C\u7D22\u5168\u90E8\u6587\u6863";
    row.appendChild(foot);
    const scope = document.createElement("button");
    scope.type = "button";
    scope.className = "wxqs-scope";
    scope.setAttribute("aria-label", "\u641C\u7D22\u8303\u56F4\u8BBE\u7F6E");
    scope.setAttribute("aria-expanded", ui.settingsOpen ? "true" : "false");
    scope.innerHTML = MENU_ICON;
    scope.addEventListener("click", function(event) {
      event.preventDefault();
      event.stopPropagation();
      setSettingsOpen(!ui.settingsOpen);
    });
    row.appendChild(scope);
    return row;
  }
  function makeRow(item, index) {
    const row = document.createElement("a");
    row.className = "wxqs-item";
    row.href = item.url;
    row.dataset.wxqsIndex = String(index);
    if (item.kind === "history") {
      row.insertAdjacentHTML("afterbegin", TIME_ICON);
    } else {
      row.insertAdjacentHTML("afterbegin", FILE_ICONS[item.kind] || FILE_ICONS.doc);
    }
    const main = document.createElement("span");
    main.className = "wxqs-item-main";
    const title = document.createElement("span");
    title.className = "wxqs-item-title";
    appendHighlighted(title, item.title, ui.keyword);
    main.appendChild(title);
    if (item.kind !== "history") {
      const snippet = item.group === "\u6309\u6B63\u6587\u641C\u7D22" ? item.snippet : "";
      const meta = snippet || [item.creator, formatTime(item.time)].filter(Boolean).join(" \xB7 ");
      if (meta) {
        const sub = document.createElement("span");
        sub.className = "wxqs-item-meta";
        if (snippet) appendHighlighted(sub, snippet, ui.keyword);
        else sub.textContent = meta;
        main.appendChild(sub);
      }
    }
    row.appendChild(main);
    row.addEventListener("mouseenter", function() {
      setActive(index);
    });
    row.addEventListener("click", function(event) {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) {
        if (item.kind !== "history") pushHistory(ui.keyword);
        return;
      }
      event.preventDefault();
      openItem(item);
    });
    return row;
  }
  function appendSection(box, items, label, files, expanded, onExpand) {
    if (!files.length) return;
    const head = document.createElement("div");
    head.className = "wxqs-label";
    head.textContent = `${label}\uFF08${files.length}\uFF09`;
    box.appendChild(head);
    const visible = expanded ? files : files.slice(0, SECTION_VISIBLE);
    visible.forEach(function(file) {
      const item = { ...file, group: label };
      box.appendChild(makeRow(item, items.length));
      items.push(item);
    });
    if (!expanded && files.length > SECTION_VISIBLE) {
      const more = document.createElement("button");
      more.type = "button";
      more.className = "wxqs-more";
      more.textContent = `\u5C55\u5F00\u5168\u90E8\uFF08\u8FD8\u6709 ${files.length - SECTION_VISIBLE} \u7BC7\uFF09`;
      more.addEventListener("click", function(event) {
        event.preventDefault();
        event.stopPropagation();
        onExpand();
      });
      box.appendChild(more);
    }
  }
  function renderPanel() {
    if (!ui.panel) return;
    ui.panel.replaceChildren();
    const box = document.createElement("div");
    box.className = "wxqs-card";
    const items = [];
    if (ui.loading && !ui.items.length && !ui.titleFiles.length && !ui.bodyFiles.length) {
      const empty = document.createElement("div");
      empty.className = "wxqs-status";
      empty.textContent = "\u641C\u7D22\u4E2D\u2026";
      box.appendChild(empty);
    } else if (ui.error) {
      const empty = document.createElement("div");
      empty.className = "wxqs-status";
      empty.textContent = ui.error;
      box.appendChild(empty);
    } else if (ui.keyword) {
      const hasTitle = ui.scope.title && ui.titleFiles.length;
      const hasBody = ui.scope.body && ui.bodyFiles.length;
      if (!hasTitle && !hasBody && !ui.loading) {
        const empty = document.createElement("div");
        empty.className = "wxqs-status";
        empty.textContent = "\u6CA1\u6709\u627E\u5230\u76F8\u5173\u6587\u6863";
        box.appendChild(empty);
      } else {
        if (ui.scope.title) {
          appendSection(box, items, "\u6309\u6587\u6863\u540D\u641C\u7D22", ui.titleFiles, ui.expandedTitle, function() {
            ui.expandedTitle = true;
            renderPanel();
          });
        }
        if (ui.scope.body) {
          appendSection(box, items, "\u6309\u6B63\u6587\u641C\u7D22", ui.bodyFiles, ui.expandedBody, function() {
            ui.expandedBody = true;
            renderPanel();
          });
        }
        if (ui.loading) {
          const empty = document.createElement("div");
          empty.className = "wxqs-status";
          empty.textContent = "\u641C\u7D22\u4E2D\u2026";
          box.appendChild(empty);
        }
      }
    } else if (!ui.items.length) {
      const empty = document.createElement("div");
      empty.className = "wxqs-status";
      empty.textContent = "\u6682\u65E0\u6700\u8FD1\u6D4F\u89C8";
      box.appendChild(empty);
    } else {
      let lastGroup = "";
      ui.items.forEach(function(item, index) {
        if (item.group && item.group !== lastGroup) {
          lastGroup = item.group;
          const label = document.createElement("div");
          label.className = "wxqs-label";
          label.textContent = item.group;
          box.appendChild(label);
        }
        box.appendChild(makeRow(item, index));
        items.push(item);
      });
    }
    if (ui.keyword) ui.items = items;
    box.appendChild(makeFoot());
    ui.panel.appendChild(box);
    if (ui.active >= 0) setActive(ui.active);
    placePanel();
    if (ui.settingsOpen) placeSettings();
  }
  function renderSettings() {
    if (!ui.settings) return;
    ui.settings.replaceChildren();
    const card = document.createElement("div");
    card.className = "wxqs-settings-card";
    const title = document.createElement("div");
    title.className = "wxqs-settings-title";
    title.textContent = "\u641C\u7D22\u8303\u56F4";
    card.appendChild(title);
    [
      { key: "title", label: "\u6309\u6587\u6863\u540D\u641C\u7D22" },
      { key: "body", label: "\u6309\u6B63\u6587\u641C\u7D22" }
    ].forEach(function(option) {
      const row = document.createElement("label");
      row.className = "wxqs-settings-row";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = ui.scope[option.key] !== false;
      input.addEventListener("change", async function() {
        const next = { ...ui.scope, [option.key]: input.checked };
        if (!next.title && !next.body) {
          input.checked = true;
          return;
        }
        await writeScope(next);
        ui.expandedTitle = false;
        ui.expandedBody = false;
        renderSettings();
        if (ui.keyword) loadSearchList(ui.keyword);
      });
      const text = document.createElement("span");
      text.textContent = option.label;
      row.append(input, text);
      card.appendChild(row);
    });
    ui.settings.appendChild(card);
    placeSettings();
  }
  async function loadIdleList() {
    const seq = ++ui.seq;
    ui.loading = !ui.recent;
    ui.error = "";
    renderPanel();
    try {
      const [history, recent] = await Promise.all([
        readHistory(),
        ui.recent ? Promise.resolve(ui.recent) : recentDocs()
      ]);
      if (seq !== ui.seq || ui.keyword) return;
      ui.history = history;
      ui.recent = recent;
      const items = [
        ...history.map((title) => ({
          id: `history:${title}`,
          title,
          url: moreSearchUrl(title),
          kind: "history",
          group: "\u641C\u7D22\u5386\u53F2"
        })),
        ...recent.map((file) => ({ ...file, group: "\u6700\u8FD1\u6D4F\u89C8" }))
      ];
      ui.items = items;
      ui.loading = false;
      ui.active = items.length ? 0 : -1;
      renderPanel();
    } catch {
      if (seq !== ui.seq || ui.keyword) return;
      ui.loading = false;
      ui.error = "\u6700\u8FD1\u6D4F\u89C8\u52A0\u8F7D\u5931\u8D25";
      ui.items = [];
      renderPanel();
    }
  }
  async function loadSearchList(keyword) {
    const seq = ++ui.seq;
    ui.loading = true;
    ui.error = "";
    ui.titleFiles = [];
    ui.bodyFiles = [];
    renderPanel();
    try {
      await readScope();
      const tasks = [];
      if (ui.scope.title) {
        tasks.push(
          searchDocs(keyword, 5).then(function(files) {
            return { type: "title", files };
          })
        );
      }
      if (ui.scope.body) {
        tasks.push(
          searchDocs(keyword, 6).then(function(files) {
            return { type: "body", files };
          })
        );
      }
      const parts = await Promise.all(tasks);
      if (seq !== ui.seq) return;
      const title = parts.find((part) => part.type === "title")?.files || [];
      const titleIds = new Set(title.map((file) => file.id));
      const body = (parts.find((part) => part.type === "body")?.files || []).filter(
        function(file) {
          return !titleIds.has(file.id);
        }
      );
      ui.titleFiles = title;
      ui.bodyFiles = body;
      ui.loading = false;
      ui.active = title.length || body.length ? 0 : -1;
      renderPanel();
    } catch {
      if (seq !== ui.seq) return;
      ui.loading = false;
      ui.error = "\u641C\u7D22\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5";
      ui.titleFiles = [];
      ui.bodyFiles = [];
      ui.items = [];
      renderPanel();
    }
  }
  function scheduleQuery(keyword) {
    window.clearTimeout(ui.debounce);
    ui.keyword = keyword;
    ui.expandedTitle = false;
    ui.expandedBody = false;
    if (ui.clear) ui.clear.hidden = !keyword;
    if (!ui.open) setOpen(true);
    if (!keyword) {
      ui.titleFiles = [];
      ui.bodyFiles = [];
      loadIdleList();
      return;
    }
    ui.debounce = window.setTimeout(function() {
      loadSearchList(keyword);
    }, DEBOUNCE_MS);
  }
  function openItem(item) {
    if (!item) return;
    if (item.kind === "history") {
      ui.input.value = item.title;
      scheduleQuery(item.title);
      ui.input.focus();
      return;
    }
    pushHistory(ui.keyword || item.title);
    location.assign(item.url);
  }
  function activateCurrent() {
    if (ui.active >= 0 && ui.items[ui.active]) {
      openItem(ui.items[ui.active]);
      return;
    }
    location.assign(moreSearchUrl(ui.keyword));
  }
  function onDocMouseDown(event) {
    if (isSearchUi(event.target)) return;
    closeSearchUi();
  }
  function onKeyDown(event) {
    if (event.key === "Escape" && (ui.open || ui.settingsOpen)) {
      event.preventDefault();
      closeSearchUi();
      ui.input?.blur();
      return;
    }
    if (!ui.open) return;
    const extra = 1;
    const total = ui.items.length + extra;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive(ui.active < 0 ? 0 : (ui.active + 1) % total);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive(ui.active <= 0 ? total - 1 : ui.active - 1);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (ui.active === ui.items.length || ui.active < 0) {
        if (ui.keyword) pushHistory(ui.keyword);
        location.assign(moreSearchUrl(ui.keyword));
        return;
      }
      activateCurrent();
    }
  }
  function onWindowChange() {
    if (ui.root) placeRoot(ui.root);
    placePanel();
    placeSettings();
  }
  function bindOnce(root) {
    if (root.dataset.wxqsBound === "1") return;
    root.dataset.wxqsBound = "1";
    const input = root.querySelector(".wxqs-input");
    const clear = root.querySelector(".wxqs-clear");
    ui.input = input;
    ui.clear = clear;
    root.addEventListener("mouseenter", onSearchBoxEnter);
    root.addEventListener("mouseleave", onSearchLeave);
    input.addEventListener("focus", function() {
      const next = input.value.trim().slice(0, KEYWORD_MAX);
      scheduleQuery(next);
    });
    input.addEventListener("input", function() {
      scheduleQuery(input.value.trim().slice(0, KEYWORD_MAX));
    });
    input.addEventListener("keydown", onKeyDown);
    clear.addEventListener("mousedown", function(event) {
      event.preventDefault();
    });
    clear.addEventListener("click", function() {
      input.value = "";
      scheduleQuery("");
      input.focus();
    });
  }
  function ensurePanel() {
    let panel = document.getElementById(SEARCH_PANEL_ID);
    if (!panel) {
      panel = document.createElement("div");
      panel.id = SEARCH_PANEL_ID;
      panel.hidden = true;
      panel.addEventListener("mousedown", function(event) {
        event.preventDefault();
      });
      panel.addEventListener("mouseenter", onSearchEnter);
      panel.addEventListener("mouseleave", onSearchLeave);
      document.documentElement.appendChild(panel);
    }
    ui.panel = panel;
    return panel;
  }
  function ensureSettings() {
    let settings = document.getElementById(SEARCH_SETTINGS_ID);
    if (!settings) {
      settings = document.createElement("div");
      settings.id = SEARCH_SETTINGS_ID;
      settings.hidden = true;
      settings.addEventListener("mousedown", function(event) {
        event.preventDefault();
      });
      settings.addEventListener("mouseenter", onSearchEnter);
      settings.addEventListener("mouseleave", onSearchLeave);
      document.documentElement.appendChild(settings);
    }
    ui.settings = settings;
    return settings;
  }
  function ensureRoot() {
    let root = document.getElementById(SEARCH_ROOT_ID);
    if (!root) {
      root = document.createElement("div");
      root.id = SEARCH_ROOT_ID;
      root.innerHTML = `<div class="wxqs-field">${SEARCH_ICON}<input class="wxqs-input" type="search" maxlength="${KEYWORD_MAX}" placeholder="\u641C\u7D22" autocomplete="off" spellcheck="false" enterkeyhint="search" /><button class="wxqs-clear" type="button" hidden aria-label="\u6E05\u9664">${CLEAR_ICON}</button></div>`;
    } else {
      root.querySelector(".wxqs-menu")?.remove();
    }
    placeRoot(root);
    bindOnce(root);
    ui.root = root;
    ui.input = root.querySelector(".wxqs-input");
    ui.clear = root.querySelector(".wxqs-clear");
    return root;
  }
  function unmountSearch() {
    window.clearTimeout(ui.debounce);
    cancelLeaveClose();
    document.removeEventListener("mousedown", onDocMouseDown, true);
    window.removeEventListener("resize", onWindowChange);
    window.removeEventListener("scroll", onWindowChange, true);
    document.getElementById(SEARCH_ROOT_ID)?.remove();
    document.getElementById(SEARCH_PANEL_ID)?.remove();
    document.getElementById(SEARCH_SETTINGS_ID)?.remove();
    ui.root = null;
    ui.panel = null;
    ui.settings = null;
    ui.input = null;
    ui.clear = null;
    ui.open = false;
    ui.settingsOpen = false;
    ui.items = [];
    ui.titleFiles = [];
    ui.bodyFiles = [];
    ui.recent = null;
  }
  function mountSearch() {
    const root = ensureRoot();
    ensurePanel();
    ensureSettings();
    readScope();
    bindOnce(root);
    if (!isPlaced(root)) placeRoot(root);
    document.removeEventListener("mousedown", onDocMouseDown, true);
    document.addEventListener("mousedown", onDocMouseDown, true);
    window.removeEventListener("resize", onWindowChange);
    window.addEventListener("resize", onWindowChange);
    window.removeEventListener("scroll", onWindowChange, true);
    window.addEventListener("scroll", onWindowChange, true);
    if (ui.open) placePanel();
  }

  // src/doc-meta.js
  var ui2 = {
    signature: "",
    mode: "",
    tipTimer: 0,
    docId: "",
    meta: null,
    root: null,
    parts: null,
    inset: null
  };
  var CANVAS_GAP = 8;
  var META_FALLBACK_H = 26;
  var avatarCache = /* @__PURE__ */ new Map();
  var avatarFetching = "";
  function formatPrettyDate(ts) {
    const ms = asMs(ts);
    if (!ms) return "";
    const date = new Date(ms);
    if (Number.isNaN(date.getTime())) return "";
    const now = /* @__PURE__ */ new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const day = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const diff = Math.round((start - day) / 864e5);
    if (diff === 0) return "\u4ECA\u5929";
    if (diff === 1) return "\u6628\u5929";
    if (date.getFullYear() === now.getFullYear()) {
      return `${date.getMonth() + 1}\u6708${date.getDate()}\u65E5`;
    }
    return `${date.getFullYear()}\u5E74${date.getMonth() + 1}\u6708${date.getDate()}\u65E5`;
  }
  function letterOf(name) {
    return String(name || "?").trim().slice(0, 1).toUpperCase();
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
    img.addEventListener("error", function() {
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
    clearTimeout(ui2.tipTimer);
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
    clearTimeout(ui2.tipTimer);
    ui2.tipTimer = window.setTimeout(hideTip, 1400);
  }
  function bindAvatar(btn) {
    btn.addEventListener("mouseenter", function() {
      showTip(btn, btn.dataset.id);
    });
    btn.addEventListener("focus", function() {
      showTip(btn, btn.dataset.id);
    });
    btn.addEventListener("mouseleave", hideTip);
    btn.addEventListener("blur", hideTip);
    btn.addEventListener("click", function(event) {
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
      const siblings = [...parent.children].filter(function(el) {
        return el.id !== DOC_META_ROOT_ID && el.getBoundingClientRect().height > 8;
      });
      if (siblings.length > 1) return node;
      node = parent;
    }
    return node;
  }
  function dropExtraMeta(keep) {
    document.querySelectorAll(`#${DOC_META_ROOT_ID}`).forEach(function(el) {
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
    if (!root || ui2.mode !== mode || !document.documentElement.contains(root)) return false;
    return mode !== "doc" || root.style.position === "fixed" || root.style.position === "absolute";
  }
  function parkPending(root) {
    attachToHtml(root);
    root.setAttribute("data-pending", "1");
  }
  function markPlaced(root, mode) {
    root.removeAttribute("data-pending");
    ui2.mode = mode;
    return true;
  }
  function hasDocPages() {
    return Boolean(document.querySelector(".melo-page-container-view, .melo-page-main-view"));
  }
  function findDocCanvas() {
    const view = document.querySelector(".melo-doc-view");
    if (!view) return null;
    const rect = view.getBoundingClientRect();
    return rect.width > 40 ? view : null;
  }
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
      contentLeft: Math.round(paraRect.left - canvasRect.left)
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
      const canvas = title;
      const pos = getComputedStyle(canvas).position;
      if (pos === "static") canvas.style.position = "relative";
      root.dataset.mode = "doc";
      root.style.position = "absolute";
      if (root.parentElement !== canvas) canvas.appendChild(root);
      const inset = measureFirstPageInset(canvas) || ui2.inset;
      if (inset) ui2.inset = inset;
      const height = root.offsetHeight || META_FALLBACK_H;
      root.style.top = `${Math.max(CANVAS_GAP, inset ? inset.contentTop - height - CANVAS_GAP : CANVAS_GAP)}px`;
      root.style.left = `${inset && inset.contentLeft > 0 ? inset.contentLeft : 64}px`;
      root.style.width = "max-content";
      root.style.maxWidth = "min(560px, calc(100% - 88px))";
      root.style.zIndex = "6";
      dropExtraMeta(root);
      return true;
    }
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
  function placeDocMeta(root) {
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
    if (keepLastPlace(root, "doc")) return true;
    parkPending(root);
    return false;
  }
  function heldRoot() {
    return document.getElementById(DOC_META_ROOT_ID) || ui2.root;
  }
  function ensureRoot2() {
    let root = heldRoot();
    if (!root) {
      root = document.createElement("div");
      root.id = DOC_META_ROOT_ID;
      root.setAttribute("data-empty", "1");
    }
    ui2.root = root;
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
    face.setAttribute("aria-label", "\u590D\u5236\u521B\u5EFA\u4EBA Id");
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
    if (ui2.parts && root.contains(ui2.parts.row)) return ui2.parts;
    const parts = buildRow();
    root.replaceChildren(parts.row);
    ui2.parts = parts;
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
      parts.face.setAttribute("aria-label", meta.name ? `\u590D\u5236 ${meta.name}` : "\u590D\u5236\u521B\u5EFA\u4EBA Id");
      parts.name.textContent = meta.name || "";
      parts.name.hidden = !meta.name;
    }
    parts.updated.textContent = updated ? `\u6700\u8FD1\u7F16\u8F91 ${updated}` : "";
    parts.created.textContent = created ? `\u521B\u5EFA\u4E8E ${created}` : "";
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
    return `${meta.name}	${meta.avatar}	${meta.createdAt}	${meta.updatedAt}`;
  }
  function mergeMeta(prev, next) {
    if (!next || typeof next !== "object") return prev;
    if (!prev) return next;
    return {
      name: next.name || prev.name,
      avatar: next.avatar || prev.avatar,
      createdAt: next.createdAt || prev.createdAt,
      updatedAt: next.updatedAt || prev.updatedAt,
      creatorVid: next.creatorVid || prev.creatorVid
    };
  }
  function ensureCreatorAvatar(meta) {
    const vid = String(meta?.creatorVid || "").trim();
    const name = String(meta?.name || "").trim();
    const key = vid || name;
    if (!key || meta?.avatar || !ui2.docId) return;
    if (avatarCache.has(key)) {
      const url = avatarCache.get(key);
      if (url) renderDocMeta({ avatar: url });
      return;
    }
    if (avatarFetching === key) return;
    avatarFetching = key;
    const docId = ui2.docId;
    fetchCreatorAvatar(docId, vid, name).then(function(url) {
      avatarCache.set(key, url || "");
      if (url && ui2.docId === docId) renderDocMeta({ avatar: url });
    }).catch(function() {
      avatarCache.set(key, "");
    }).then(function() {
      if (avatarFetching === key) avatarFetching = "";
    });
  }
  function unmountDocMeta() {
    hideTip();
    heldRoot()?.remove();
    ui2.signature = "";
    ui2.mode = "";
    ui2.docId = "";
    ui2.meta = null;
    ui2.root = null;
    ui2.parts = null;
    ui2.inset = null;
  }
  function renderDocMeta(meta) {
    if (!isDocDetailPage()) {
      unmountDocMeta();
      return;
    }
    const docId = parseDocPath(location.pathname)?.id || "";
    const existing = heldRoot();
    if (ui2.docId && ui2.docId !== docId) {
      ui2.meta = null;
      ui2.signature = "";
      ui2.mode = "";
      ui2.inset = null;
      if (existing) existing.setAttribute("data-empty", "1");
    }
    ui2.docId = docId;
    const next = mergeMeta(ui2.meta, meta);
    if (!hasPaint(next)) {
      if (existing) placeDocMeta(existing);
      return;
    }
    const root = ensureRoot2();
    ui2.meta = next;
    const signature = metaSignature(next);
    if (signature !== ui2.signature || !ui2.parts || !root.contains(ui2.parts.row)) {
      ui2.signature = signature;
      fill(root, next);
    }
    placeDocMeta(root);
    ensureCreatorAvatar(next);
  }

  // src/refs.js
  var ICONS = {
    smartpage: '<svg class="wxrd-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path fill="#3999DA" d="M4 5.35C4 4.6 4.6 4 5.35 4h9.3C15.4 4 16 4.6 16 5.35v9.4c0 .69-.56 1.25-1.25 1.25h-9.4C4.6 16 4 15.4 4 14.65v-9.3z"/><path fill="#5FB8F3" d="M12.15 0C12.9 0 13.5.6 13.5 1.35v13.4c0 .69.56 1.25 1.25 1.25H1.35C.6 16 0 15.4 0 14.65V1.35C0 .6.6 0 1.35 0h10.8z"/><path fill="#fff" d="M4.3 6.64a.2.2 0 01.4 0l.66 1.87c.02.06.07.1.13.13l1.87.67a.2.2 0 010 .38l-1.87.67a.2.2 0 00-.13.13l-.67 1.87a.2.2 0 01-.38 0l-.67-1.87a.2.2 0 00-.13-.13l-1.87-.67a.2.2 0 010-.38l1.87-.67a.2.2 0 00.13-.13l.67-1.87z"/></svg>',
    doc: '<svg class="wxrd-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path fill="#2B7DE1" d="M3 1.75A1.75 1.75 0 014.75 0h5.09L13 3.2V14.25A1.75 1.75 0 0111.25 16h-6.5A1.75 1.75 0 013 14.25V1.75z"/><path fill="#7CB4F2" d="M9.7 0v2.4c0 .5.4.9.9.9H13L9.7 0z"/><path fill="#fff" d="M5 7h6v1.2H5V7zm0 2.3h6v1.2H5V9.3z"/></svg>',
    sheet: '<svg class="wxrd-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect width="16" height="16" rx="3" fill="#07C160"/><path fill="#fff" d="M3.2 3.2h9.6v1.4H3.2V3.2zm0 2.8h2.8v6.8H3.2V6zm4 0h5.6v2H7.2V6zm0 3.2h5.6v3.6H7.2V9.2z"/></svg>',
    smartsheet: '<svg class="wxrd-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect width="16" height="16" rx="3" fill="#00A5A8"/><path fill="#fff" d="M3 3.5h10v2H3v-2zm0 3.5h4.4v5.5H3V7zm5.6 0H13v2.4H8.6V7zm0 3.4H13V13H8.6v-2.6z"/></svg>',
    slide: '<svg class="wxrd-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect width="16" height="16" rx="3" fill="#F5A623"/><path fill="#fff" d="M3.2 3.4h9.6v7.2H3.2V3.4zm3.2 8.4h3.2V13H6.4v-1.2z"/></svg>'
  };
  var REFRESH_ICON = '<svg class="wxwd-refresh-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M11.577 5.211a7.8 7.8 0 105.938 2.274l.849-.849a9 9 0 11-7.195-2.598l-1.19-1.19.85-.848 2.474 2.475a.5.5 0 010 .707l-.495.495-1.98 1.98-.848-.849 1.597-1.597z" fill="currentColor" fill-rule="evenodd" fill-opacity=".9"/></svg>';
  var CLOSE_ICON = '<svg class="wxrd-close-icon" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M4.22 4.22a.75.75 0 011.06 0L8 6.94l2.72-2.72a.75.75 0 111.06 1.06L9.06 8l2.72 2.72a.75.75 0 11-1.06 1.06L8 9.06l-2.72 2.72a.75.75 0 11-1.06-1.06L6.94 8 4.22 5.28a.75.75 0 010-1.06z"/></svg>';
  var PERSON_ICON = '<svg class="wxrd-person" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.3 19.8v-.485c0-.229-.235-.605-.44-.705l-5.66-2.76c-1.527-.745-1.904-2.546-.81-3.843l.36-.428c.552-.654 1.05-2.014 1.05-2.868V7c0-1.545-1.254-2.8-2.8-2.8A2.803 2.803 0 009.2 7v1.71c0 .856.496 2.21 1.05 2.866l.36.429c1.097 1.299.715 3.099-.81 3.843L4.14 18.61c-.203.099-.44.479-.44.705v.485h16.6zM2.5 20v-.685c0-.685.498-1.483 1.114-1.784l5.66-2.762c.821-.4 1.012-1.288.42-1.99l-.362-.429C8.596 11.478 8 9.85 8 8.71V7a4 4 0 018 0v1.71c0 1.14-.6 2.773-1.332 3.642l-.361.428c-.59.699-.406 1.588.419 1.99l5.66 2.762c.615.3 1.114 1.093 1.114 1.783V20a1 1 0 01-1 1h-17a1 1 0 01-1-1z" fill="currentColor" fill-rule="evenodd" fill-opacity=".9"/></svg>';
  var refsUi = {
    items: [],
    signature: "",
    expanded: false,
    statsKey: "",
    enriching: ""
  };
  var heldFooter = null;
  var dismissedPages = /* @__PURE__ */ new Set();
  function isFooterDismissed() {
    return dismissedPages.has(currentPageKey());
  }
  function dismissFooter() {
    dismissedPages.add(currentPageKey());
    hideFooter();
  }
  var refStatsMemo = /* @__PURE__ */ new Map();
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
    return (items || []).some(function(item) {
      return item && item.id && (!item.createdAt || !(Number(item.members) > 0));
    });
  }
  function findRefsHost() {
    if (parseDocPath(location.pathname)?.kind === "smartpage") {
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
    return host.querySelector(":scope > #zoomable-container") || host.querySelector(":scope > #root-editable") || host.querySelector(":scope > #sc-page-content");
  }
  function blockText(el) {
    return String(el?.textContent || "").replace(/[\u200b\u200c\u200d\u2060\ufeff]/g, "").replace(/\s+/g, " ").trim();
  }
  function isTitleOnlyLabel(text) {
    return /^(标题|无标题|无标题智能文档|无标题文档|untitled(?:\s+document)?)$/i.test(String(text || "").trim());
  }
  function isPlaceholderBodyText(text) {
    return /^(输入正文|输入文字|输入内容|点击输入|键入文字|\/)$/.test(String(text || "").trim());
  }
  function isCreatedToday(ts) {
    const ms = asMs(ts);
    if (!ms) return false;
    const date = new Date(ms);
    if (Number.isNaN(date.getTime())) return false;
    const now = /* @__PURE__ */ new Date();
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  }
  function isBlankEditorPage() {
    const kind = parseDocPath(location.pathname)?.kind;
    if (kind === "smartpage") {
      const editable = document.getElementById("root-editable");
      if (!editable) return true;
      const titleEl = editable.querySelector(".sc-text-input-content, .textInput__pIjhc");
      const blocks = editable.querySelectorAll(".sc-block-wrapper");
      for (let i = 0; i < blocks.length; i += 1) {
        const el = blocks[i];
        if (titleEl && (el === titleEl || el.contains(titleEl))) continue;
        if (/sc-block-(image|video|file|embed|simple_table|table|smartsheet|sheet)/.test(String(el.className))) {
          return false;
        }
        const text = blockText(el);
        if (text && !isTitleOnlyLabel(text) && !isPlaceholderBodyText(text)) return false;
      }
      return true;
    }
    return false;
  }
  function shouldHideDocFooter(meta) {
    if (!isBlankEditorPage()) return false;
    if (!meta) return true;
    if (!isOwnDoc(meta)) return false;
    if (!meta.createdAt) return true;
    return isCreatedToday(meta.createdAt);
  }
  function mainContentReady() {
    const kind = parseDocPath(location.pathname)?.kind;
    if (kind === "smartpage") {
      const scroll = document.querySelector("#sc-scroll-container");
      const jumper = scroll?.querySelector(":scope > .jumper-dom-container");
      const editable = document.querySelector("#root-editable");
      if (!scroll || !jumper || !editable) return false;
      return editable.getBoundingClientRect().height >= 80 && editable.childElementCount > 0;
    }
    if (kind === "doc") {
      const zoom = document.querySelector("#zoomable-container") || document.querySelector("#zoomable-content-canvas");
      if (!zoom) return false;
      return zoom.getBoundingClientRect().height >= 80;
    }
    return false;
  }
  var unlockFor = "";
  var settleH = 0;
  var settleAt = 0;
  var revealFor = "";
  var lastRefsN = -1;
  var lastRefsAt = 0;
  var lastFootH = -1;
  var lastFootAt = 0;
  function resetFooterGate() {
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
  function currentPageKey() {
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
  function footerLayoutReady() {
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
  function footerPending() {
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
  var FOOTER_CONTENT_GAP = 100;
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
    const target = document.querySelector("#sc-page-content") || document.querySelector("#zoomable-content-canvas") || document.querySelector("#zoomable-container") || document.querySelector(".surface");
    if (!host || !target) return;
    const hostRect = host.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    if (targetRect.width < 240) return;
    const width = `${Math.round(targetRect.width)}px`;
    const marginLeft = `${Math.max(0, Math.round(targetRect.left - hostRect.left))}px`;
    if (footer.style.width !== width) footer.style.width = width;
    if (footer.style.marginLeft !== marginLeft) footer.style.marginLeft = marginLeft;
    const canvas = findCanvas(host);
    const content = canvas && (canvas.querySelector("#root-editable") || canvas.querySelector("#sc-page-content")) || document.getElementById("root-editable") || document.getElementById("sc-page-content");
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
  function syncFooterEmpty(footer) {
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
  function hideFooter() {
    const footer = document.getElementById(FOOTER_ROOT_ID) || heldFooter;
    footer?.remove();
    document.getElementById(FOOTER_SPACE_ID)?.remove();
  }
  function placeFooter(footer) {
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
  function placeRefsRoot(root) {
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
    btn.setAttribute("aria-label", "\u5173\u95ED\u5F15\u7528");
    btn.insertAdjacentHTML("afterbegin", CLOSE_ICON);
    btn.addEventListener("click", function(event) {
      event.preventDefault();
      event.stopPropagation();
      dismissFooter();
    });
    footer.appendChild(btn);
    return btn;
  }
  function ensureFooter() {
    if (isFooterDismissed()) {
      hideFooter();
      return null;
    }
    let footer = document.getElementById(FOOTER_ROOT_ID) || heldFooter;
    if (!footer) {
      footer = document.createElement("div");
      footer.id = FOOTER_ROOT_ID;
      footer.setAttribute("data-empty", "1");
      footer.setAttribute("data-pending", "1");
    }
    heldFooter = footer;
    const refs = ensureCol(REFS_ROOT_ID, "\u672C\u6587\u5173\u8054\u6587\u6863");
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
  function unmountRefs() {
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
    return `${item.id}	${item.title}	${item.kind}	${item.createdAt || 0}	${item.members || 0}`;
  }
  function renderRefDocs(items) {
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
    title.textContent = `\u672C\u6587\u5173\u8054\u6587\u6863\uFF08${list.length}\uFF09`;
    head.appendChild(title);
    root.appendChild(head);
    if (!list.length) {
      const empty = document.createElement("div");
      empty.className = "wxrd-empty";
      empty.textContent = "\u6682\u65E0\u5173\u8054\u6587\u6863";
      root.appendChild(empty);
      placeFooter();
      return;
    }
    const listEl = document.createElement("div");
    listEl.className = "wxrd-list";
    visible.forEach(function(item) {
      listEl.appendChild(paintDocLink(item, "wxrd-item", "wxrd-name"));
    });
    root.appendChild(listEl);
    if (list.length > REFS_MAX_VISIBLE) {
      const more = document.createElement("button");
      more.type = "button";
      more.className = "wxrd-more";
      more.setAttribute("aria-expanded", refsUi.expanded ? "true" : "false");
      more.textContent = refsUi.expanded ? "\u6536\u8D77" : `\u5C55\u793A\u5168\u90E8\uFF08\u8FD8\u6709 ${list.length - REFS_MAX_VISIBLE} \u7BC7\uFF09`;
      more.addEventListener("click", function(event) {
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
    const key = list.map(function(item) {
      return item?.id || "";
    }).join("|");
    if (!key || !needsRefStats(list)) {
      refsUi.statsKey = key;
      return;
    }
    if (refsUi.enriching === key || refsUi.statsKey === key) return;
    refsUi.enriching = key;
    enrichDocStats(list).then(function() {
      applyRefStats(list);
      applyRefStats(refsUi.items);
      refsUi.statsKey = key;
      refsUi.signature = "";
      renderRefDocs(refsUi.items);
    }).finally(function() {
      if (refsUi.enriching === key) refsUi.enriching = "";
    });
  }
  function paintWanderCol(items, options) {
    if (isFooterDismissed()) return;
    const footer = ensureFooter();
    if (!footer) return;
    const root = findHeld(WANDER_ROOT_ID);
    if (!root) return;
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
    title.textContent = `You may also wander\uFF08${list.length}\uFF09`;
    head.appendChild(title);
    const refresh = document.createElement("button");
    refresh.type = "button";
    refresh.className = "wxwd-refresh";
    refresh.setAttribute("aria-label", "\u5237\u65B0\u63A8\u8350\u6587\u6863");
    refresh.insertAdjacentHTML("afterbegin", REFRESH_ICON);
    refresh.addEventListener("click", function(event) {
      event.preventDefault();
      if (typeof opts.onRefresh === "function") opts.onRefresh();
    });
    head.appendChild(refresh);
    root.appendChild(head);
    if (loading && !list.length) {
      const status = document.createElement("div");
      status.className = "wxwd-status";
      status.textContent = "\u52A0\u8F7D\u4E2D\u2026";
      root.appendChild(status);
    } else {
      const listEl = document.createElement("div");
      listEl.className = "wxwd-list";
      list.forEach(function(item) {
        listEl.appendChild(paintDocLink(item, "wxwd-item", "wxwd-name"));
      });
      root.appendChild(listEl);
    }
    syncFooterEmpty(footer);
    placeFooter(footer);
  }

  // src/toolbar.js
  var PLUS_ICON = '<svg class="wxcr-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M11.4 11.4V7h1.2v4.4H17v1.2h-4.4V17h-1.2v-4.4H7v-1.2h4.4zM12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm0-1.2a8.8 8.8 0 100-17.6 8.8 8.8 0 000 17.6z" fill="currentColor" fill-rule="evenodd"/></svg>';
  var OUR_UI = `#${CREATE_PLUS_ID}, #${TITLEBAR_TOOLS_ID}, #${SEARCH_ROOT_ID}, #${SEARCH_PANEL_ID}, #${SEARCH_SETTINGS_ID}, #wxdoc-online-viewers, #${REFS_ROOT_ID}, #${FOOTER_ROOT_ID}, #${FOOTER_SPACE_ID}, #${WANDER_ROOT_ID}, #${DOC_META_ROOT_ID}`;
  var creating = false;
  function currentKind() {
    return parseDocPath(location.pathname)?.kind || "";
  }
  function cookieSid2() {
    const matched = document.cookie.match(/(?:^|;\s*)(?:wedoc_sid|wedrive_sid|tdoc_sid)=([^;]+)/);
    return matched ? matched[1] : "";
  }
  function unwrapBody2(data) {
    if (data && data.body && typeof data.body === "object") return data.body;
    return data || {};
  }
  function requestOk2(data) {
    const ret = data?.head?.ret;
    return ret === 0 || ret == null;
  }
  async function postForm2(path, fields) {
    const query = new URLSearchParams();
    const sid = cookieSid2();
    if (sid) query.set("sid", sid);
    query.set("wedoc_xsrf", "1");
    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(fields)) {
      if (value == null) continue;
      body.set(key, String(value));
    }
    const res = await fetch(`${path}?${query}`, {
      method: "POST",
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    });
    if (!res.ok) throw new Error(`create ${res.status}`);
    return res.json();
  }
  function pickCreateUrl(data) {
    const body = unwrapBody2(data);
    const file = body.file_info && typeof body.file_info === "object" && body.file_info || body.file && typeof body.file === "object" && body.file || body.new_file_2 && typeof body.new_file_2 === "object" && body.new_file_2 || body;
    const url = String(file.doc_url || file.url || body.doc_url || body.url || "").trim();
    if (url && /doc\.weixin\.qq\.com/i.test(url)) return url;
    const id = String(file.doc_id || file.file_id || body.doc_id || "").trim();
    return id ? `https://doc.weixin.qq.com/smartpage/${id}` : "";
  }
  function hideSmartpageTexts() {
    if (currentKind() !== "smartpage") return;
    document.querySelectorAll('[data-wecom-better-hide="\u53D1\u5E03"]').forEach(function(el) {
      el.removeAttribute("data-wecom-better-hide");
    });
    document.querySelectorAll("button, a, [role='button'], span, div").forEach(function(el) {
      if (el.closest(OUR_UI)) return;
      const rect = el.getBoundingClientRect();
      if (rect.top < 0 || rect.top > 64 || rect.height > 48 || rect.left < window.innerWidth * 0.42) return;
      const text = String(el.innerText || el.textContent || "").replace(/\s+/g, "");
      if (!/^成员\d*$/.test(text)) return;
      const target = el.closest("button, a, [role='button']") || el;
      target.setAttribute("data-wecom-better-hide", "\u6210\u5458");
    });
  }
  function ensureTools() {
    let tools = document.getElementById(TITLEBAR_TOOLS_ID);
    if (!tools) {
      tools = document.createElement("div");
      tools.id = TITLEBAR_TOOLS_ID;
    }
    return tools;
  }
  function isolateTools(tools) {
    if (tools.dataset.wxcrIsolated === "1") return;
    tools.dataset.wxcrIsolated = "1";
    const stop = function(event) {
      if (event.target.closest(`#${CREATE_PLUS_ID}`)) return;
      event.stopPropagation();
    };
    ["pointerdown", "mousedown", "mouseup", "click", "mouseover"].forEach(function(type) {
      tools.addEventListener(type, stop);
    });
  }
  function parkTools(tools) {
    if (tools.parentElement !== document.documentElement) {
      document.documentElement.appendChild(tools);
    }
    tools.style.display = "none";
  }
  function placeTools(tools, plus) {
    const search = document.getElementById(SEARCH_ROOT_ID);
    isolateTools(tools);
    if (search && (search.parentElement !== tools || tools.firstElementChild !== search)) {
      tools.insertBefore(search, tools.firstChild);
    }
    if (search) moveBefore(plus, tools, search.nextSibling);
    else moveBefore(plus, tools, null);
    const anchor = findToolsAnchor();
    if (!anchor) {
      parkTools(tools);
      return;
    }
    tools.style.display = "";
    moveBefore(tools, anchor.host, anchor.before);
  }
  function flashFail(plus, message) {
    plus.title = message || "\u65B0\u5EFA\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5";
    window.setTimeout(function() {
      plus.title = "\u65B0\u5EFA\u667A\u80FD\u6587\u6863";
    }, 2400);
  }
  function paintPreview(preview) {
    if (!preview) return;
    try {
      preview.document.open();
      preview.document.write(
        `<!doctype html><html><head><meta charset="utf-8"><title>\u6B63\u5728\u521B\u5EFA\u6587\u6863</title><style>html,body{height:100%;margin:0;background:#f5f6f7;color:#8f959e;font:14px/22px 'PingFang SC','Hiragino Sans GB',sans-serif;display:flex;align-items:center;justify-content:center}</style></head><body>\u6B63\u5728\u521B\u5EFA\u667A\u80FD\u6587\u6863\u2026</body></html>`
      );
      preview.document.close();
    } catch {
    }
  }
  function openCreatedDoc(url, preview) {
    if (preview && !preview.closed) {
      try {
        preview.location.replace(url);
        return true;
      } catch {
      }
    }
    const next = window.open(url, "_blank", "noopener");
    return Boolean(next && !next.closed);
  }
  async function createSmartpageUrl() {
    const data = await postForm2("/webdisk/create", {
      func: "17",
      name: "\u65E0\u6807\u9898\u667A\u80FD\u6587\u6863",
      space_id: "",
      father_id: "",
      add_to_open_list: "true"
    });
    if (!requestOk2(data)) throw new Error(data?.head?.msg || "create failed");
    const url = pickCreateUrl(data);
    if (!url) throw new Error("empty create url");
    return url;
  }
  function startCreate(plus) {
    if (creating || !plus) return;
    creating = true;
    plus.setAttribute("aria-busy", "true");
    plus.classList.add("is-busy");
    const preview = window.open("about:blank", "_blank");
    paintPreview(preview);
    createSmartpageUrl().then(function(url) {
      if (openCreatedDoc(url, preview)) return;
      flashFail(plus, "\u8BF7\u5141\u8BB8\u5F39\u51FA\u7A97\u53E3\u540E\u91CD\u8BD5");
    }).catch(function() {
      if (preview && !preview.closed) preview.close();
      flashFail(plus);
    }).finally(function() {
      creating = false;
      plus.removeAttribute("aria-busy");
      plus.classList.remove("is-busy");
    });
  }
  function onPlusActivate(event) {
    if (event.type === "pointerdown" && event.button !== 0) return;
    if (event.type === "click" && creating) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (creating) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    startCreate(event.currentTarget);
  }
  function ensurePlus() {
    let root = document.getElementById(CREATE_PLUS_ID);
    if (!root) {
      root = document.createElement("button");
      root.id = CREATE_PLUS_ID;
      root.type = "button";
      root.setAttribute("aria-label", "\u65B0\u5EFA\u667A\u80FD\u6587\u6863");
      root.title = "\u65B0\u5EFA\u667A\u80FD\u6587\u6863";
      root.insertAdjacentHTML("afterbegin", PLUS_ICON);
      root.addEventListener("pointerdown", onPlusActivate, true);
      root.addEventListener("click", onPlusActivate);
    }
    placeTools(ensureTools(), root);
    return root;
  }
  function unmountToolbar() {
    document.getElementById(CREATE_PLUS_ID)?.remove();
    const tools = document.getElementById(TITLEBAR_TOOLS_ID);
    if (tools) {
      const search = document.getElementById(SEARCH_ROOT_ID);
      if (search && tools.contains(search)) {
        tools.parentElement?.insertBefore(search, tools);
      }
      tools.remove();
    }
    document.querySelectorAll("[data-wecom-better-hide]").forEach(function(el) {
      el.removeAttribute("data-wecom-better-hide");
    });
  }
  function renderToolbar() {
    document.documentElement.dataset.wecomDocKind = currentKind();
    if (!isDocDetailPage()) {
      unmountToolbar();
      return;
    }
    ensurePlus();
    hideSmartpageTexts();
  }

  // src/viewers.js
  var ui3 = {
    viewers: [],
    signature: "",
    tooltipTimer: 0,
    toastTimer: 0,
    layer: null,
    tipWatch: null,
    tipInner: null,
    tipNode: null
  };
  var MEMBER_TIP_RE = /名成员|正在查看/;
  var TIP_CONTAINER = ".dui-tooltip-container";
  var MUTE_ATTR = "data-wxov-mute";
  function syncTipMute(el) {
    const lines = el.querySelectorAll("p");
    const mute = [...lines].some(function(line) {
      return MEMBER_TIP_RE.test(line.textContent || "");
    });
    if (mute === (el.getAttribute(MUTE_ATTR) === "1")) return;
    if (mute) el.setAttribute(MUTE_ATTR, "1");
    else el.removeAttribute(MUTE_ATTR);
  }
  function bindTipContainer(el) {
    if (!el || el === ui3.tipNode) {
      if (el) syncTipMute(el);
      return;
    }
    ui3.tipInner?.disconnect();
    ui3.tipNode = el;
    ui3.tipInner = new MutationObserver(function() {
      syncTipMute(el);
    });
    ui3.tipInner.observe(el, { childList: true, subtree: true, characterData: true });
    syncTipMute(el);
  }
  function watchNativeMemberTip() {
    if (ui3.tipWatch || !document.body) return;
    bindTipContainer(document.querySelector(TIP_CONTAINER));
    ui3.tipWatch = new MutationObserver(function(records) {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType !== 1) continue;
          const hit = node.matches(TIP_CONTAINER) ? node : node.querySelector(TIP_CONTAINER);
          if (hit) bindTipContainer(hit);
        }
      }
    });
    ui3.tipWatch.observe(document.body, { childList: true });
  }
  function unmountViewers() {
    hideFloat();
    document.getElementById(ROOT_ID)?.remove();
    document.getElementById(FLOAT_LAYER_ID)?.remove();
    ui3.viewers = [];
    ui3.signature = "";
    ui3.layer = null;
    ui3.tipWatch?.disconnect();
    ui3.tipWatch = null;
    ui3.tipInner?.disconnect();
    ui3.tipInner = null;
    ui3.tipNode = null;
    document.querySelectorAll(`${TIP_CONTAINER}[${MUTE_ATTR}]`).forEach(function(el) {
      el.removeAttribute(MUTE_ATTR);
    });
    document.documentElement.classList.remove(SILENT_PANEL_CLASS);
  }
  function findHost() {
    const btn = findVisibleCollabButton();
    return btn ? btn.parentElement : null;
  }
  function fallbackNode2(id) {
    const span = document.createElement("span");
    span.className = "wxov-fallback";
    span.textContent = String(id || "?").trim().slice(0, 1).toUpperCase();
    return span;
  }
  function avatarInner(viewer) {
    if (!viewer.avatar) return fallbackNode2(viewer.id);
    const img = document.createElement("img");
    img.src = viewer.avatar;
    img.alt = "";
    img.referrerPolicy = "no-referrer";
    img.addEventListener("error", function() {
      img.replaceWith(fallbackNode2(viewer.id));
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
  function ensureRoot3() {
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
    if (ui3.layer && document.body.contains(ui3.layer)) return ui3.layer;
    const layer = document.createElement("div");
    layer.id = FLOAT_LAYER_ID;
    document.body.appendChild(layer);
    ui3.layer = layer;
    return layer;
  }
  function placeCard(anchor, card) {
    const rect = anchor.getBoundingClientRect();
    card.style.left = `${rect.left + rect.width / 2}px`;
    card.style.top = `${rect.bottom + 8}px`;
  }
  function hideFloat() {
    clearTimeout(ui3.tooltipTimer);
    if (ui3.layer) ui3.layer.replaceChildren();
  }
  function openCard(className) {
    const layer = ensureLayer();
    layer.replaceChildren();
    const card = document.createElement("div");
    card.className = className;
    layer.appendChild(card);
    return card;
  }
  function showTip2(anchor, viewer) {
    const card = openCard("wxov-card");
    const idEl = document.createElement("span");
    idEl.className = "wxov-tip-id";
    idEl.textContent = displayName(viewer);
    card.append(idEl);
    placeCard(anchor, card);
  }
  async function copyId2(viewer, anchor) {
    const id = viewer?.id;
    if (!id) return;
    const ok = await copyText(id);
    if (ok) showTip2(anchor, viewer);
    clearTimeout(ui3.toastTimer);
    ui3.toastTimer = window.setTimeout(hideFloat, 1400);
  }
  function stopAndCopy(event, viewer, anchor) {
    event.preventDefault();
    event.stopPropagation();
    copyId2(viewer, anchor);
  }
  function bindHoverCopy(el, viewer) {
    el.addEventListener("mouseenter", function() {
      showTip2(el, viewer);
    });
    el.addEventListener("focus", function() {
      showTip2(el, viewer);
    });
    el.addEventListener("mouseleave", hideFloat);
    el.addEventListener("blur", hideFloat);
    el.addEventListener("click", function(event) {
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
    clearTimeout(ui3.tooltipTimer);
    const card = openCard("wxov-card is-pop");
    hidden.forEach(function(viewer) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "wxov-pop-item";
      item.appendChild(avatarInner(viewer));
      const idEl = document.createElement("span");
      idEl.className = "wxov-pop-id";
      idEl.textContent = displayName(viewer);
      item.appendChild(idEl);
      item.addEventListener("click", function(event) {
        stopAndCopy(event, viewer, item);
      });
      card.appendChild(item);
    });
    card.addEventListener("mouseenter", function() {
      clearTimeout(ui3.tooltipTimer);
    });
    card.addEventListener("mouseleave", hideFloat);
    placeCard(anchor, card);
  }
  function renderViewers(viewers, total) {
    if (!viewers.length && !total && !ui3.viewers.length) return;
    watchNativeMemberTip();
    const root = ensureRoot3();
    const signature = `${viewers.map((v) => `${v.id}
${v.avatar}`).join("|")}#${viewers.length}/${total}`;
    if (signature === ui3.signature && root.childElementCount) {
      placeViewersRoot(root);
      return;
    }
    const samePeople = ui3.viewers.length === viewers.length && ui3.viewers.every(function(item, index) {
      return item && viewers[index] && item.id === viewers[index].id;
    });
    if (samePeople && root.childElementCount) {
      ui3.viewers = viewers;
      ui3.signature = signature;
      const visible2 = viewers.slice(0, MAX_VISIBLE);
      const imgs = root.querySelectorAll(".wxov-avatar img");
      imgs.forEach(function(img, index) {
        const viewer = visible2[visible2.length - 1 - index];
        if (viewer?.avatar && img.getAttribute("src") !== viewer.avatar) img.src = viewer.avatar;
      });
      const count2 = root.querySelector(".wxov-count");
      if (count2) {
        count2.textContent = `${viewers.length}/${total}`;
        count2.setAttribute("aria-label", `\u5728\u770B ${viewers.length} \u4EBA\uFF0C\u5171 ${total} \u4EBA`);
      }
      placeViewersRoot(root);
      return;
    }
    ui3.viewers = viewers;
    ui3.signature = signature;
    root.replaceChildren();
    root.setAttribute("data-empty", viewers.length || total ? "0" : "1");
    if (!viewers.length && !total) return;
    const visible = viewers.slice(0, MAX_VISIBLE);
    const hidden = viewers.slice(MAX_VISIBLE);
    const stack = document.createElement("div");
    stack.className = "wxov-stack";
    stack.setAttribute("aria-label", `\u6B63\u5728\u67E5\u770B ${viewers.length} \u4EBA`);
    if (hidden.length) {
      const more = document.createElement("button");
      more.type = "button";
      more.className = "wxov-more";
      more.style.zIndex = "1";
      more.textContent = `+${hidden.length}`;
      more.setAttribute("aria-label", `\u53E6\u5916 ${hidden.length} \u4EBA\u6B63\u5728\u67E5\u770B`);
      more.addEventListener("mouseenter", function() {
        showOverflow(more, hidden);
      });
      more.addEventListener("focus", function() {
        showOverflow(more, hidden);
      });
      more.addEventListener("mouseleave", function() {
        ui3.tooltipTimer = window.setTimeout(hideFloat, 180);
      });
      stack.appendChild(more);
    }
    visible.slice().reverse().forEach(function(viewer, index) {
      stack.appendChild(makeAvatarButton(viewer, index + 2));
    });
    if (viewers.length) root.appendChild(stack);
    const count = document.createElement("span");
    count.className = "wxov-count";
    count.textContent = `${viewers.length}/${total}`;
    count.setAttribute("aria-label", `\u5728\u770B ${viewers.length} \u4EBA\uFF0C\u5171 ${total} \u4EBA`);
    root.appendChild(count);
  }

  // src/wander.js
  var KEYWORD_POOL = 15;
  var KEYWORD_COUNT_MIN = 2;
  var KEYWORD_COUNT_MAX = 3;
  var PICK_EACH = 3;
  var PICK_TOTAL = 6;
  var CREATOR_TOP = 10;
  var MEMBER_FETCH = 15;
  var STOPWORDS = /* @__PURE__ */ new Set([
    "\u7684",
    "\u4E86",
    "\u548C",
    "\u4E0E",
    "\u53CA",
    "\u6216",
    "\u5728",
    "\u662F",
    "\u5BF9",
    "\u4E3A",
    "\u7B49",
    "\u5173\u4E8E",
    "\u4EE5\u53CA",
    "\u6587\u6863",
    "\u6587\u4EF6",
    "\u65B9\u6848",
    "\u603B\u7ED3",
    "\u8BB0\u5F55",
    "\u8BF4\u660E",
    "\u4ECB\u7ECD",
    "the",
    "a",
    "an",
    "of",
    "for",
    "and",
    "or",
    "to",
    "in",
    "on",
    "v1",
    "v2",
    "v3",
    "\u7248",
    "\u7EC8\u7A3F",
    "\u8349\u7A3F"
  ]);
  var ui4 = {
    refs: [],
    docMeta: null,
    docTitle: "",
    keywordPool: [],
    creatorPool: [],
    items: [],
    loading: false,
    fetched: false,
    seq: 0,
    fetchKey: "",
    refsKey: "",
    paintSig: ""
  };
  function cleanTitle(value) {
    return String(value || "").replace(/[\u200b\u200c\u200d\u2060\ufeff]/g, "").replace(/\s+/g, " ").trim();
  }
  function stripSiteSuffix(title) {
    return cleanTitle(title).replace(
      /\s*[-–—_|]\s*(腾讯文档|企业微信文档|企业微信|微信文档|WeCom|WeChat Work|Tencent Docs)\s*$/i,
      ""
    ).trim();
  }
  function readDomTitle() {
    const doc = document.getElementById("melo-doc-title");
    const fromDoc = cleanTitle(doc && (doc.innerText || doc.textContent));
    if (fromDoc) return fromDoc;
    const smart = document.querySelector(
      "#root-editable .sc-text-input-content, #sc-page-content .sc-text-input-content, #root-editable .textInput__pIjhc, #sc-page-content .textInput__pIjhc"
    );
    const fromSmart = cleanTitle(smart && (smart.innerText || smart.textContent));
    if (fromSmart) return fromSmart;
    return stripSiteSuffix(document.title);
  }
  function tokenizeFallback(text) {
    const tokens = [];
    const re = /[A-Za-z][A-Za-z0-9]*|[0-9]+|[\u3400-\u9FFF\uF900-\uFAFF]+/g;
    let matched;
    while (matched = re.exec(text)) {
      let token = matched[0];
      let changed = true;
      while (changed && token.length > 1) {
        changed = false;
        STOPWORDS.forEach(function(sw) {
          if (!sw || token.length <= sw.length) return;
          if (token.endsWith(sw) && token.length > sw.length) {
            token = token.slice(0, -sw.length);
            changed = true;
          } else if (token.startsWith(sw) && token.length > sw.length) {
            token = token.slice(sw.length);
            changed = true;
          }
        });
      }
      if (token) tokens.push(token);
    }
    return tokens;
  }
  function tokenize(title) {
    const text = cleanTitle(title);
    if (!text) return [];
    if (typeof Intl !== "undefined" && Intl.Segmenter) {
      const tokens = [];
      const seg = new Intl.Segmenter("zh", { granularity: "word" });
      for (const part of seg.segment(text)) {
        const token = String(part.segment || "").trim();
        if (!token || part.isWordLike === false) continue;
        tokens.push(token);
      }
      if (tokens.length) return tokens;
    }
    return tokenizeFallback(text);
  }
  function keepToken(token) {
    const value = String(token || "").trim();
    if (!value || value.length <= 1) return false;
    if (/^\d+$/.test(value)) return false;
    if (STOPWORDS.has(value) || STOPWORDS.has(value.toLowerCase())) return false;
    return true;
  }
  function scoreToken(token, index, total) {
    return token.length * 2 + Math.max(0, total - index) * 0.35;
  }
  function pickKeywords(title) {
    const tokens = tokenize(title).filter(keepToken);
    if (!tokens.length) return [];
    const seen = /* @__PURE__ */ new Set();
    const scored = [];
    tokens.forEach(function(token, index) {
      const key = token.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      scored.push({
        token,
        index,
        score: scoreToken(token, index, tokens.length)
      });
    });
    scored.sort(function(a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return a.index - b.index;
    });
    const hi = Math.min(KEYWORD_COUNT_MAX, scored.length);
    const n = Math.max(Math.min(KEYWORD_COUNT_MIN, hi), hi >= 1 ? Math.min(hi, KEYWORD_COUNT_MAX) : 0);
    return scored.slice(0, n).map(function(item) {
      return item.token;
    });
  }
  function refsKeyOf(refs) {
    return (refs || []).map(function(item) {
      return `${item?.id || ""}	${item?.url || ""}`;
    }).join("|");
  }
  function currentDocKeys() {
    const set = /* @__PURE__ */ new Set();
    const self = currentDocId();
    if (self) {
      set.add(self);
      set.add(`/doc/${self}`);
      set.add(`/smartpage/${self}`);
    }
    try {
      set.add(location.pathname);
      set.add(location.href);
      const parsed = parseDocUrl(location.href);
      if (parsed?.id) set.add(parsed.id);
    } catch {
    }
    return set;
  }
  function buildExclude(refs) {
    const set = currentDocKeys();
    (refs || []).forEach(function(item) {
      if (item?.id) set.add(String(item.id));
      if (item?.url) {
        set.add(String(item.url));
        const parsed = parseDocUrl(item.url);
        if (parsed?.id) set.add(parsed.id);
      }
    });
    return set;
  }
  function fileKeys(file) {
    const keys = [];
    if (file?.id) keys.push(String(file.id));
    if (file?.url) keys.push(String(file.url));
    return keys;
  }
  function isSameAsCurrent(file) {
    const self = currentDocId();
    if (!file) return true;
    if (self) {
      if (file.id === self) return true;
      if (file.url && file.url.includes(self)) return true;
      const parsed = parseDocUrl(file.url);
      if (parsed?.id && parsed.id === self) return true;
    }
    return false;
  }
  function isExcluded(file, exclude) {
    if (!file || isSameAsCurrent(file)) return true;
    const keys = fileKeys(file);
    for (let i = 0; i < keys.length; i += 1) {
      if (exclude.has(keys[i])) return true;
    }
    return false;
  }
  function identityKeys(file) {
    const keys = fileKeys(file);
    const parsed = parseDocUrl(file?.url);
    if (parsed?.id) keys.push(parsed.id);
    return keys;
  }
  function markSeen(seen, file) {
    identityKeys(file).forEach(function(key) {
      if (key) seen.add(key);
    });
  }
  function takeFile(file, seen, exclude) {
    if (isExcluded(file, exclude)) return false;
    if (identityKeys(file).some(function(key) {
      return key && seen.has(key);
    })) return false;
    markSeen(seen, file);
    return true;
  }
  function filterPool(list, exclude) {
    const seen = /* @__PURE__ */ new Set();
    return (list || []).filter(function(file) {
      return takeFile(file, seen, exclude);
    });
  }
  function shuffleCopy(list) {
    const out = (list || []).slice();
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = out[i];
      out[i] = out[j];
      out[j] = tmp;
    }
    return out;
  }
  function takeFrom(pool, count, seen, exclude) {
    const out = [];
    const order = shuffleCopy(pool);
    for (let i = 0; i < order.length && out.length < count; i += 1) {
      if (takeFile(order[i], seen, exclude)) out.push(order[i]);
    }
    return out;
  }
  function rankCreator(files) {
    return files.slice().sort(function(a, b) {
      const am = Number(a.members) || 0;
      const bm = Number(b.members) || 0;
      if (bm !== am) return bm - am;
      return (Number(b.time) || 0) - (Number(a.time) || 0);
    }).slice(0, CREATOR_TOP);
  }
  function mergePicks(keywordPool, creatorPool, exclude) {
    const seen = /* @__PURE__ */ new Set();
    const keywords = keywordPool || [];
    const creators = creatorPool || [];
    const picked = takeFrom(keywords, PICK_EACH, seen, exclude).concat(
      takeFrom(creators, PICK_EACH, seen, exclude)
    );
    return picked.concat(takeFrom(keywords.concat(creators), PICK_TOTAL - picked.length, seen, exclude));
  }
  function refreshPools(refs) {
    const exclude = buildExclude(refs);
    ui4.keywordPool = filterPool(ui4.keywordPool, exclude);
    ui4.creatorPool = rankCreator(filterPool(ui4.creatorPool, exclude));
    return exclude;
  }
  function creatorQueries(meta) {
    const name = String(meta?.name || "").trim();
    const display = String(meta?.displayName || "").trim();
    const vid = String(meta?.creatorVid || "").trim();
    const queries = [];
    if (display) queries.push(display);
    if (name && name !== display) queries.push(name);
    return { queries, vid };
  }
  function creatorMatches(file, meta) {
    const name = String(meta?.name || "").trim().toLowerCase();
    const display = String(meta?.displayName || "").trim().toLowerCase();
    const vid = String(meta?.creatorVid || "").trim();
    if (vid && file.creatorVid && String(file.creatorVid) === vid) return true;
    const hay = String(file.creator || "").toLowerCase();
    if (!hay) return Boolean(name || display || vid);
    if (name && hay.includes(name)) return true;
    if (display && hay.includes(display)) return true;
    return false;
  }
  async function safeSearch(keyword, func, extra) {
    try {
      return await searchDocs(keyword, func, extra);
    } catch {
      return [];
    }
  }
  function mergeKeywordHits(lists) {
    const merged = /* @__PURE__ */ new Map();
    (lists || []).forEach(function(list, listIndex) {
      (list || []).forEach(function(file, fileIndex) {
        if (isSameAsCurrent(file)) return;
        const id = file.id || file.url;
        if (!id) return;
        const prev = merged.get(id);
        if (prev) {
          prev.hits += 1;
          prev.rank = Math.min(prev.rank, fileIndex + listIndex * 0.05);
          return;
        }
        merged.set(id, { file, hits: 1, rank: fileIndex + listIndex * 0.05 });
      });
    });
    return [...merged.values()].sort(function(a, b) {
      if (b.hits !== a.hits) return b.hits - a.hits;
      return a.rank - b.rank;
    }).map(function(item) {
      return item.file;
    });
  }
  async function searchByKeywords(keywords) {
    const queries = (keywords || []).map(function(item) {
      return String(item || "").trim();
    }).filter(Boolean);
    if (!queries.length) return [];
    const lists = await Promise.all(
      queries.map(function(keyword) {
        return safeSearch(keyword, 5);
      })
    );
    return mergeKeywordHits(lists);
  }
  async function searchCreatorDocs(meta) {
    const { queries, vid } = creatorQueries(meta);
    if (!queries.length && !vid) return [];
    let files = [];
    if (vid) {
      files = await safeSearch("", 7, { and_creater: [vid] });
      if (!files.length && queries[0]) {
        files = await safeSearch(queries[0], 7, { and_creater: [vid] });
      }
    }
    for (let i = 0; i < queries.length && !files.length; i += 1) {
      files = await safeSearch(queries[i], 7);
    }
    if (!files.length && queries[0]) files = await safeSearch(queries[0], 5);
    return files.filter(function(file) {
      return !isSameAsCurrent(file) && creatorMatches(file, meta);
    });
  }
  async function fillMemberCounts(files) {
    const pending = files.slice(0, MEMBER_FETCH).filter(function(file) {
      return file && !(Number(file.members) > 0);
    });
    if (!pending.length) return files;
    await Promise.all(
      pending.map(function(file) {
        return getDocMemberCount(file.id).then(function(n) {
          if (n > 0) file.members = n;
        }).catch(function() {
        });
      })
    );
    return files;
  }
  function makeFetchKey(title, meta) {
    return `${currentDocId()}	${title}	${meta?.name || ""}	${meta?.creatorVid || ""}	${isOwnDoc(meta) ? 1 : 0}`;
  }
  function itemsSig(items) {
    return (items || []).map(function(item) {
      return `${item.id}	${item.title}	${item.kind}	${item.createdAt || 0}	${item.members || 0}`;
    }).join("|");
  }
  function paint() {
    const root = document.getElementById(WANDER_ROOT_ID);
    const sig = `${ui4.loading ? 1 : 0}#${itemsSig(ui4.items)}`;
    if (sig === ui4.paintSig && root?.childElementCount) {
      syncFooterEmpty();
      placeFooter();
      return;
    }
    ui4.paintSig = sig;
    paintWanderCol(ui4.items, { loading: ui4.loading, onRefresh });
  }
  function resetState() {
    ui4.refs = [];
    ui4.docMeta = null;
    ui4.docTitle = "";
    ui4.keywordPool = [];
    ui4.creatorPool = [];
    ui4.items = [];
    ui4.loading = false;
    ui4.fetched = false;
    ui4.fetchKey = "";
    ui4.refsKey = "";
    ui4.paintSig = "";
  }
  function rollFromPools() {
    ui4.items = mergePicks(ui4.keywordPool, ui4.creatorPool, refreshPools(ui4.refs));
    ui4.paintSig = "";
  }
  async function loadPools() {
    const seq = ++ui4.seq;
    const title = ui4.docTitle;
    const meta = ui4.docMeta;
    ui4.loading = true;
    ui4.fetched = false;
    paint();
    try {
      const keywords = pickKeywords(title);
      const exclude = buildExclude(ui4.refs);
      const wantCreator = Boolean(meta && (meta.creatorVid || meta.name || meta.displayName));
      const parts = await Promise.all([
        keywords.length ? searchByKeywords(keywords) : Promise.resolve([]),
        wantCreator ? searchCreatorDocs(meta) : Promise.resolve([])
      ]);
      if (seq !== ui4.seq) return;
      if (wantCreator && parts[1].length) {
        await hydrateDocStats(parts[1]);
        await fillMemberCounts(parts[1]);
      }
      if (seq !== ui4.seq) return;
      ui4.keywordPool = filterPool(parts[0], exclude).slice(0, KEYWORD_POOL);
      ui4.creatorPool = rankCreator(filterPool(parts[1], exclude));
      ui4.items = mergePicks(ui4.keywordPool, ui4.creatorPool, exclude);
      await hydrateDocStats(ui4.items);
      if (seq !== ui4.seq) return;
      ui4.loading = false;
      ui4.fetched = true;
      ui4.paintSig = "";
      paint();
      await enrichDocStats(ui4.items);
      if (seq !== ui4.seq) return;
      ui4.paintSig = "";
      paint();
    } catch {
      if (seq !== ui4.seq) return;
      ui4.keywordPool = [];
      ui4.creatorPool = [];
      ui4.items = [];
      ui4.loading = false;
      ui4.fetched = true;
      ui4.paintSig = "";
      paint();
    }
  }
  function onRefresh() {
    if (ui4.loading) return;
    if (ui4.keywordPool.length || ui4.creatorPool.length) {
      rollFromPools();
      hydrateDocStats(ui4.items).then(function() {
        ui4.paintSig = "";
        paint();
      });
      return;
    }
    loadPools();
  }
  function unmountWander() {
    ui4.seq += 1;
    resetState();
    const root = document.getElementById(WANDER_ROOT_ID);
    if (root) {
      root.replaceChildren();
      root.setAttribute("data-empty", "1");
      root.removeAttribute("aria-busy");
    }
    syncFooterEmpty();
  }
  function mountWander(opts) {
    const refs = Array.isArray(opts?.refs) ? opts.refs : [];
    const docMeta = opts?.docMeta && typeof opts.docMeta === "object" ? opts.docMeta : null;
    const docTitle = cleanTitle(opts?.docTitle) || readDomTitle();
    ui4.refs = refs;
    ui4.docMeta = docMeta;
    ui4.docTitle = docTitle;
    ensureFooter();
    const nextKey = makeFetchKey(docTitle, docMeta);
    const nextRefs = refsKeyOf(refs);
    if (ui4.loading && ui4.fetchKey === nextKey) {
      paint();
      return;
    }
    if (ui4.fetched && ui4.fetchKey === nextKey) {
      if (ui4.refsKey !== nextRefs) {
        ui4.refsKey = nextRefs;
        const exclude = refreshPools(refs);
        ui4.items = filterPool(ui4.items, exclude);
        if (ui4.items.length < PICK_TOTAL && (ui4.keywordPool.length || ui4.creatorPool.length)) {
          ui4.items = mergePicks(ui4.keywordPool, ui4.creatorPool, exclude);
        }
        ui4.paintSig = "";
      }
      paint();
      return;
    }
    ui4.fetchKey = nextKey;
    ui4.refsKey = nextRefs;
    loadPools();
  }

  // src/content.js
  var features = { ...DEFAULT_FEATURES };
  var last = {
    viewers: [],
    total: 0,
    refs: [],
    docMeta: null,
    docTitle: ""
  };
  var contentReadyFor = "";
  var lastPageKey = "";
  var applyRetryTimer = 0;
  var lastWebLayoutSent = null;
  function syncWebLayout() {
    const enabled = features.webLayout !== false;
    if (enabled === lastWebLayoutSent) return;
    lastWebLayoutSent = enabled;
    document.dispatchEvent(
      new CustomEvent(WEB_LAYOUT_EVENT, {
        bubbles: true,
        detail: { source: MSG_SOURCE, enabled }
      })
    );
  }
  function pageContentReady() {
    const id = currentPageKey();
    if (contentReadyFor && contentReadyFor !== id) contentReadyFor = "";
    if (contentReadyFor && contentReadyFor === id) return true;
    if (!footerLayoutReady()) return false;
    contentReadyFor = id;
    return true;
  }
  function apply() {
    if (!extensionAlive()) return;
    const page = currentPageKey();
    if (lastPageKey && lastPageKey !== page) {
      contentReadyFor = "";
      resetFooterGate();
      window.clearTimeout(applyRetryTimer);
      applyRetryTimer = 0;
    }
    lastPageKey = page;
    if (isHomePage()) {
      unmountViewers();
      unmountRefs();
      unmountWander();
      unmountDocMeta();
      unmountToolbar();
      if (features.search !== false) mountSearch();
      else unmountSearch();
      return;
    }
    if (features.create !== false && isRefDocsPage()) {
      renderToolbar();
    } else {
      unmountToolbar();
    }
    if (features.search !== false && isDocDetailPage()) {
      mountSearch();
    } else {
      unmountSearch();
    }
    if (features.viewers !== false) {
      renderViewers(last.viewers, last.total);
    } else {
      unmountViewers();
    }
    const onDoc = isRefDocsPage() || isDocDetailPage();
    const hideBox = shouldHideDocFooter(last.docMeta) || isFooterDismissed();
    const footerReady = onDoc && !hideBox && pageContentReady();
    if (footerReady) {
      mountWander({
        refs: last.refs,
        docMeta: last.docMeta,
        docTitle: last.docTitle
      });
    } else if (!onDoc || hideBox) {
      unmountWander();
    }
    if (features.refs !== false && isRefDocsPage() && footerReady) {
      renderRefDocs(last.refs);
    } else if (!isRefDocsPage() || hideBox) {
      unmountRefs();
      hideFooter();
    } else {
      const footer = document.getElementById(FOOTER_ROOT_ID);
      if (footer) {
        footer.setAttribute("data-pending", "1");
        placeFooter(footer);
      }
    }
    if (features.docMeta !== false && isDocDetailPage()) {
      renderDocMeta(last.docMeta);
    } else {
      unmountDocMeta();
    }
    if (isDocDetailPage() && !hideBox && (!document.getElementById(FOOTER_ROOT_ID) || footerPending())) {
      window.clearTimeout(applyRetryTimer);
      applyRetryTimer = window.setTimeout(function() {
        applyRetryTimer = 0;
        if (extensionAlive() && !shouldHideDocFooter(last.docMeta) && !isFooterDismissed() && (!document.getElementById(FOOTER_ROOT_ID) || footerPending())) {
          apply();
        }
      }, 120);
    }
  }
  function snapshotSig(detail) {
    return [
      Number(detail.total) || 0,
      (detail.viewers || []).map(function(item) {
        return `${item?.id || ""}	${item?.avatar || ""}`;
      }).join(","),
      (detail.refs || []).map(function(item) {
        return `${item?.id || ""}	${item?.title || ""}`;
      }).join("|"),
      detail.docMeta?.name || "",
      detail.docMeta?.isSelf ? "1" : "0",
      detail.docMeta?.createdAt || "",
      detail.docMeta?.updatedAt || "",
      detail.docTitle || "",
      detail.path || `${location.pathname}${location.search}`
    ].join("#");
  }
  var lastSnapshotSig = "";
  function onSnapshot(event) {
    const detail = event.detail;
    if (!detail || detail.source !== MSG_SOURCE) return;
    syncWebLayout();
    const next = {
      viewers: Array.isArray(detail.viewers) ? detail.viewers : [],
      total: Number(detail.total) || 0,
      refs: Array.isArray(detail.refs) ? detail.refs : [],
      docMeta: detail.docMeta && typeof detail.docMeta === "object" ? detail.docMeta : null,
      docTitle: String(detail.docTitle || "")
    };
    const sig = snapshotSig(next);
    last = next;
    const hideBox = shouldHideDocFooter(next.docMeta) || isFooterDismissed();
    if (sig === lastSnapshotSig) {
      if (hideBox || !document.getElementById(FOOTER_ROOT_ID)) {
        apply();
        return;
      }
      onLayout();
      return;
    }
    lastSnapshotSig = sig;
    apply();
  }
  function onLayout() {
    const page = currentPageKey();
    if (lastPageKey && lastPageKey !== page) {
      apply();
      return;
    }
    const footer = document.getElementById(FOOTER_ROOT_ID);
    if (footer) placeFooter(footer);
    else {
      const refs = document.getElementById(REFS_ROOT_ID);
      if (refs) placeRefsRoot(refs);
    }
    const meta = document.getElementById(DOC_META_ROOT_ID);
    if (meta) placeDocMeta(meta);
  }
  async function startApp() {
    features = await readFeatures();
    if (!extensionAlive()) return;
    apply();
    let watch = null;
    let watchTimer = 0;
    function mutationFromOurUi(mutation) {
      function ours(node) {
        if (!node) return true;
        const el = node.nodeType === 1 ? node : node.parentElement;
        if (!el || el.nodeType !== 1) return true;
        return Boolean(
          el.closest(
            `#${FOOTER_ROOT_ID}, #${FOOTER_SPACE_ID}, #${REFS_ROOT_ID}, #${WANDER_ROOT_ID}, #${SEARCH_ROOT_ID}, #${DOC_META_ROOT_ID}, #wxdoc-online-viewers, #wxdoc-titlebar-tools, #wxdoc-create-plus, #${SEARCH_PANEL_ID}, #${SEARCH_SETTINGS_ID}`
          )
        );
      }
      if (!ours(mutation.target)) return false;
      return [...mutation.addedNodes, ...mutation.removedNodes].every(ours);
    }
    function watchChrome() {
      if (watch) return;
      watch = new MutationObserver(function(mutations) {
        if (mutations.every(mutationFromOurUi)) return;
        window.clearTimeout(watchTimer);
        watchTimer = window.setTimeout(function() {
          if (!extensionAlive()) return;
          if (shouldHideDocFooter(last.docMeta) || isFooterDismissed() || !document.getElementById(FOOTER_ROOT_ID) || footerPending()) {
            apply();
            return;
          }
          onLayout();
        }, 80);
      });
      watch.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    }
    watchChrome();
    document.addEventListener(SNAPSHOT_EVENT, onSnapshot);
    document.dispatchEvent(new CustomEvent(HELLO_EVENT, { bubbles: true }));
    document.addEventListener("input", onLayout, true);
    window.addEventListener("resize", onLayout);
    window.addEventListener("scroll", onLayout, true);
    window.addEventListener("popstate", apply);
    try {
      chrome.storage.onChanged.addListener(async function(changes, area) {
        if (!extensionAlive() || area !== "sync" || !changes.features) return;
        features = await readFeatures();
        syncWebLayout();
        apply();
      });
    } catch {
    }
  }
  startApp();
})();
