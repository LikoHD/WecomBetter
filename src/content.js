import { placeDocMeta, renderDocMeta, unmountDocMeta } from "./doc-meta.js";
import {
  currentPageKey,
  footerLayoutReady,
  footerPending,
  hideFooter,
  isFooterDismissed,
  placeFooter,
  placeRefsRoot,
  renderRefDocs,
  resetFooterGate,
  shouldHideDocFooter,
  unmountRefs,
} from "./refs.js";
import { mountSearch, unmountSearch } from "./search.js";
import {
  DEFAULT_FEATURES,
  DOC_META_ROOT_ID,
  FOOTER_ROOT_ID,
  FOOTER_SPACE_ID,
  HELLO_EVENT,
  MSG_SOURCE,
  REFS_ROOT_ID,
  SEARCH_PANEL_ID,
  SEARCH_ROOT_ID,
  SEARCH_SETTINGS_ID,
  SNAPSHOT_EVENT,
  WANDER_ROOT_ID,
  extensionAlive,
  isDocDetailPage,
  isHomePage,
  isRefDocsPage,
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
let lastPageKey = "";

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

  if (isRefDocsPage()) {
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
      docTitle: last.docTitle,
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

  if (
    isDocDetailPage() &&
    !hideBox &&
    (!document.getElementById(FOOTER_ROOT_ID) || footerPending())
  ) {
    window.setTimeout(function () {
      if (
        extensionAlive() &&
        !shouldHideDocFooter(last.docMeta) &&
        !isFooterDismissed() &&
        (!document.getElementById(FOOTER_ROOT_ID) || footerPending())
      ) {
        apply();
      }
    }, 120);
  }
}

function snapshotSig(detail) {
  return [
    Number(detail.total) || 0,
    (detail.viewers || [])
      .map(function (item) {
        return `${item?.id || ""}\t${item?.avatar || ""}`;
      })
      .join(","),
    (detail.refs || [])
      .map(function (item) {
        return `${item?.id || ""}\t${item?.title || ""}`;
      })
      .join("|"),
    detail.docMeta?.name || "",
    detail.docMeta?.isSelf ? "1" : "0",
    detail.docMeta?.createdAt || "",
    detail.docMeta?.updatedAt || "",
    detail.docMeta?.layoutType ?? "",
    detail.docMeta?.metaTop ?? "",
    detail.docMeta?.metaLeft ?? "",
    detail.docTitle || "",
    detail.path || `${location.pathname}${location.search}`,
  ].join("#");
}

let lastSnapshotSig = "";

function onSnapshot(event) {
  const detail = event.detail;
  if (!detail || detail.source !== MSG_SOURCE) return;
  const next = {
    viewers: Array.isArray(detail.viewers) ? detail.viewers : [],
    total: Number(detail.total) || 0,
    refs: Array.isArray(detail.refs) ? detail.refs : [],
    docMeta: detail.docMeta && typeof detail.docMeta === "object" ? detail.docMeta : null,
    docTitle: String(detail.docTitle || ""),
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
    watch = new MutationObserver(function (mutations) {
      if (mutations.every(mutationFromOurUi)) return;
      window.clearTimeout(watchTimer);
      watchTimer = window.setTimeout(function () {
        if (!extensionAlive()) return;
        if (
          shouldHideDocFooter(last.docMeta) ||
          isFooterDismissed() ||
          !document.getElementById(FOOTER_ROOT_ID) ||
          footerPending()
        ) {
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
