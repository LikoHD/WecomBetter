import {
  CREATE_PLUS_ID,
  SEARCH_PANEL_ID,
  SEARCH_ROOT_ID,
  SEARCH_SETTINGS_ID,
  TITLEBAR_TOOLS_ID,
  extensionAlive,
  findHomeSearchAnchor,
  findToolsAnchor,
  isHomePage,
  moveBefore,
  parseDocPath,
  parseDocUrl,
  storageGet,
  storageSet,
} from "./shared.js";

const SEARCH_TYPES = ["8", "9", "101", "102", "103", "104", "105", "106", "107", "108"];
const HISTORY_KEY = "wecomBetterSearchHistory";
const SCOPE_KEY = "wecomBetterSearchScope";
const DEBOUNCE_MS = 200;
const LEAVE_CLOSE_MS = 160;
const KEYWORD_MAX = 64;
const FETCH_LIMIT = 30;
const SECTION_VISIBLE = 10;
const RECENT_LIMIT = 8;
const HISTORY_LIMIT = 3;
const DEFAULT_SCOPE = { title: true, body: true };

const SEARCH_ICON =
  '<svg class="wxqs-glyph" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" clip-rule="evenodd" d="M8.5 2a6.5 6.5 0 104.23 11.44l4.42 4.41a.5.5 0 00.7-.7l-4.41-4.42A6.5 6.5 0 008.5 2zM3 8.5a5.5 5.5 0 1111 0 5.5 5.5 0 01-11 0z"/></svg>';
const TIME_ICON =
  '<svg class="wxqs-glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M12.6 11.503l3.891 3.891-.848.849L11.4 12V6h1.2v5.503zM12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm0-1.2a8.8 8.8 0 100-17.6 8.8 8.8 0 000 17.6z" fill="currentColor" fill-rule="evenodd" fill-opacity=".9"/></svg>';
const CLEAR_ICON =
  '<svg class="wxqs-glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm0-1.2a8.8 8.8 0 100-17.6 8.8 8.8 0 000 17.6zm.849-8.8l3.11 3.111-.848.849L12 12.849l-3.111 3.11-.849-.848L11.151 12l-3.11-3.111.848-.849L12 11.151l3.111-3.11.849.848L12.849 12z" fill="currentColor" fill-rule="evenodd" fill-opacity=".9"/></svg>';
const MENU_ICON =
  '<svg class="wxqs-glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14v1.2H5V7zm0 4.4h14v1.2H5v-1.2zm0 4.4h14v1.2H5v-1.2z" fill="currentColor"/></svg>';

const FILE_ICONS = {
  smartpage:
    '<svg class="wxqs-file-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path fill="#3999DA" d="M4 5.35C4 4.6 4.6 4 5.35 4h9.3C15.4 4 16 4.6 16 5.35v9.4c0 .69-.56 1.25-1.25 1.25h-9.4C4.6 16 4 15.4 4 14.65v-9.3z"/><path fill="#5FB8F3" d="M12.15 0C12.9 0 13.5.6 13.5 1.35v13.4c0 .69.56 1.25 1.25 1.25H1.35C.6 16 0 15.4 0 14.65V1.35C0 .6.6 0 1.35 0h10.8z"/><path fill="#fff" d="M4.3 6.64a.2.2 0 01.4 0l.66 1.87c.02.06.07.1.13.13l1.87.67a.2.2 0 010 .38l-1.87.67a.2.2 0 00-.13.13l-.67 1.87a.2.2 0 01-.38 0l-.67-1.87a.2.2 0 00-.13.13l-1.87-.67a.2.2 0 010-.38l1.87-.67a.2.2 0 00.13-.13l.67-1.87z"/></svg>',
  doc:
    '<svg class="wxqs-file-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path fill="#2B7DE1" d="M3 1.75A1.75 1.75 0 014.75 0h5.09L13 3.2V14.25A1.75 1.75 0 0111.25 16h-6.5A1.75 1.75 0 013 14.25V1.75z"/><path fill="#7CB4F2" d="M9.7 0v2.4c0 .5.4.9.9.9H13L9.7 0z"/><path fill="#fff" d="M5 7h6v1.2H5V7zm0 2.3h6v1.2H5V9.3z"/></svg>',
  sheet:
    '<svg class="wxqs-file-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect width="16" height="16" rx="3" fill="#07C160"/><path fill="#fff" d="M3.2 3.2h9.6v1.4H3.2V3.2zm0 2.8h2.8v6.8H3.2V6zm4 0h5.6v2H7.2V6zm0 3.2h5.6v3.6H7.2V9.2z"/></svg>',
  smartsheet:
    '<svg class="wxqs-file-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect width="16" height="16" rx="3" fill="#00A5A8"/><path fill="#fff" d="M3 3.5h10v2H3v-2zm0 3.5h4.4v5.5H3V7zm5.6 0H13v2.4H8.6V7zm0 3.4H13V13H8.6v-2.6z"/></svg>',
  slide:
    '<svg class="wxqs-file-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect width="16" height="16" rx="3" fill="#F5A623"/><path fill="#fff" d="M3.2 3.4h9.6v7.2H3.2V3.4zm3.2 8.4h3.2V13H6.4v-1.2z"/></svg>',
  mind:
    '<svg class="wxqs-file-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect width="16" height="16" rx="3" fill="#8B5CF6"/><path fill="#fff" d="M7.2 3.2h1.6v4.1h3.4v1.4H8.8v4.1H7.2V8.7H3.8V7.3h3.4V3.2z"/></svg>',
  flowchart:
    '<svg class="wxqs-file-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect width="16" height="16" rx="3" fill="#6366F1"/><path fill="#fff" d="M5.2 3.2h5.6v2.4H5.2V3.2zm0 3.6h2.4v2.4H5.2V6.8zm3.2 0h2.4v2.4H8.4V6.8zM5.2 10.4h5.6v2.4H5.2v-2.4z"/></svg>',
  collect:
    '<svg class="wxqs-file-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect width="16" height="16" rx="3" fill="#267EF0"/><path fill="#fff" d="M4 4h8v1.3H4V4zm0 2.5h8v1.3H4V6.5zm0 2.5h5.2V10.3H4V9z"/></svg>',
  pdf:
    '<svg class="wxqs-file-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path fill="#E54545" d="M3 1.75A1.75 1.75 0 014.75 0h5.09L13 3.2V14.25A1.75 1.75 0 0111.25 16h-6.5A1.75 1.75 0 013 14.25V1.75z"/><path fill="#F28B82" d="M9.7 0v2.4c0 .5.4.9.9.9H13L9.7 0z"/><path fill="#fff" d="M5.1 8.2h1.3c.9 0 1.5.5 1.5 1.3 0 .8-.6 1.3-1.5 1.3H5.8V12H5.1V8.2zm.7 1.9h.5c.4 0 .7-.2.7-.6s-.3-.6-.7-.6h-.5v1.2zM8.6 8.2h1.4c1.1 0 1.8.7 1.8 1.9s-.7 1.9-1.8 1.9H8.6V8.2zm.7 3.1h.6c.6 0 1-.4 1-1.2s-.4-1.2-1-1.2h-.6v2.4z"/></svg>',
};

const FILE_TYPE_KIND = {
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
  108: "smartpage",
};

const ui = {
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
  error: "",
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
    if (Array.isArray(value)) value.forEach(function (item) {
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
    body,
  });
  if (!res.ok) throw new Error(`cgi ${res.status}`);
  return res.json();
}

export function postForm(path, fields) {
  return cgiPost(path, encodeForm(fields), "application/x-www-form-urlencoded");
}

export function postJson(path, fields) {
  return cgiPost(path, JSON.stringify(fields || {}), "application/json;charset=utf-8");
}

export function asMs(value) {
  const n = Number(value) || 0;
  if (!n) return 0;
  return n > 1e12 ? n : n * 1000;
}

export function formatDocDate(ts) {
  const ms = asMs(ts);
  if (!ms) return "";
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}/${m}/${d}`;
}

const MEMBER_COUNT_KEYS = [
  "member_cnt",
  "memberCnt",
  "member_count",
  "memberCount",
  "auth_count",
  "auth_cnt",
  "auth_num",
  "member_num",
  "acl_count",
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

const STATS_KEY = "wecomBetterDocStats";
const MEMBER_TTL_MS = 3 * 24 * 60 * 60 * 1000;
const STATS_MAX = 2000;
const memberMemory = new Map();
let statsStore = null;
let statsReady = null;
let statsWriteTimer = 0;

function isMembersFresh(entry) {
  const at = Number(entry?.membersAt) || 0;
  const n = Number(entry?.members) || 0;
  return n > 0 && at > 0 && Date.now() - at < MEMBER_TTL_MS;
}

async function loadStatsStore() {
  if (statsStore) return statsStore;
  if (!statsReady) {
    statsReady = storageGet("local", { [STATS_KEY]: {} }).then(function (stored) {
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
  const ranked = keys
    .map(function (id) {
      return { id, at: Number(store[id]?.membersAt) || 0, createdAt: Number(store[id]?.createdAt) || 0 };
    })
    .sort(function (a, b) {
      return a.at - b.at;
    });
  let extra = keys.length - STATS_MAX;
  ranked.forEach(function (row) {
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
  statsWriteTimer = window.setTimeout(function () {
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

export function normalizeFile(file) {
  if (!file || typeof file !== "object") return null;
  if (file.file_status != null && Number(file.file_status) !== 1) return null;
  const url = String(file.doc_url || "").trim();
  if (!url) return null;
  const parsed = parseDocUrl(url);
  const kind =
    parsed?.kind ||
    (/\/forms\//i.test(url) ? "collect" : "") ||
    FILE_TYPE_KIND[Number(file.file_type)] ||
    "doc";
  const title = String(file.name || "")
    .replace(/[\u200b\u200c\u200d\u2060\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const snippet = stripHl(file.search_body_hl && file.search_body_hl[0]);
  return {
    id: String(file.doc_id || file.file_id || url),
    title: title || "未命名文档",
    url,
    kind,
    creator: String(file.creater_name || file.update_name || "").trim(),
    creatorVid: String(file.creater_vid || file.s_creater_vid || "").trim(),
    time: asMs(file.open_time || file.mtime || file.ctime),
    createdAt: asMs(file.ctime || file.create_time || file.createTime),
    snippet,
    members: pickMemberCount(file),
    viewing: readViewing(file),
  };
}

function stripHl(html) {
  return String(html || "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function currentDocId() {
  return parseDocPath(location.pathname)?.id || "";
}

export function takeFiles(list, limit) {
  const self = currentDocId();
  const seen = new Set();
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

export async function searchDocs(keyword, func, extra) {
  const data = await postForm("/diskfile/search", {
    func: String(func),
    or_text_match: keyword,
    sync_key: "",
    limit: String(FETCH_LIMIT),
    hl_fragment_len: "20",
    and_file_type: SEARCH_TYPES,
    ...(extra && typeof extra === "object" ? extra : {}),
  });
  if (!requestOk(data)) throw new Error(data?.head?.msg || "search failed");
  return takeFiles(unwrapBody(data).files, FETCH_LIMIT);
}

async function postDocMemberMgr(docId, func, pick) {
  const id = String(docId || "").trim();
  if (!id) return null;
  const tries = [
    function () {
      return postJson("/wedoc/doc_member_mgr", { docid: id, func });
    },
    function () {
      return postJson("/wedoc/doc_member_mgr", { doc_id: id, func });
    },
    function () {
      return postForm("/wedoc/doc_member_mgr", { docid: id, func: String(func) });
    },
  ];
  for (let i = 0; i < tries.length; i += 1) {
    try {
      const data = await tries[i]();
      if (!requestOk(data)) continue;
      const hit = pick(data);
      if (hit) return hit;
    } catch {
      /* 下一组入参 */
    }
  }
  return null;
}

async function fetchMemberCount(docId) {
  return (await postDocMemberMgr(docId, 6, readMemberCnt)) || 0;
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

export async function fetchCreatorAvatar(docId, creatorVid, englishName) {
  const vid = String(creatorVid || "").trim();
  const name = String(englishName || "").trim().toLowerCase();
  const image = await postDocMemberMgr(docId, 1, function (data) {
    const list = memberList(data);
    if (!list.length) return "";
    const hit =
      list.find(function (item) {
        return vid && String(item?.vid || "") === vid;
      }) ||
      list.find(function (item) {
        return name && String(item?.english_name || "").toLowerCase() === name;
      }) ||
      list.find(function (item) {
        return name && String(item?.name || "").toLowerCase().startsWith(`${name}(`);
      });
    return String(hit?.image || hit?.avatar || hit?.userPic || "").trim();
  });
  return image || "";
}

export async function getDocMemberCount(docId) {
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
      membersAt: Date.now(),
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

export async function getDocCreateTime(docId) {
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
    info.create_time ||
      info.ctime ||
      info.createTime ||
      info.created_at ||
      body.create_time
  );
}

export async function batchGetDocInfo(docIds) {
  const ids = [...new Set((docIds || []).map(function (id) {
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

export async function hydrateDocStats(items) {
  const store = await loadStatsStore();
  let changed = false;
  (items || []).forEach(function (item) {
    hydrateItem(item, store);
    if (rememberItem(item, store)) changed = true;
  });
  if (changed) scheduleStatsWrite();
  return items;
}

export async function enrichDocStats(items) {
  const list = (items || []).filter(Boolean);
  const store = await loadStatsStore();
  list.forEach(function (item) {
    hydrateItem(item, store);
  });
  const missingCreate = list.filter(function (item) {
    return item.id && !item.createdAt;
  });
  if (missingCreate.length) {
    const infos = await batchGetDocInfo(
      missingCreate.map(function (item) {
        return item.id;
      })
    ).catch(function () {
      return [];
    });
    const byId = new Map();
    infos.forEach(function (raw) {
      const id = String(raw?.doc_id || raw?.id || raw?.docid || "").trim();
      if (id) byId.set(id, raw);
    });
    missingCreate.forEach(function (item) {
      const raw = byId.get(item.id);
      if (raw) applyInfoFields(item, raw);
    });
    const still = missingCreate.filter(function (item) {
      return !item.createdAt;
    });
    await Promise.all(
      still.map(function (item) {
        return getDocCreateTime(item.id)
          .then(function (ts) {
            if (ts) item.createdAt = ts;
          })
          .catch(function () {});
      })
    );
  }
  await Promise.all(
    list.map(function (item) {
      if (!item.id || Number(item.members) > 0) return Promise.resolve();
      return getDocMemberCount(item.id)
        .then(function (n) {
          if (n > 0) item.members = n;
        })
        .catch(function () {});
    })
  );
  let changed = false;
  list.forEach(function (item) {
    if (rememberItem(item, store)) changed = true;
  });
  if (changed) scheduleStatsWrite();
  return list;
}

function normalizeScope(raw) {
  const next = {
    title: raw?.title !== false,
    body: raw?.body !== false,
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
  return Array.isArray(list)
    ? list
        .map((item) => String(item || "").trim())
        .filter(Boolean)
        .slice(0, HISTORY_LIMIT)
    : [];
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
    node &&
      (ui.root?.contains(node) || ui.panel?.contains(node) || ui.settings?.contains(node))
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
  const ms = ts > 1e12 ? ts : ts * 1000;
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
  ui.panel.querySelectorAll("[data-wxqs-index]").forEach(function (el) {
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
  foot.textContent = ui.keyword ? `在网页中搜索「${ui.keyword}」` : "在网页中搜索全部文档";
  row.appendChild(foot);

  const scope = document.createElement("button");
  scope.type = "button";
  scope.className = "wxqs-scope";
  scope.setAttribute("aria-label", "搜索范围设置");
  scope.setAttribute("aria-expanded", ui.settingsOpen ? "true" : "false");
  scope.innerHTML = MENU_ICON;
  scope.addEventListener("click", function (event) {
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
    const snippet = item.group === "按正文搜索" ? item.snippet : "";
    const meta = snippet || [item.creator, formatTime(item.time)].filter(Boolean).join(" · ");
    if (meta) {
      const sub = document.createElement("span");
      sub.className = "wxqs-item-meta";
      if (snippet) appendHighlighted(sub, snippet, ui.keyword);
      else sub.textContent = meta;
      main.appendChild(sub);
    }
  }
  row.appendChild(main);
  row.addEventListener("mouseenter", function () {
    setActive(index);
  });
  row.addEventListener("click", function (event) {
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
  head.textContent = `${label}（${files.length}）`;
  box.appendChild(head);
  const visible = expanded ? files : files.slice(0, SECTION_VISIBLE);
  visible.forEach(function (file) {
    const item = { ...file, group: label };
    box.appendChild(makeRow(item, items.length));
    items.push(item);
  });
  if (!expanded && files.length > SECTION_VISIBLE) {
    const more = document.createElement("button");
    more.type = "button";
    more.className = "wxqs-more";
    more.textContent = `展开全部（还有 ${files.length - SECTION_VISIBLE} 篇）`;
    more.addEventListener("click", function (event) {
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
    empty.textContent = "搜索中…";
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
      empty.textContent = "没有找到相关文档";
      box.appendChild(empty);
    } else {
      if (ui.scope.title) {
        appendSection(box, items, "按文档名搜索", ui.titleFiles, ui.expandedTitle, function () {
          ui.expandedTitle = true;
          renderPanel();
        });
      }
      if (ui.scope.body) {
        appendSection(box, items, "按正文搜索", ui.bodyFiles, ui.expandedBody, function () {
          ui.expandedBody = true;
          renderPanel();
        });
      }
      if (ui.loading) {
        const empty = document.createElement("div");
        empty.className = "wxqs-status";
        empty.textContent = "搜索中…";
        box.appendChild(empty);
      }
    }
  } else if (!ui.items.length) {
    const empty = document.createElement("div");
    empty.className = "wxqs-status";
    empty.textContent = "暂无最近浏览";
    box.appendChild(empty);
  } else {
    let lastGroup = "";
    ui.items.forEach(function (item, index) {
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
  title.textContent = "搜索范围";
  card.appendChild(title);

  [
    { key: "title", label: "按文档名搜索" },
    { key: "body", label: "按正文搜索" },
  ].forEach(function (option) {
    const row = document.createElement("label");
    row.className = "wxqs-settings-row";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = ui.scope[option.key] !== false;
    input.addEventListener("change", async function () {
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
      ui.recent ? Promise.resolve(ui.recent) : recentDocs(),
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
        group: "搜索历史",
      })),
      ...recent.map((file) => ({ ...file, group: "最近浏览" })),
    ];
    ui.items = items;
    ui.loading = false;
    ui.active = items.length ? 0 : -1;
    renderPanel();
  } catch {
    if (seq !== ui.seq || ui.keyword) return;
    ui.loading = false;
    ui.error = "最近浏览加载失败";
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
        searchDocs(keyword, 5).then(function (files) {
          return { type: "title", files };
        })
      );
    }
    if (ui.scope.body) {
      tasks.push(
        searchDocs(keyword, 6).then(function (files) {
          return { type: "body", files };
        })
      );
    }
    const parts = await Promise.all(tasks);
    if (seq !== ui.seq) return;
    const title = parts.find((part) => part.type === "title")?.files || [];
    const titleIds = new Set(title.map((file) => file.id));
    const body = (parts.find((part) => part.type === "body")?.files || []).filter(
      function (file) {
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
    ui.error = "搜索失败，请稍后重试";
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
  ui.debounce = window.setTimeout(function () {
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
  input.addEventListener("focus", function () {
    const next = input.value.trim().slice(0, KEYWORD_MAX);
    scheduleQuery(next);
  });
  input.addEventListener("input", function () {
    scheduleQuery(input.value.trim().slice(0, KEYWORD_MAX));
  });
  input.addEventListener("keydown", onKeyDown);
  clear.addEventListener("mousedown", function (event) {
    event.preventDefault();
  });
  clear.addEventListener("click", function () {
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
    panel.addEventListener("mousedown", function (event) {
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
    settings.addEventListener("mousedown", function (event) {
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
    root.innerHTML =
      `<div class="wxqs-field">` +
      `${SEARCH_ICON}` +
      `<input class="wxqs-input" type="search" maxlength="${KEYWORD_MAX}" placeholder="搜索" autocomplete="off" spellcheck="false" enterkeyhint="search" />` +
      `<button class="wxqs-clear" type="button" hidden aria-label="清除">${CLEAR_ICON}</button>` +
      `</div>`;
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

export function unmountSearch() {
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

export function mountSearch() {
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
