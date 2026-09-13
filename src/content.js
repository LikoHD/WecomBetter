import { placeDocMeta, renderDocMeta, unmountDocMeta } from "./doc-meta.js";
import { hideFooter, mainContentReady, placeFooter, placeRefsRoot, renderRefDocs, unmountRefs } from "./refs.js";
import { mountSearch, unmountSearch } from "./search.js";
import {
  DEFAULT_FEATURES,
  DOC_META_ROOT_ID,
  FOOTER_ROOT_ID,
  HELLO_EVENT,
  MSG_SOURCE,
  REFS_ROOT_ID,
  SEARCH_ROOT_ID,
  SNAPSHOT_EVENT,
  extensionAlive,
  isDocDetailPage,
  isHomePage,
  isRefDocsPage,
  parseDocPath,
  readFeatures,
} from "./shared.js";
import { renderToolbar, unmountToolbar } from "./toolbar.js";
import { renderViewers, unmountViewers } from "./viewers.js";
import { mountWander, unmountWander } from "./wander.js";

let features = { ...DEFAULT_FEATURES };
let last = {
  viewers: [],
  total: 0,
  refs: [],
  docMeta: null,
  docTitle: "",
};
let contentReadyFor = "";

function pageContentReady() {
  const id = parseDocPath(location.pathname)?.id || "";
  if (contentReadyFor && contentReadyFor !== id) contentReadyFor = "";
  if (contentReadyFor && contentReadyFor === id) return true;
  if (!mainContentReady()) return false;
  contentReadyFor = id;
  return true;
}

function apply() {
  if (!extensionAlive()) return;
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

  if (features.viewers !== false) {
    renderViewers(last.viewers, last.total);
  } else {
    unmountViewers();
  }

  const footerReady = (isRefDocsPage() || isDocDetailPage()) && pageContentReady();

  if (features.refs !== false && isRefDocsPage() && footerReady) {
    renderRefDocs(last.refs);
  } else {
    unmountRefs();
    if (!footerReady) hideFooter();
  }

  if (footerReady) {
    mountWander({
      refs: last.refs,
      docMeta: last.docMeta,
      docTitle: last.docTitle,
    });
  } else {
    unmountWander();
  }

  if (features.search !== false && isDocDetailPage()) {
    mountSearch();
  } else {
    unmountSearch();
  }

  if (features.docMeta !== false && isDocDetailPage()) {
    renderDocMeta(last.docMeta);
  } else {
    unmountDocMeta();
  }

  if (isRefDocsPage()) {
    renderToolbar();
  } else {
    unmountToolbar();
  }
}

function onSnapshot(event) {
  const detail = event.detail;
  if (!detail || detail.source !== MSG_SOURCE) return;
  last = {
    viewers: Array.isArray(detail.viewers) ? detail.viewers : [],
    total: Number(detail.total) || 0,
    refs: Array.isArray(detail.refs) ? detail.refs : [],
    docMeta: detail.docMeta && typeof detail.docMeta === "object" ? detail.docMeta : null,
    docTitle: String(detail.docTitle || ""),
  };
  apply();
}

function onLayout() {
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
  function searchVisible() {
    const root = document.getElementById(SEARCH_ROOT_ID);
    return Boolean(root && root.offsetParent);
  }
  function watchChrome() {
    if (watch || searchVisible()) return;
    watch = new MutationObserver(function () {
      window.clearTimeout(watchTimer);
      watchTimer = window.setTimeout(function () {
        if (!extensionAlive()) return;
        apply();
        if (searchVisible() && watch) {
          watch.disconnect();
          watch = null;
        }
      }, 80);
    });
    watch.observe(document.documentElement, { childList: true, subtree: true });
  }
  watchChrome();
  document.addEventListener(SNAPSHOT_EVENT, onSnapshot);
  document.dispatchEvent(new CustomEvent(HELLO_EVENT, { bubbles: true }));
  window.addEventListener("resize", onLayout);
  window.addEventListener("scroll", onLayout, true);
  try {
    chrome.storage.onChanged.addListener(async function (changes, area) {
      if (!extensionAlive() || area !== "sync" || !changes.features) return;
      features = await readFeatures();
      apply();
    });
  } catch {
    /* 扩展重载后旧脚本失效 */
  }
}

startApp();
