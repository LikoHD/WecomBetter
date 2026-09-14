export const MSG_SOURCE = "wecom-better";

export const ROOT_ID = "wxdoc-online-viewers";
export const REFS_ROOT_ID = "wxdoc-ref-docs";
export const FOOTER_ROOT_ID = "wxdoc-doc-footer";
export const FOOTER_SPACE_ID = "wxdoc-doc-footer-space";
export const WANDER_ROOT_ID = "wxdoc-wander-docs";
export const SEARCH_ROOT_ID = "wxdoc-quick-search";
export const SEARCH_PANEL_ID = "wxdoc-quick-search-panel";
export const SEARCH_SETTINGS_ID = "wxdoc-quick-search-settings";
export const CREATE_PLUS_ID = "wxdoc-create-plus";
export const TITLEBAR_TOOLS_ID = "wxdoc-titlebar-tools";
export const DOC_META_ROOT_ID = "wxdoc-doc-meta";
export const FLOAT_LAYER_ID = "wxov-float-layer";
export const SILENT_PANEL_CLASS = "wxov-silent-panel";

export const MAX_VISIBLE = 8;
export const REFS_MAX_VISIBLE = 10;
export const POLL_MS = 1200;

export const DOC_HOST = "doc.weixin.qq.com";
export const DOC_PATH_RE =
  /^\/(doc|smartpage|sheet|smartsheet|slide|mind|flowchart)\/([^/?#]+)/i;

export const FEATURE_IDS = {
  viewers: "viewers",
  refs: "refs",
  search: "search",
  docMeta: "docMeta",
};

export const DEFAULT_FEATURES = {
  viewers: true,
  refs: true,
  search: true,
  docMeta: true,
};

export const SNAPSHOT_EVENT = "wecom-better:snapshot";
export const HELLO_EVENT = "wecom-better:hello";
export const CREATE_SMARTPAGE_EVENT = "wecom-better:create-smartpage";
export const CREATE_SMARTPAGE_MSG = "create-smartpage";

export function parseLabel(text) {
  const raw = String(text || "").replace(/\s+/g, " ").trim();
  if (!raw) return { id: "", name: "" };
  const matched = raw.match(/^(.+?)\((.+)\)$/);
  if (matched) return { id: matched[1].trim(), name: matched[2].trim() };
  return { id: raw, name: "" };
}

function normalizeUser(user) {
  if (!user || typeof user !== "object") return null;
  const parsed = parseLabel(user.name || "");
  const id = String(user.english_name || parsed.id || "").trim();
  if (!id) return null;
  const chinese = parsed.name && parsed.name !== id ? parsed.name : "";
  return {
    id,
    name: chinese,
    avatar: user.avatar || user.userPic || user.extern_avatar || "",
  };
}

export function displayName(viewer) {
  if (viewer.name && viewer.name !== viewer.id) return `${viewer.id}${viewer.name}`;
  return viewer.id;
}

export function asUserList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "object") return Object.values(value);
  return [];
}

export function usersFrom(value) {
  return asUserList(value).map(normalizeUser).filter(Boolean);
}

export function parseDocPath(pathname) {
  const matched = String(pathname || "").match(DOC_PATH_RE);
  return matched ? { kind: matched[1].toLowerCase(), id: matched[2] } : null;
}

export function isOwnDoc(meta) {
  if (!meta) return false;
  if (meta.isSelf) return true;
  const name = String(meta.name || "").trim().toLowerCase();
  const viewer = String(meta.viewerId || "").trim().toLowerCase();
  if (name && viewer && name === viewer) return true;
  const vid = String(meta.creatorVid || "").trim();
  const selfVid = String(meta.selfVid || "").trim();
  return Boolean(vid && selfVid && vid === selfVid);
}

export function parseDocUrl(url) {
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

export function isDocDetailPage(pathname = location.pathname) {
  const current = parseDocPath(pathname);
  return Boolean(current && (current.kind === "doc" || current.kind === "smartpage"));
}

export function isHomePage(pathname = location.pathname) {
  return /^\/home(?:\/|$)/i.test(pathname);
}

export function findHomeSearchAnchor() {
  const header = document.querySelector(".xd-web-header");
  if (!header) return null;
  return { host: header, before: null };
}

export function isRefDocsPage(pathname = location.pathname) {
  return isDocDetailPage(pathname);
}

export function findVisibleCollabButton() {
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

export function moveBefore(el, host, before) {
  if (!el || !host) return;
  if (el.parentElement === host && el.nextSibling === before) return;
  host.insertBefore(el, before);
}

export function findToolsAnchor() {
  const bar = document.getElementById("workbench-titlebar");
  if (!titlebarReady(bar)) return null;
  const before =
    asTitlebarChild(document.getElementById("headerbar-member"), bar) ||
    asTitlebarChild(document.getElementById(ROOT_ID), bar) ||
    asTitlebarChild(findVisibleCollabButton(), bar);
  if (before) return { host: bar, before };
  const pusher = [...bar.children].find((el) => /titlebar-pusher/.test(String(el.className)));
  if (pusher) return { host: bar, before: pusher.nextSibling };
  return { host: bar, before: null };
}

export function extensionAlive() {
  try {
    return Boolean(globalThis.chrome?.runtime?.id);
  } catch {
    return false;
  }
}

export async function storageGet(area, defaults) {
  if (!extensionAlive()) return { ...defaults };
  try {
    return await chrome.storage[area].get(defaults);
  } catch {
    return { ...defaults };
  }
}

export async function storageSet(area, values) {
  if (!extensionAlive()) return false;
  try {
    await chrome.storage[area].set(values);
    return true;
  } catch {
    return false;
  }
}

export async function copyText(text) {
  const value = String(text || "");
  if (!value) return false;

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      /* 无权限时走 textarea 回退 */
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

export function mergeFeatures(partial) {
  const extra = partial && typeof partial === "object" ? partial : {};
  return { ...DEFAULT_FEATURES, ...extra };
}

export async function readFeatures() {
  const stored = await storageGet("sync", { features: DEFAULT_FEATURES });
  return mergeFeatures(stored.features);
}

export async function writeFeatures(features) {
  const next = mergeFeatures(features);
  await storageSet("sync", { features: next });
  return next;
}
