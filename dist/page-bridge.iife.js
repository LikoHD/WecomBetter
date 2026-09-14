(() => {
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
  var SILENT_PANEL_CLASS = "wxov-silent-panel";
  var POLL_MS = 1200;
  var DOC_HOST = "doc.weixin.qq.com";
  var DOC_PATH_RE = /^\/(doc|smartpage|sheet|smartsheet|slide|mind|flowchart)\/([^/?#]+)/i;
  var SNAPSHOT_EVENT = "wecom-better:snapshot";
  var HELLO_EVENT = "wecom-better:hello";
  var CREATE_SMARTPAGE_EVENT = "wecom-better:create-smartpage";
  var CREATE_SMARTPAGE_MSG = "create-smartpage";
  function parseLabel(text) {
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
  function findVisibleCollabButton() {
    const buttons = [...document.querySelectorAll(".ent-collab-users")];
    return buttons.find((el) => el.offsetParent !== null) || buttons[0] || null;
  }

  // src/page-bridge.js
  var primed = false;
  var tickTimer = 0;
  var hooked = false;
  var hookedEditor = false;
  var seenDomRefs = false;
  var seenDomRefsFor = "";
  var creatingSmartpage = false;
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
    const raw = String(title || "").replace(/[\u200b\u200c\u200d\u2060\ufeff]/g, "").replace(/\s+/g, " ").trim();
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
        `#${REFS_ROOT_ID}, #${FOOTER_ROOT_ID}, #${WANDER_ROOT_ID}, #${SEARCH_ROOT_ID}, #${DOC_META_ROOT_ID}, .xd-web-header, .collab-list`
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
    if (seenDomRefsFor !== self.id) {
      seenDomRefsFor = self.id;
      seenDomRefs = false;
    }
    const bucket = /* @__PURE__ */ new Map();
    function add(item) {
      addRefItem(bucket, item.title, item.url, self);
    }
    if (self.kind === "smartpage") {
      collectRefsFromSmartpagePool().forEach(add);
      collectRefsFromDom().forEach(add);
    } else if (self.kind === "doc") {
      collectRefsFromDom().forEach(add);
      if (bucket.size) seenDomRefs = true;
      if (!bucket.size && !seenDomRefs) {
        collectRefsFromMelo().forEach(add);
      } else if (bucket.size) {
        collectRefsFromMelo().forEach(function(item) {
          const parsed = parseDocUrl(item.url);
          if (parsed && bucket.has(parsed.id)) add(item);
        });
      }
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
  function readPageMar(pageBox) {
    let node = pageBox;
    for (let i = 0; i < 6 && node; i += 1) {
      const bag = node.sectionProperty?.propBag?.pgMar?.propBag;
      if (bag && bag.top != null) {
        return {
          top: Number(bag.top) || 1440,
          left: Number(bag.left) || 1800
        };
      }
      node = node.childBoxes && node.childBoxes[0];
    }
    return { top: 1440, left: 1800 };
  }
  function canvasLayoutType() {
    const editor = window.pad?.editor;
    const raw = editor?._layoutTypeManager?.currentLayoutType ?? editor?._docEnv?.layoutType ?? editor?.layoutController?.docEnv?.layoutType;
    const n = Number(raw);
    return Number.isFinite(n) ? n : 2;
  }
  function collectCanvasMetaPlace() {
    const editor = window.pad?.editor;
    const layoutType = canvasLayoutType();
    const zoom = Number(editor?._view?.renderer?._zoom) || 1;
    const page0 = editor?.layoutController?.docBox?.childBoxes?.[0];
    const mar = readPageMar(page0);
    function twipPx(value) {
      return (Number(value) || 0) / 15 * zoom;
    }
    const pageTop = twipPx(mar.top);
    const pageLeft = twipPx(mar.left);
    const metaH = 26;
    const gap = 8;
    const header = layoutType === 2 ? pageTop : Math.max(44, Math.round(pageTop * 0.5));
    return {
      layoutType,
      metaTop: Math.round(Math.max(gap, header - metaH - gap)),
      metaLeft: Math.round(pageLeft)
    };
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
    let isSelf = Boolean(file?.isSelf || cv.isCreator);
    if (isSelf) {
      name = String(self.englishName || self.english_name || name).trim() || name;
    }
    if (!isSelf && name && viewerId && name.toLowerCase() === viewerId.toLowerCase()) isSelf = true;
    if (!isSelf && creatorVid && selfVid && creatorVid === selfVid) isSelf = true;
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
    const place = path.kind === "doc" ? collectCanvasMetaPlace() : { layoutType: 0, metaTop: 0, metaLeft: 0 };
    if (!name && !createdAt && !updatedAt) return null;
    return {
      name,
      displayName,
      avatar,
      createdAt,
      updatedAt,
      isSelf,
      viewerId,
      creatorVid,
      layoutType: place.layoutType,
      metaTop: place.metaTop,
      metaLeft: place.metaLeft
    };
  }
  function collectDocTitle() {
    const doc = document.getElementById("melo-doc-title");
    const fromDoc = String(doc?.innerText || doc?.textContent || "").replace(/[\u200b\u200c\u200d\u2060\ufeff]/g, "").replace(/\s+/g, " ").trim();
    if (fromDoc) return fromDoc;
    const smart = document.querySelector(
      "#root-editable .sc-text-input-content, #sc-page-content .sc-text-input-content, #root-editable .textInput__pIjhc, #sc-page-content .textInput__pIjhc"
    );
    const fromSmart = String(smart?.innerText || smart?.textContent || "").replace(/[\u200b\u200c\u200d\u2060\ufeff]/g, "").replace(/\s+/g, " ").trim();
    if (fromSmart) return fromSmart;
    return String(document.title || "").replace(/[\u200b\u200c\u200d\u2060\ufeff]/g, "").replace(/\s+/g, " ").trim().replace(/\s*[-–—_|]\s*(腾讯文档|企业微信文档|企业微信|微信文档|WeCom|WeChat Work|Tencent Docs)\s*$/i, "").trim();
  }
  function publish() {
    hookRuntimeUpdates();
    hookEditorUpdates();
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
  function isVisible(el) {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  }
  function isOurUi(el) {
    return Boolean(el.closest(`#${CREATE_PLUS_ID}, #wxdoc-titlebar-tools, #${REFS_ROOT_ID}, #wxdoc-online-viewers, #${SEARCH_ROOT_ID}, #${SEARCH_PANEL_ID}, #${SEARCH_SETTINGS_ID}, #${DOC_META_ROOT_ID}, #${FOOTER_ROOT_ID}, #${FOOTER_SPACE_ID}, #${WANDER_ROOT_ID}`));
  }
  function clickNative(el) {
    if (!el) return false;
    const key = Object.keys(el).find(function(name) {
      return name.startsWith("__reactProps") || name.startsWith("__reactFiber") || name.startsWith("__reactInternalInstance");
    });
    if (key && key.startsWith("__reactProps") && typeof el[key]?.onClick === "function") {
      try {
        el[key].onClick({ preventDefault() {
        }, stopPropagation() {
        }, nativeEvent: { isTrusted: true } });
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
  function findByExactText(label, opts) {
    const allowHidden = Boolean(opts && opts.allowHidden);
    const leftOnly = Boolean(opts && opts.leftOnly);
    const nodes = document.querySelectorAll("button, a, [role='menuitem'], [role='option'], [role='button'], li, div, span");
    let best = null;
    for (let i = 0; i < nodes.length; i += 1) {
      const el = nodes[i];
      if (isOurUi(el)) continue;
      if (textOf(el) !== label) continue;
      if (!allowHidden && !isVisible(el)) continue;
      const rect = el.getBoundingClientRect();
      if (leftOnly && rect.left > 320) continue;
      const clickable = el.closest("button, a, [role='menuitem'], [role='option'], [role='button']") || el;
      if (!best || clickable.innerText.length < best.innerText.length) best = clickable;
    }
    return best;
  }
  function activateCreateItem(el) {
    if (!el) return false;
    if (el.href && /doc\.weixin\.qq\.com/.test(el.href)) {
      location.assign(el.href);
      return true;
    }
    return clickNative(el);
  }
  function onCreateSmartpage() {
    if (creatingSmartpage) return;
    creatingSmartpage = true;
    const plus = document.getElementById(CREATE_PLUS_ID);
    if (plus) plus.setAttribute("aria-busy", "true");
    function done() {
      creatingSmartpage = false;
      if (plus) plus.removeAttribute("aria-busy");
    }
    const visibleItem = findByExactText("\u65B0\u5EFA\u667A\u80FD\u6587\u6863");
    if (visibleItem) {
      activateCreateItem(visibleItem);
      done();
      return;
    }
    const hiddenItem = findByExactText("\u65B0\u5EFA\u667A\u80FD\u6587\u6863", { allowHidden: true });
    if (hiddenItem) {
      activateCreateItem(hiddenItem);
      done();
      return;
    }
    const neu = findByExactText("\u65B0\u5EFA", { leftOnly: true });
    if (neu) clickNative(neu);
    window.setTimeout(function() {
      activateCreateItem(findByExactText("\u65B0\u5EFA\u667A\u80FD\u6587\u6863", { allowHidden: true }));
      done();
    }, 180);
  }
  function onCreateMessage(event) {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== MSG_SOURCE || data.type !== CREATE_SMARTPAGE_MSG) return;
    onCreateSmartpage();
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
  window.__WECOM_BETTER__ = "1.0.3";
  document.addEventListener(HELLO_EVENT, publish);
  document.addEventListener(CREATE_SMARTPAGE_EVENT, onCreateSmartpage);
  window.addEventListener("message", onCreateMessage);
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
