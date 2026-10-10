(() => {
  // src/editing.js
  var EDIT_IDLE_MS = 500;
  function editorInput(target) {
    const el = target?.nodeType === 1 ? target : target?.parentElement;
    if (!el || el.closest?.("[id^='wxdoc-'], #wxov-float-layer")) return false;
    if (el.id === "melo-hidden-editor") return true;
    return Boolean(el.isContentEditable && el.closest?.("#root-editable, #sc-page-content, .surface"));
  }
  function watchEditing({ onIdle, onEdit } = {}) {
    let composing = false;
    let until = 0;
    let timer = 0;
    function scheduleIdle() {
      window.clearTimeout(timer);
      timer = 0;
      if (composing) return;
      timer = window.setTimeout(function() {
        timer = 0;
        if (composing) return;
        if (Date.now() < until) scheduleIdle();
        else onIdle?.();
      }, Math.max(0, until - Date.now()));
    }
    function onActivity(event) {
      if (!editorInput(event.target)) return;
      if (event.type === "keydown") {
        if (event.metaKey || event.ctrlKey || event.altKey) return;
        if (event.key?.length !== 1 && !["Backspace", "Delete", "Enter", "Tab"].includes(event.key)) return;
      }
      if (event.type === "compositionstart") composing = true;
      if (event.type === "compositionend" || event.type === "focusout") composing = false;
      until = Date.now() + EDIT_IDLE_MS;
      onEdit?.();
      scheduleIdle();
    }
    const events = ["keydown", "beforeinput", "input", "compositionstart", "compositionupdate", "compositionend", "focusout"];
    events.forEach((type) => document.addEventListener(type, onActivity, true));
    return {
      isEditing() {
        return composing || Date.now() < until;
      },
      dispose() {
        window.clearTimeout(timer);
        events.forEach((type) => document.removeEventListener(type, onActivity, true));
      }
    };
  }

  // src/shared.js
  var MSG_SOURCE = "wecom-better";
  var REFS_ROOT_ID = "wxdoc-ref-docs";
  var FOOTER_ROOT_ID = "wxdoc-doc-footer";
  var FOOTER_SPACE_ID = "wxdoc-doc-footer-space";
  var WANDER_ROOT_ID = "wxdoc-wander-docs";
  var SEARCH_ROOT_ID = "wxdoc-quick-search";
  var SEARCH_PANEL_ID = "wxdoc-quick-search-panel";
  var SEARCH_SETTINGS_ID = "wxdoc-quick-search-settings";
  var CREATE_PLUS_ID = "wxdoc-create-plus";
  var DOC_META_ROOT_ID = "wxdoc-doc-meta";
  var MENTION_ROOT_ID = "wxdoc-mention-docs";
  var SILENT_PANEL_CLASS = "wxov-silent-panel";
  var POLL_MS = 1200;
  var DOC_HOST = "doc.weixin.qq.com";
  var DOC_PATH_RE = /^\/(doc|smartpage|sheet|smartsheet|slide|mind|flowchart)\/([^/?#]+)/i;
  var SNAPSHOT_EVENT = "wecom-better:snapshot";
  var HELLO_EVENT = "wecom-better:hello";
  var WEB_LAYOUT_EVENT = "wecom-better:web-layout";
  var WEB_LAYOUT_TYPE = 8;
  var MENTION_EVENT = "wecom-better:mention";
  var INSERT_DOC_EVENT = "wecom-better:insert-doc";
  var PICK_MENTION_EVENT = "wecom-better:pick-mention";
  function parseLabel(text) {
    const raw = String(text || "").replace(/\s+/g, " ").trim();
    if (!raw) return { id: "", name: "" };
    const matched = raw.match(/^(.+?)\((.+)\)$/);
    if (matched) return { id: matched[1].trim(), name: matched[2].trim() };
    return { id: raw, name: "" };
  }
  function cleanText(value) {
    return String(value || "").replace(/[\u200b\u200c\u200d\u2060\ufeff]/g, "").replace(/\s+/g, " ").trim();
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
      avatar: user.avatar || user.userPic || user.extern_avatar || ""
    };
  }
  function asUserList(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (typeof value === "object") return Object.values(value);
    return [];
  }
  function usersFrom(value) {
    return asUserList(value).map(normalizeUser).filter(Boolean);
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
  function nativeMentionPanel() {
    const panels = document.querySelectorAll(".od_editor_atPopPanel");
    for (let i = 0; i < panels.length; i += 1) {
      const panel = panels[i];
      if (panel.querySelector(".od_editor_atPopPanel_item, .od_editor_atPopPanel_more")) return panel;
    }
    return panels[0] || null;
  }
  function findVisibleCollabButton() {
    const buttons = [...document.querySelectorAll(".ent-collab-users")];
    return buttons.find((el) => el.offsetParent !== null) || buttons[0] || null;
  }

  // src/page-bridge.js
  var primed = false;
  var tickTimer = 0;
  var hooked = false;
  var hookedEditor = false;
  var webLayoutEnabled = true;
  var webLayoutDocId = "";
  var webLayoutUntil = 0;
  var webLayoutEditedDocId = "";
  var editing = watchEditing({
    onIdle: schedulePublish,
    onEdit() {
      const path = parseDocPath(location.pathname);
      if (path?.kind !== "doc") return;
      webLayoutEditedDocId = path.id;
      webLayoutUntil = 0;
    }
  });
  var WEB_LAYOUT_WINDOW_MS = 8e3;
  var WEB_LAYOUT_SETTLE_MS = 2e3;
  function usersOrNull(value) {
    const mapped = usersFrom(value);
    return mapped.length ? mapped : null;
  }
  function collabService() {
    return window.__CollabPc?.collabService;
  }
  function collabProps() {
    return window.discussionExt?.launcher?.props;
  }
  function collectFromRuntime() {
    const service = collabService();
    if (service) {
      const fromService = typeof service.getViewingUsers === "function" ? service.getViewingUsers() : service.viewingUsers;
      const mapped = usersOrNull(fromService);
      if (mapped) return mapped;
    }
    const fromProps = usersOrNull(collabProps()?.viewingUsers);
    if (fromProps) return fromProps;
    return usersOrNull(window.discussionExtVeryFastViewingUsers);
  }
  function collectFromDom() {
    const list = document.querySelector(".collab-list");
    if (!list) return null;
    const viewers = [];
    let inViewing = false;
    for (const child of list.children) {
      if (child.classList.contains("collab-viewer-count")) {
        inViewing = /^\s*正在查看/.test(child.textContent || "");
        continue;
      }
      if (!inViewing || !child.classList.contains("collab-item")) continue;
      const label = child.querySelector(".name")?.textContent || child.textContent || "";
      const parsed = parseLabel(label.split("\n")[0]);
      if (!parsed.id) continue;
      viewers.push({
        id: parsed.id,
        name: parsed.name,
        avatar: child.querySelector("img.collab-icon")?.getAttribute("src") || ""
      });
    }
    return viewers;
  }
  function collectViewers() {
    return collectFromRuntime() || collectFromDom();
  }
  function cssCollabCount() {
    const header = document.querySelector("#headerbar-member");
    if (!header) return 0;
    const raw = getComputedStyle(header).getPropertyValue("--headerbarcollabcount");
    return Number(String(raw || "").replace(/['"]/g, "").trim()) || 0;
  }
  function titleCollabCount() {
    const title = document.querySelector(".member-header-title-inner");
    const matched = title && title.textContent.match(/(\d+)\s*$/);
    return matched ? Number(matched[1]) || 0 : 0;
  }
  function collectTotalCount(viewingCount) {
    const service = collabService();
    let total = 0;
    if (service) {
      if (typeof service.getCollabCount === "function") {
        total = Number(service.getCollabCount()) || 0;
      } else {
        total = Number(service.collabCount) || 0;
      }
    }
    const props = collabProps();
    if (!total && props) {
      total = Number(props.collabUserCount) || asUserList(props.collabUsers).length || 0;
    }
    if (!total) total = cssCollabCount();
    if (!total) total = titleCollabCount();
    return Math.max(total, viewingCount);
  }
  function hookRuntimeUpdates() {
    if (hooked) return;
    const service = collabService();
    if (!service || typeof service.addUpdateListener !== "function") return;
    hooked = true;
    service.addUpdateListener(schedulePublish);
  }
  function listenTarget(target, names, handler) {
    if (!target) return;
    names.forEach(function(name) {
      try {
        if (typeof target.on === "function") target.on(name, handler);
        else if (typeof target.addEventListener === "function") target.addEventListener(name, handler);
        else if (typeof target.addListener === "function") target.addListener(name, handler);
        else if (typeof target.addUpdateListener === "function") target.addUpdateListener(handler);
      } catch {
      }
    });
  }
  function hookEditorUpdates() {
    if (hookedEditor) return;
    const editor = window.pad?.editor;
    const xEditor = window.xEditor;
    if (!editor && !xEditor) return;
    hookedEditor = true;
    listenTarget(editor, ["change", "contentchange", "edit"], schedulePublish);
    listenTarget(editor?.layoutController, ["layout", "update", "change"], schedulePublish);
    listenTarget(editor?._layoutTypeManager, ["change", "layout", "update"], schedulePublish);
    listenTarget(xEditor, ["change", "dataChange", "transaction"], schedulePublish);
    listenTarget(xEditor?.dataCore, ["update", "change", "transaction"], schedulePublish);
  }
  function revealNativePanel() {
    document.documentElement.classList.remove(SILENT_PANEL_CLASS);
  }
  function bindSilentPanelReveal(btn) {
    if (!btn || btn.dataset.wxovReveal === "1") return;
    btn.dataset.wxovReveal = "1";
    btn.addEventListener(
      "click",
      function(event) {
        if (!document.documentElement.classList.contains(SILENT_PANEL_CLASS)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        revealNativePanel();
      },
      true
    );
  }
  function primeViewersIfNeeded() {
    const current = collectViewers();
    if (current && current.length) {
      primed = true;
      return;
    }
    if (primed) return;
    if (editing.isEditing()) {
      window.setTimeout(primeViewersIfNeeded, 600);
      return;
    }
    const btn = findVisibleCollabButton();
    if (!btn) return;
    primed = true;
    if (btn.classList.contains("active") || document.querySelector(".collab-list")) return;
    document.documentElement.classList.add(SILENT_PANEL_CLASS);
    bindSilentPanelReveal(btn);
    btn.click();
    window.setTimeout(function() {
      const loaded = collectViewers();
      publish();
      if (!loaded || !loaded.length) revealNativePanel();
    }, 600);
  }
  function cleanRefTitle(title) {
    const raw = cleanText(title);
    if (!raw || /^https?:\/\//i.test(raw)) return "";
    if (raw.length < 2) return "";
    if (/^[=+\-_|*•·@#/.\\]+$/.test(raw)) return "";
    return raw;
  }
  function addRefItem(bucket, title, url, self) {
    const parsed = parseDocUrl(url);
    if (!parsed || !self || parsed.id === self.id) return;
    if (parsed.id.length < 8) return;
    const raw = String(url || "").trim();
    const href = /^https?:\/\//i.test(raw) ? raw : raw.startsWith("//") ? `https:${raw}` : `https://doc.weixin.qq.com/${parsed.kind}/${parsed.id}`;
    const name = cleanRefTitle(title);
    const existing = bucket.get(parsed.id);
    if (existing) {
      if (name) existing.title = name;
      return;
    }
    bucket.set(parsed.id, {
      id: parsed.id,
      title: name || "\u672A\u547D\u540D\u6587\u6863",
      url: href,
      kind: parsed.kind
    });
  }
  function collectRefsFromSmartpagePool() {
    const pool = window.xEditor?.dataCore?.memoryCache?.globalAttribPool;
    if (!pool || !pool._numToAttrib) return [];
    const items = [];
    Object.values(pool._numToAttrib).forEach(function(pair) {
      if (!Array.isArray(pair) || pair.length < 2) return;
      const type = pair[0];
      const raw = pair[1];
      if (type !== "p" && type !== "t") return;
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return;
      }
      if (!Array.isArray(parsed) || !parsed[0]) return;
      items.push({ title: parsed[1], url: parsed[0] });
    });
    return items;
  }
  function takeDocUrl(value) {
    if (typeof value !== "string") return "";
    const trimmed = value.trim();
    if (!trimmed) return "";
    if (parseDocUrl(trimmed)) return trimmed;
    const matched = trimmed.match(
      /https?:\/\/doc\.weixin\.qq\.com\/(?:doc|smartpage|sheet|smartsheet|slide|mind|flowchart)\/[^\s"'<>\\]+/i
    );
    return matched ? matched[0].replace(/[),.;]+$/, "") : "";
  }
  function collectRefsFromMelo() {
    const layout = window.pad?.editor?.layoutController?.docBox;
    if (!layout) return [];
    const items = [];
    const seen = /* @__PURE__ */ new WeakSet();
    function walk(box) {
      if (!box || typeof box !== "object" || seen.has(box)) return;
      seen.add(box);
      if (box.subType === "HYPERLINK" && box.cacheFieldInfo) {
        const code = box.cacheFieldInfo.fieldCode;
        const result = box.cacheFieldInfo.fieldResult;
        const url = code && Array.isArray(code.instructions) ? code.instructions[0] : "";
        if (takeDocUrl(url)) items.push({ title: result && result.result, url });
      }
      if (Array.isArray(box.childBoxes)) box.childBoxes.forEach(walk);
    }
    walk(layout);
    return items;
  }
  var FIELD_BEGIN = "";
  var FIELD_SEP = "";
  var FIELD_END = "";
  var DOC_TEXT_STEP = 8e3;
  var DOC_TEXT_OVERLAP = 2500;
  function docTextPool() {
    const pool = window.pad?.editor?._state?._dataEngine?.dataStream?.textPool;
    if (!pool || typeof pool.size !== "function" || typeof pool.subText !== "function") return null;
    return pool;
  }
  function pushHyperlinkField(items, text, at) {
    if (at === 0 || text.charAt(at - 1) !== FIELD_BEGIN) return at === 0 ? "partial" : "skip";
    const rest = text.slice(at + "HYPERLINK ".length);
    const urlMatch = rest.match(/^["']?(https?:\/\/\S+?)["']?(?=\s)/i);
    if (!urlMatch || !takeDocUrl(urlMatch[1])) return "skip";
    const sepAt = rest.indexOf(FIELD_SEP);
    const endAt = sepAt >= 0 ? rest.indexOf(FIELD_END, sepAt) : -1;
    if (sepAt < 0 || endAt < 0) return "partial";
    items.push({
      title: rest.slice(sepAt + 1, endAt).replace(/[\u0000-\u001f]/g, ""),
      url: urlMatch[1]
    });
    return "ok";
  }
  function collectRefsFromDocText() {
    const pool = docTextPool();
    if (!pool) return [];
    const size = Number(pool.size()) || 0;
    if (size < 12) return [];
    const items = [];
    const marker = "HYPERLINK ";
    let pos = 0;
    while (pos < size) {
      const len = Math.min(DOC_TEXT_STEP + DOC_TEXT_OVERLAP, size - pos);
      const text = String(pool.subText(pos, len) || "");
      let from = 0;
      while (from < text.length) {
        const at = text.indexOf(marker, from);
        if (at < 0) break;
        const status = pushHyperlinkField(items, text, at);
        if (status === "partial" && pos + at > 0 && at < DOC_TEXT_STEP) {
          const retry = String(pool.subText(Math.max(0, pos + at - 1), 4e3) || "");
          const retryAt = retry.indexOf(marker);
          if (retryAt >= 0) pushHyperlinkField(items, retry, retryAt);
        }
        from = at + marker.length;
      }
      if (pos + DOC_TEXT_STEP >= size) break;
      pos += DOC_TEXT_STEP;
    }
    return items;
  }
  function readReactDocLink(el) {
    const key = Object.keys(el).find(function(name) {
      return name.startsWith("__reactInternalInstance") || name.startsWith("__reactFiber");
    });
    let fiber = key ? el[key] : null;
    for (let i = 0; fiber && i < 14; i += 1) {
      const props = fiber.memoizedProps || fiber.pendingProps;
      if (props?.docLink?.fileUrl) return props.docLink;
      fiber = fiber.return;
    }
    return null;
  }
  function inEditorSurface(el) {
    return Boolean(el.closest("#zoomable-container, #root-editable, #sc-page-content, #melo-container, .surface"));
  }
  function isOurOrChrome(el) {
    return Boolean(
      el.closest(
        `#${REFS_ROOT_ID}, #${FOOTER_ROOT_ID}, #${WANDER_ROOT_ID}, #${SEARCH_ROOT_ID}, #${DOC_META_ROOT_ID}, #${MENTION_ROOT_ID}, .xd-web-header, .collab-list`
      )
    );
  }
  function isMentionEl(el) {
    return Boolean(el.closest('[class*="mention"], [class*="Mention"], [class*="atuser"], [class*="AtUser"], [data-mention]'));
  }
  function collectRefsFromDom() {
    const items = [];
    document.querySelectorAll(".tdocs-doc-link-container, .tdocs-doc-link").forEach(function(el) {
      if (isOurOrChrome(el) || isMentionEl(el)) return;
      const link = readReactDocLink(el);
      items.push({
        title: link && link.fileName || el.textContent,
        url: link && link.fileUrl || el.getAttribute("href") || ""
      });
    });
    document.querySelectorAll("[data-link-href], .sc-inline-icon-link").forEach(function(el) {
      if (isOurOrChrome(el) || isMentionEl(el) || !inEditorSurface(el)) return;
      const url = el.getAttribute("data-link-href") || el.getAttribute("href") || "";
      if (!takeDocUrl(url)) return;
      items.push({ title: el.textContent, url });
    });
    document.querySelectorAll('a[href*="doc.weixin.qq.com"]').forEach(function(el) {
      if (isOurOrChrome(el) || isMentionEl(el) || !inEditorSurface(el)) return;
      const url = el.getAttribute("href") || "";
      if (!takeDocUrl(url)) return;
      items.push({ title: el.textContent, url });
    });
    return items;
  }
  function collectRefDocs() {
    const self = parseDocPath(location.pathname);
    if (!self) return [];
    const bucket = /* @__PURE__ */ new Map();
    function add(item) {
      addRefItem(bucket, item.title, item.url, self);
    }
    if (self.kind === "smartpage") {
      collectRefsFromSmartpagePool().forEach(add);
      collectRefsFromDom().forEach(add);
    } else if (self.kind === "doc") {
      collectRefsFromMelo().forEach(add);
      collectRefsFromDom().forEach(add);
      collectRefsFromDocText().forEach(add);
    }
    return [...bucket.values()].sort(function(a, b) {
      return String(a.id).localeCompare(String(b.id));
    });
  }
  function parseLooseTime(value) {
    if (value == null || value === "") return 0;
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return value > 1e12 ? value : value * 1e3;
    }
    const raw = String(value).trim();
    const matched = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (matched) {
      return new Date(Number(matched[1]), Number(matched[2]) - 1, Number(matched[3])).getTime();
    }
    const ts = Date.parse(raw);
    return Number.isNaN(ts) ? 0 : ts;
  }
  function readFileMeta(docId) {
    const store = window.FileMetaInfo;
    if (!store || !docId) return null;
    const boxed = store.infoSubjectMap?.[docId]?._value;
    if (boxed?.data?.creatorName || boxed?.data?.createTime) return boxed.data;
    if (boxed?.creatorName || boxed?.createTime) return boxed;
    try {
      const got = store.getFileInfo?.(docId);
      if (got && typeof got.then !== "function" && (got.creatorName || got.createTime)) return got;
      if (got && typeof got.then === "function") got.then(schedulePublish, function() {
      });
    } catch {
    }
    return null;
  }
  function currentUserInfo() {
    return window.pad?.clientVars?.userInfo || window.discussionExt?.launcher?.props?.userInfo || null;
  }
  function canvasLayoutType() {
    const editor = window.pad?.editor;
    const raw = editor?._layoutTypeManager?.currentLayoutType ?? editor?._docEnv?.layoutType ?? editor?.layoutController?.docEnv?.layoutType;
    const n = Number(raw);
    return Number.isFinite(n) ? n : 2;
  }
  function isWebLayoutNow() {
    const env = window.pad?.editor?.layoutController?.env;
    if (env && typeof env.isWebLayout === "boolean") return Boolean(env.isWebLayout);
    return canvasLayoutType() === WEB_LAYOUT_TYPE;
  }
  function clickWebLayoutMenu() {
    const item = findByExactText("Web\u7248\u5F0F");
    return item ? clickNative(item) : false;
  }
  function applyWebLayoutIfNeeded() {
    if (!webLayoutEnabled) return;
    const path = parseDocPath(location.pathname);
    if (!path || path.kind !== "doc") return;
    if (editing.isEditing() || webLayoutEditedDocId === path.id) return;
    if (webLayoutDocId !== path.id) {
      webLayoutDocId = path.id;
      webLayoutUntil = Date.now() + WEB_LAYOUT_WINDOW_MS;
    }
    if (!webLayoutUntil || Date.now() > webLayoutUntil) return;
    if (isWebLayoutNow()) {
      webLayoutUntil = Math.min(webLayoutUntil, Date.now() + WEB_LAYOUT_SETTLE_MS);
      return;
    }
    const ltm = window.pad?.editor?._layoutTypeManager;
    if (!ltm || typeof ltm.switchTo !== "function") return;
    try {
      if (Number(ltm.currentLayoutType) !== WEB_LAYOUT_TYPE) ltm.switchTo(WEB_LAYOUT_TYPE);
    } catch {
    }
    if (!isWebLayoutNow()) clickWebLayoutMenu();
  }
  function onWebLayoutMessage(event) {
    const detail = event.detail;
    if (!detail || detail.source !== MSG_SOURCE) return;
    const next = Boolean(detail.enabled);
    if (next === webLayoutEnabled) return;
    webLayoutEnabled = next;
    if (webLayoutEnabled) {
      webLayoutDocId = "";
      webLayoutEditedDocId = "";
      schedulePublish();
    }
  }
  function collectDocMeta(viewers) {
    const path = parseDocPath(location.pathname);
    if (!path || path.kind !== "doc" && path.kind !== "smartpage") return null;
    const file = readFileMeta(path.id);
    const cv = window.pad?.clientVars || {};
    const page = window.xEditor?.appStore?.pageStore;
    const self = currentUserInfo() || {};
    const parsed = parseLabel(file?.creatorName || "");
    const viewerId = String(self.englishName || self.english_name || self.vid || self.userId || "").trim();
    const creatorVid = String(
      file?.createrVid || file?.creatorVid || file?.creater_vid || file?.s_creater_vid || ""
    ).trim();
    const selfVid = String(self.vid || self.userId || "").trim();
    let name = parsed.id || "";
    const fromFlag = Boolean(file?.isSelf || cv.isCreator);
    if (fromFlag) {
      name = String(self.englishName || self.english_name || name).trim() || name;
    }
    const isSelf = fromFlag || isOwnDoc({ name, viewerId, creatorVid, selfVid });
    let avatar = "";
    if (isSelf) {
      avatar = String(self.userPic || self.avatar || cv.userPic || "").trim();
    }
    if (!avatar && name && Array.isArray(viewers)) {
      const hit = viewers.find((item) => item && (item.id === name || item.name === parsed.name));
      if (hit) avatar = hit.avatar || "";
    }
    const createdAt = parseLooseTime(cv.metaCreateTime) || parseLooseTime(cv.createdDate) || parseLooseTime(page?.createdAt) || parseLooseTime(file?.createTime);
    const updatedAt = parseLooseTime(cv.lastModifyTime) || parseLooseTime(page?.updatedAt) || createdAt;
    const displayName = String(parsed.name || "").trim();
    if (!name && !createdAt && !updatedAt) return null;
    return {
      name,
      displayName,
      avatar,
      createdAt,
      updatedAt,
      isSelf,
      viewerId,
      creatorVid
    };
  }
  function collectDocTitle() {
    const doc = document.getElementById("melo-doc-title");
    const fromDoc = cleanText(doc?.innerText || doc?.textContent);
    if (fromDoc) return fromDoc;
    const smart = document.querySelector(
      "#root-editable .sc-text-input-content, #sc-page-content .sc-text-input-content, #root-editable .textInput__pIjhc, #sc-page-content .textInput__pIjhc"
    );
    const fromSmart = cleanText(smart?.innerText || smart?.textContent);
    if (fromSmart) return fromSmart;
    return cleanText(document.title).replace(/\s*[-–—_|]\s*(腾讯文档|企业微信文档|企业微信|微信文档|WeCom|WeChat Work|Tencent Docs)\s*$/i, "").trim();
  }
  function publish() {
    if (editing.isEditing()) return;
    hookRuntimeUpdates();
    hookEditorUpdates();
    applyWebLayoutIfNeeded();
    const viewers = collectViewers() || [];
    const total = collectTotalCount(viewers.length);
    if (viewers.length) primed = true;
    document.dispatchEvent(
      new CustomEvent(SNAPSHOT_EVENT, {
        bubbles: true,
        detail: {
          source: MSG_SOURCE,
          viewers,
          total,
          refs: collectRefDocs(),
          docMeta: collectDocMeta(viewers),
          docTitle: collectDocTitle(),
          path: `${location.pathname}${location.search}`
        }
      })
    );
  }
  function schedulePublish() {
    if (tickTimer) return;
    tickTimer = window.setTimeout(function() {
      tickTimer = 0;
      publish();
    }, 80);
  }
  function textOf(el) {
    return String(el.innerText || el.textContent || "").replace(/\s+/g, "");
  }
  function isOurUi(el) {
    return Boolean(el.closest(`#${CREATE_PLUS_ID}, #wxdoc-titlebar-tools, #${REFS_ROOT_ID}, #wxdoc-online-viewers, #${SEARCH_ROOT_ID}, #${SEARCH_PANEL_ID}, #${SEARCH_SETTINGS_ID}, #${DOC_META_ROOT_ID}, #${MENTION_ROOT_ID}, #${FOOTER_ROOT_ID}, #${FOOTER_SPACE_ID}, #${WANDER_ROOT_ID}`));
  }
  function reactHandler(el) {
    const propsKey = Object.keys(el).find(function(name) {
      return name.startsWith("__reactProps");
    });
    const props = propsKey ? el[propsKey] : null;
    const direct = props && (props.onClick || props.onMouseDown || props.onPointerDown);
    if (typeof direct === "function") return direct;
    const fiberKey = Object.keys(el).find(function(name) {
      return name.startsWith("__reactFiber") || name.startsWith("__reactInternalInstance");
    });
    let fiber = fiberKey ? el[fiberKey] : null;
    for (let i = 0; fiber && i < 6; i += 1) {
      const memo = fiber.memoizedProps || fiber.pendingProps;
      const handler = memo && (memo.onClick || memo.onMouseDown || memo.onPointerDown);
      if (typeof handler === "function") return handler;
      fiber = fiber.return;
    }
    return null;
  }
  function clickNative(el) {
    if (!el) return false;
    const handler = reactHandler(el);
    if (handler) {
      try {
        handler({
          preventDefault() {
          },
          stopPropagation() {
          },
          target: el,
          currentTarget: el,
          button: 0,
          nativeEvent: { isTrusted: true, target: el }
        });
        return true;
      } catch {
      }
    }
    if (typeof el.click === "function") {
      el.click();
      return true;
    }
    return false;
  }
  function findByExactText(label) {
    const nodes = document.querySelectorAll("button, a, [role='menuitem'], [role='option'], [role='button'], li, div, span");
    let best = null;
    for (let i = 0; i < nodes.length; i += 1) {
      const el = nodes[i];
      if (isOurUi(el)) continue;
      if (textOf(el) !== label) continue;
      const clickable = el.closest("button, a, [role='menuitem'], [role='option'], [role='button']") || el;
      if (!best || clickable.innerText.length < best.innerText.length) best = clickable;
    }
    return best;
  }
  function hookHistory() {
    ["pushState", "replaceState"].forEach(function(name) {
      const raw = history[name];
      if (typeof raw !== "function" || raw.__wxwb) return;
      function wrapped() {
        const ret = raw.apply(this, arguments);
        schedulePublish();
        return ret;
      }
      wrapped.__wxwb = true;
      history[name] = wrapped;
    });
    window.addEventListener("popstate", schedulePublish);
  }
  var MENTION_QUERY_RE = /@([^\s@]{0,40})$/;
  var MELO_INPUT_ID = "melo-hidden-editor";
  var MELO_CARET_SETTLE_MS = 80;
  var mentionActive = false;
  var mentionTimer = 0;
  var savedMention = null;
  var forgetMentionTimer = 0;
  var meloCaretTimer = 0;
  var lastMeloCaret = "";
  function mentionFromText(node, offset) {
    if (!node || node.nodeType !== Node.TEXT_NODE) return null;
    const parent = node.parentElement;
    if (!parent || !editorLike(parent) || isOurUi(parent)) return null;
    const before = node.data.slice(Math.max(0, offset - 41), offset);
    const matched = before.match(MENTION_QUERY_RE);
    if (!matched) return null;
    const caretRange = document.createRange();
    caretRange.setStart(node, offset);
    caretRange.setEnd(node, offset);
    const caret = caretRange.getBoundingClientRect();
    return {
      query: matched[1],
      node,
      start: offset - matched[0].length,
      end: offset,
      caret: { top: caret.top, left: caret.left, bottom: caret.bottom }
    };
  }
  function readMentionFromSelection() {
    const sel = document.getSelection();
    if (!sel || !sel.isCollapsed || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType === Node.TEXT_NODE) return mentionFromText(node, range.startOffset);
    if (node.nodeType === 1 && range.startOffset > 0) {
      const prev = node.childNodes[range.startOffset - 1];
      if (prev && prev.nodeType === Node.TEXT_NODE) return mentionFromText(prev, prev.data.length);
    }
    return null;
  }
  function meloEditor() {
    const input = document.getElementById(MELO_INPUT_ID);
    if (!input || document.activeElement !== input) return null;
    const state = window.pad?.editor?._state;
    const pool = state?.getTextStream?.()?.textPool;
    if (!pool || typeof pool.subText !== "function" || typeof state.moveTo !== "function") return null;
    return { input, state, pool };
  }
  function meloCaret(input) {
    const caret = document.querySelector(".melo-caret")?.getBoundingClientRect();
    const box = caret && caret.height > 0 ? caret : input.getBoundingClientRect();
    return { top: box.top, left: box.left, bottom: box.bottom };
  }
  function readMentionFromMelo() {
    const melo = meloEditor();
    const range = melo?.state.selection?.gcpRange;
    if (!range || range.len !== 0) return null;
    const end = Number(range.gcpBegin) || 0;
    const before = String(melo.pool.subText(Math.max(0, end - 41), Math.min(41, end)) || "");
    const matched = before.split(/[\u0000-\u001f]/).pop().match(MENTION_QUERY_RE);
    if (!matched) return null;
    return {
      melo: true,
      query: matched[1],
      start: end - matched[0].length,
      end,
      text: matched[0],
      caret: meloCaret(melo.input)
    };
  }
  function readMention() {
    return readMentionFromSelection() || readMentionFromMelo();
  }
  function locateMelo(captured) {
    const melo = meloEditor();
    if (!melo || !captured?.text) return null;
    const from = Math.max(0, captured.start - 200);
    const size = Number(melo.pool.size?.()) || 0;
    const data = String(melo.pool.subText(from, Math.max(0, Math.min(400 + captured.text.length, size - from))) || "");
    const at = nearestIndex(data, captured.text, captured.start - from);
    if (at < 0) return null;
    return { melo, start: from + at, len: captured.text.length };
  }
  function selectMeloMention(captured) {
    const located = locateMelo(captured);
    if (located) located.melo.state.moveTo(located.start, located.len);
  }
  function dispatchMention(detail) {
    document.dispatchEvent(
      new CustomEvent(MENTION_EVENT, {
        bubbles: true,
        detail: { source: MSG_SOURCE, ...detail }
      })
    );
  }
  function captureOf(hit) {
    if (hit.melo) return { melo: true, start: hit.start, text: hit.text };
    return {
      node: hit.node,
      start: hit.start,
      text: hit.node.data.slice(hit.start, hit.end)
    };
  }
  function rememberMention(hit) {
    window.clearTimeout(forgetMentionTimer);
    if (!hit?.node && !hit?.melo) return;
    savedMention = captureOf(hit);
  }
  function mentionTarget() {
    const hit = readMention();
    if (hit) return captureOf(hit);
    if (savedMention?.melo || savedMention?.node?.isConnected) return savedMention;
    return null;
  }
  function focusSelectionHost() {
    const sel = document.getSelection();
    const node = sel && sel.anchorNode;
    const el = node && (node.nodeType === 1 ? node : node.parentElement);
    const host = el && el.closest("[contenteditable='true']");
    if (host && document.activeElement !== host) host.focus({ preventScroll: true });
  }
  function armMention(captured, collapseEnd) {
    const located = locateCaptured(captured);
    if (!located) return;
    selectLocated(located, collapseEnd);
    focusSelectionHost();
    selectLocated(located, collapseEnd);
  }
  function publishMention() {
    window.clearTimeout(meloCaretTimer);
    meloCaretTimer = 0;
    const hit = isDocDetailPage() ? readMention() : null;
    if (!hit) {
      lastMeloCaret = "";
      if (!mentionActive) return;
      mentionActive = false;
      dispatchMention({ active: false });
      forgetMentionTimer = window.setTimeout(function() {
        savedMention = null;
      }, 1e3);
      return;
    }
    rememberMention(hit);
    mentionActive = true;
    dispatchMention({
      active: true,
      query: hit.query,
      caret: hit.caret
    });
    if (!hit.melo) return;
    const caretKey = `${Math.round(hit.caret.left)},${Math.round(hit.caret.top)}`;
    if (caretKey === lastMeloCaret) return;
    lastMeloCaret = caretKey;
    meloCaretTimer = window.setTimeout(publishMention, MELO_CARET_SETTLE_MS);
  }
  function onPickMention(event) {
    const detail = event.detail;
    if (!detail || detail.source !== MSG_SOURCE) return;
    const panel = nativeMentionPanel();
    if (!panel) return;
    const kind = String(detail.kind || "");
    const label = String(detail.label || "").replace(/\s+/g, "");
    let target = null;
    if (kind === "more") target = panel.querySelector(".od_editor_atPopPanel_more");
    else {
      const items = panel.querySelectorAll(".od_editor_atPopPanel_item");
      for (let i = 0; i < items.length; i += 1) {
        const node = items[i].querySelector(".od_editor_atPopPanel_item_text") || items[i];
        const text = String(node.textContent || "").replace(/\s+/g, "");
        if (text === label) {
          target = items[i];
          break;
        }
      }
    }
    if (!target) return;
    const typed = mentionTarget();
    if (typed && !typed.melo) armMention(typed, true);
    panel.style.setProperty("opacity", "1", "important");
    panel.style.setProperty("pointer-events", "auto", "important");
    try {
      clickNative(target);
    } finally {
      panel.style.setProperty("opacity", "0", "important");
      panel.style.setProperty("pointer-events", "none", "important");
    }
    mentionActive = false;
    dispatchMention({ active: false });
    if (kind === "more" || !typed || typed.melo) return;
    window.setTimeout(function() {
      deleteCapturedMention(typed);
    }, 80);
  }
  function scheduleMention() {
    if (mentionTimer) return;
    mentionTimer = window.setTimeout(function() {
      mentionTimer = 0;
      publishMention();
    }, 16);
  }
  function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, function(ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }
  function nearestIndex(data, text, near) {
    let from = 0;
    let best = -1;
    while (from <= data.length) {
      const at = data.indexOf(text, from);
      if (at < 0) break;
      if (best < 0 || Math.abs(at - near) < Math.abs(best - near)) best = at;
      from = at + 1;
    }
    return best;
  }
  function locateCaptured(captured) {
    if (!captured?.node?.isConnected || !captured.text) return null;
    const best = nearestIndex(captured.node.data, captured.text, captured.start);
    if (best < 0) return null;
    return { node: captured.node, start: best, end: best + captured.text.length };
  }
  function selectLocated(located, collapseEnd) {
    const range = document.createRange();
    range.setStart(located.node, collapseEnd ? located.end : located.start);
    range.setEnd(located.node, located.end);
    const sel = document.getSelection();
    if (!sel) return null;
    sel.removeAllRanges();
    sel.addRange(range);
    return range;
  }
  function leftoverMention(captured) {
    const full = locateCaptured(captured);
    if (full) return full;
    const node = captured.node;
    if (!node?.isConnected || !captured.text) return null;
    const data = node.data;
    const start = captured.start;
    if (start < 0 || start >= data.length || data.charAt(start) !== "@") return null;
    let len = 0;
    const max = Math.min(captured.text.length, data.length - start);
    while (len < max && data.charAt(start + len) === captured.text.charAt(len)) len += 1;
    if (!len) return null;
    return { node, start, end: start + len };
  }
  function deleteCapturedMention(captured) {
    if (!captured) return false;
    for (let guard = 0; guard < captured.text.length + 2; guard += 1) {
      const located = leftoverMention(captured);
      if (!located) return true;
      const target = located.node.parentElement || document.body;
      selectLocated(located, false);
      let handled = false;
      try {
        handled = target.dispatchEvent(
          new InputEvent("beforeinput", {
            bubbles: true,
            cancelable: true,
            inputType: located.end - located.start > 1 ? "deleteByCut" : "deleteContentBackward"
          })
        ) === false;
      } catch {
        handled = false;
      }
      if (!leftoverMention(captured)) return true;
      if (!handled) {
        try {
          document.execCommand("delete");
        } catch {
        }
      }
      if (!leftoverMention(captured)) return true;
      try {
        document.execCommand("insertText", false, "");
      } catch {
      }
      if (!leftoverMention(captured)) return true;
      selectLocated(located, true);
      try {
        handled = target.dispatchEvent(
          new InputEvent("beforeinput", {
            bubbles: true,
            cancelable: true,
            inputType: "deleteContentBackward"
          })
        ) === false;
      } catch {
        handled = false;
      }
      if (!handled) {
        try {
          document.execCommand("delete");
        } catch {
        }
      }
      if (leftoverMention(captured)?.end === located.end && leftoverMention(captured)?.start === located.start) break;
    }
    const left = leftoverMention(captured);
    if (left) {
      const at = left.start;
      left.node.deleteData(left.start, left.end - left.start);
      selectLocated({ node: left.node, start: at, end: at }, true);
    }
    return !leftoverMention(captured);
  }
  function pasteTarget() {
    const sel = document.getSelection();
    const node = sel && sel.anchorNode;
    const el = node && (node.nodeType === 1 ? node : node.parentElement);
    if (el && editorLike(el)) return el;
    const active = document.activeElement;
    if (active && active.nodeType === 1 && editorLike(active)) return active;
    return el || document.body;
  }
  function editorLike(el) {
    return Boolean(
      el.closest("#zoomable-container, #root-editable, #sc-page-content, #melo-container, .surface, [contenteditable='true']")
    );
  }
  function pasteDocLink(url, title) {
    const data = new DataTransfer();
    data.setData("text/plain", url);
    data.setData("text/html", `<a href="${escapeHtml(url)}">${escapeHtml(title || url)}</a>`);
    const event = new ClipboardEvent("paste", { bubbles: true, cancelable: true });
    try {
      Object.defineProperty(event, "clipboardData", { value: data });
    } catch {
      return false;
    }
    if (!event.clipboardData) return false;
    return pasteTarget().dispatchEvent(event) === false;
  }
  function onInsertDoc(event) {
    const detail = event.detail;
    if (!detail || detail.source !== MSG_SOURCE) return;
    const url = String(detail.url || "").trim();
    const title = String(detail.title || "").trim();
    if (!parseDocUrl(url)) return;
    const typed = mentionTarget();
    if (typed?.melo) selectMeloMention(typed);
    else if (typed) {
      armMention(typed, false);
      deleteCapturedMention(typed);
    }
    const pasted = pasteDocLink(url, title);
    if (!pasted) {
      try {
        document.execCommand("insertText", false, url);
      } catch {
      }
    }
    if (typed && !typed.melo) deleteCapturedMention(typed);
    savedMention = null;
    mentionActive = false;
    dispatchMention({ active: false });
  }
  window.__WECOM_BETTER__ = "1.1.2";
  document.addEventListener(HELLO_EVENT, publish);
  document.addEventListener(WEB_LAYOUT_EVENT, onWebLayoutMessage);
  document.addEventListener(INSERT_DOC_EVENT, onInsertDoc);
  document.addEventListener(PICK_MENTION_EVENT, onPickMention);
  document.addEventListener("selectionchange", scheduleMention);
  document.addEventListener("keyup", scheduleMention, true);
  document.addEventListener("mouseup", scheduleMention, true);
  document.addEventListener("input", scheduleMention, true);
  document.addEventListener("compositionend", scheduleMention, true);
  window.addEventListener("scroll", scheduleMention, true);
  window.addEventListener("resize", scheduleMention);
  hookHistory();
  publish();
  window.setTimeout(primeViewersIfNeeded, 800);
  window.setTimeout(primeViewersIfNeeded, 2400);
  function mutationFromOurUi(mutation) {
    function ours(node) {
      if (!node) return true;
      const el = node.nodeType === 1 ? node : node.parentElement;
      if (!el || el.nodeType !== 1) return true;
      return isOurUi(el);
    }
    if (!ours(mutation.target)) return false;
    return [...mutation.addedNodes, ...mutation.removedNodes].every(ours);
  }
  new MutationObserver(function(mutations) {
    if (mutations.every(mutationFromOurUi)) return;
    schedulePublish();
  }).observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["href", "data-link-href", "data-href"]
  });
  document.addEventListener("input", schedulePublish, true);
  document.addEventListener("paste", schedulePublish, true);
  window.setInterval(publish, POLL_MS);
})();
