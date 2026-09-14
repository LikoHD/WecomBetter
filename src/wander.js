import { ensureFooter, paintWanderCol, placeFooter, syncFooterEmpty } from "./refs.js";
import { currentDocId, enrichDocStats, getDocMemberCount, hydrateDocStats, searchDocs } from "./search.js";
import { FOOTER_ROOT_ID, FOOTER_SPACE_ID, REFS_ROOT_ID, WANDER_ROOT_ID, parseDocUrl } from "./shared.js";

const KEYWORD_POOL = 15;
const KEYWORD_COUNT_MIN = 2;
const KEYWORD_COUNT_MAX = 3;
const PICK_EACH = 3;
const PICK_TOTAL = 6;
const CREATOR_TOP = 10;
const MEMBER_FETCH = 15;
const STOPWORDS = new Set([
  "的",
  "了",
  "和",
  "与",
  "及",
  "或",
  "在",
  "是",
  "对",
  "为",
  "等",
  "关于",
  "以及",
  "文档",
  "文件",
  "方案",
  "总结",
  "记录",
  "说明",
  "介绍",
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
  "版",
  "终稿",
  "草稿",
]);

const ui = {
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
  paintSig: "",
};

function cleanTitle(value) {
  return String(value || "")
    .replace(/[\u200b\u200c\u200d\u2060\ufeff]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripSiteSuffix(title) {
  return cleanTitle(title)
    .replace(
      /\s*[-–—_|]\s*(腾讯文档|企业微信文档|企业微信|微信文档|WeCom|WeChat Work|Tencent Docs)\s*$/i,
      ""
    )
    .trim();
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
  while ((matched = re.exec(text))) {
    let token = matched[0];
    let changed = true;
    while (changed && token.length > 1) {
      changed = false;
      STOPWORDS.forEach(function (sw) {
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
  const seen = new Set();
  const scored = [];
  tokens.forEach(function (token, index) {
    const key = token.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    scored.push({
      token,
      index,
      score: scoreToken(token, index, tokens.length),
    });
  });
  scored.sort(function (a, b) {
    if (b.score !== a.score) return b.score - a.score;
    return a.index - b.index;
  });
  const hi = Math.min(KEYWORD_COUNT_MAX, scored.length);
  const n = Math.max(Math.min(KEYWORD_COUNT_MIN, hi), hi >= 1 ? Math.min(hi, KEYWORD_COUNT_MAX) : 0);
  return scored.slice(0, n).map(function (item) {
    return item.token;
  });
}

function refsKeyOf(refs) {
  return (refs || [])
    .map(function (item) {
      return `${item?.id || ""}\t${item?.url || ""}`;
    })
    .join("|");
}

function currentDocKeys() {
  const set = new Set();
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
    /* 当前页地址异常时只靠 pathname */
  }
  return set;
}

function buildExclude(refs) {
  const set = currentDocKeys();
  (refs || []).forEach(function (item) {
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
  identityKeys(file).forEach(function (key) {
    if (key) seen.add(key);
  });
}

function takeFile(file, seen, exclude) {
  if (isExcluded(file, exclude)) return false;
  if (identityKeys(file).some(function (key) {
    return key && seen.has(key);
  })) return false;
  markSeen(seen, file);
  return true;
}

function filterPool(list, exclude) {
  const seen = new Set();
  return (list || []).filter(function (file) {
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
  return files
    .slice()
    .sort(function (a, b) {
      const am = Number(a.members) || 0;
      const bm = Number(b.members) || 0;
      if (bm !== am) return bm - am;
      return (Number(b.time) || 0) - (Number(a.time) || 0);
    })
    .slice(0, CREATOR_TOP);
}

function mergePicks(keywordPool, creatorPool, exclude) {
  const seen = new Set();
  const keywords = keywordPool || [];
  const creators = creatorPool || [];
  const picked = takeFrom(keywords, PICK_EACH, seen, exclude).concat(
    takeFrom(creators, PICK_EACH, seen, exclude)
  );
  return picked.concat(takeFrom(keywords.concat(creators), PICK_TOTAL - picked.length, seen, exclude));
}

function refreshPools(refs) {
  const exclude = buildExclude(refs);
  ui.keywordPool = filterPool(ui.keywordPool, exclude);
  ui.creatorPool = rankCreator(filterPool(ui.creatorPool, exclude));
  return exclude;
}

function isOwnDoc(meta) {
  if (!meta) return false;
  if (meta.isSelf) return true;
  const name = String(meta.name || "").trim().toLowerCase();
  const viewer = String(meta.viewerId || "").trim().toLowerCase();
  return Boolean(name && viewer && name === viewer);
}

function creatorQueries(meta) {
  const name = String(meta?.name || "").trim();
  const display = String(meta?.displayName || "").trim();
  const vid = String(meta?.creatorVid || "").trim();
  const viewer = String(meta?.viewerId || "").trim();
  const queries = [];
  if (display) queries.push(display);
  if (name && name !== display) queries.push(name);
  if (viewer && viewer !== name && viewer !== display) queries.push(viewer);
  if (!queries.length && vid) queries.push(vid);
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
  const merged = new Map();
  (lists || []).forEach(function (list, listIndex) {
    (list || []).forEach(function (file, fileIndex) {
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
  return [...merged.values()]
    .sort(function (a, b) {
      if (b.hits !== a.hits) return b.hits - a.hits;
      return a.rank - b.rank;
    })
    .map(function (item) {
      return item.file;
    });
}

async function searchByKeywords(keywords) {
  const queries = (keywords || []).map(function (item) {
    return String(item || "").trim();
  }).filter(Boolean);
  if (!queries.length) return [];
  const lists = await Promise.all(
    queries.map(function (keyword) {
      return safeSearch(keyword, 5);
    })
  );
  return mergeKeywordHits(lists);
}

async function searchCreatorDocs(meta) {
  const { queries, vid } = creatorQueries(meta);
  if (!queries.length && !vid) return [];
  let files = [];
  for (let i = 0; i < queries.length && !files.length; i += 1) {
    files = await safeSearch(queries[i], 7);
  }
  if (!files.length && vid) {
    files = await safeSearch(queries[0] || "", 7, { and_creater: [vid] });
  }
  if (!files.length && queries[0]) files = await safeSearch(queries[0], 5);
  return files.filter(function (file) {
    return !isSameAsCurrent(file) && creatorMatches(file, meta);
  });
}

async function fillMemberCounts(files) {
  const pending = files.slice(0, MEMBER_FETCH).filter(function (file) {
    return file && !(Number(file.members) > 0);
  });
  if (!pending.length) return files;
  await Promise.all(
    pending.map(function (file) {
      return getDocMemberCount(file.id)
        .then(function (n) {
          if (n > 0) file.members = n;
        })
        .catch(function () {});
    })
  );
  return files;
}

function makeFetchKey(title, meta) {
  return `${currentDocId()}\t${title}\t${meta?.name || ""}\t${meta?.creatorVid || ""}\t${isOwnDoc(meta) ? 1 : 0}`;
}

function itemsSig(items) {
  return (items || [])
    .map(function (item) {
      return `${item.id}\t${item.title}\t${item.kind}\t${item.createdAt || 0}\t${item.members || 0}`;
    })
    .join("|");
}

function paint() {
  const root = document.getElementById(WANDER_ROOT_ID);
  const sig = `${ui.loading ? 1 : 0}#${itemsSig(ui.items)}`;
  if (sig === ui.paintSig && root?.childElementCount) {
    syncFooterEmpty();
    placeFooter();
    return;
  }
  ui.paintSig = sig;
  paintWanderCol(ui.items, { loading: ui.loading, onRefresh });
}

function resetState() {
  ui.refs = [];
  ui.docMeta = null;
  ui.docTitle = "";
  ui.keywordPool = [];
  ui.creatorPool = [];
  ui.items = [];
  ui.loading = false;
  ui.fetched = false;
  ui.fetchKey = "";
  ui.refsKey = "";
  ui.paintSig = "";
}

function rollFromPools() {
  ui.items = mergePicks(ui.keywordPool, ui.creatorPool, refreshPools(ui.refs));
  ui.paintSig = "";
}

async function loadPools() {
  const seq = ++ui.seq;
  const title = ui.docTitle;
  const meta = ui.docMeta;
  ui.loading = true;
  ui.fetched = false;
  paint();
  try {
    const keywords = pickKeywords(title);
    const exclude = buildExclude(ui.refs);
    const wantCreator = Boolean(meta && (meta.name || meta.displayName || meta.creatorVid || meta.viewerId));
    const parts = await Promise.all([
      keywords.length ? searchByKeywords(keywords) : Promise.resolve([]),
      wantCreator ? searchCreatorDocs(meta) : Promise.resolve([]),
    ]);
    if (seq !== ui.seq) return;
    if (wantCreator && parts[1].length) {
      await hydrateDocStats(parts[1]);
      await fillMemberCounts(parts[1]);
    }
    if (seq !== ui.seq) return;
    ui.keywordPool = filterPool(parts[0], exclude).slice(0, KEYWORD_POOL);
    ui.creatorPool = rankCreator(filterPool(parts[1], exclude));
    ui.items = mergePicks(ui.keywordPool, ui.creatorPool, exclude);
    await hydrateDocStats(ui.items);
    if (seq !== ui.seq) return;
    ui.loading = false;
    ui.fetched = true;
    ui.paintSig = "";
    paint();
    await enrichDocStats(ui.items);
    if (seq !== ui.seq) return;
    ui.paintSig = "";
    paint();
  } catch {
    if (seq !== ui.seq) return;
    ui.keywordPool = [];
    ui.creatorPool = [];
    ui.items = [];
    ui.loading = false;
    ui.fetched = true;
    ui.paintSig = "";
    paint();
  }
}

function onRefresh() {
  if (ui.loading) return;
  if (ui.keywordPool.length || ui.creatorPool.length) {
    rollFromPools();
    hydrateDocStats(ui.items).then(function () {
      ui.paintSig = "";
      paint();
    });
    return;
  }
  loadPools();
}

export function unmountWander() {
  ui.seq += 1;
  resetState();
  const root = document.getElementById(WANDER_ROOT_ID);
  if (root) {
    root.replaceChildren();
    root.setAttribute("data-empty", "1");
    root.removeAttribute("aria-busy");
  }
  syncFooterEmpty();
}

export function mountWander(opts) {
  const refs = Array.isArray(opts?.refs) ? opts.refs : [];
  const docMeta = opts?.docMeta && typeof opts.docMeta === "object" ? opts.docMeta : null;
  const docTitle = cleanTitle(opts?.docTitle) || readDomTitle();
  ui.refs = refs;
  ui.docMeta = docMeta;
  ui.docTitle = docTitle;
  ensureFooter();

  const nextKey = makeFetchKey(docTitle, docMeta);
  const nextRefs = refsKeyOf(refs);
  if (ui.loading && ui.fetchKey === nextKey) {
    paint();
    return;
  }
  if (ui.fetched && ui.fetchKey === nextKey) {
    if (ui.refsKey !== nextRefs) {
      ui.refsKey = nextRefs;
      const exclude = refreshPools(refs);
      ui.items = filterPool(ui.items, exclude);
      if (ui.items.length < PICK_TOTAL && (ui.keywordPool.length || ui.creatorPool.length)) {
        ui.items = mergePicks(ui.keywordPool, ui.creatorPool, exclude);
      }
      ui.paintSig = "";
    }
    paint();
    return;
  }

  ui.fetchKey = nextKey;
  ui.refsKey = nextRefs;
  loadPools();
}
