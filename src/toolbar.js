import {
  CREATE_PLUS_ID,
  DOC_META_ROOT_ID,
  FOOTER_ROOT_ID,
  FOOTER_SPACE_ID,
  REFS_ROOT_ID,
  SEARCH_PANEL_ID,
  SEARCH_ROOT_ID,
  SEARCH_SETTINGS_ID,
  TITLEBAR_TOOLS_ID,
  WANDER_ROOT_ID,
  findToolsAnchor,
  isDocDetailPage,
  moveBefore,
  parseDocPath,
} from "./shared.js";

const PLUS_ICON =
  '<svg class="wxcr-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M11.4 11.4V7h1.2v4.4H17v1.2h-4.4V17h-1.2v-4.4H7v-1.2h4.4zM12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm0-1.2a8.8 8.8 0 100-17.6 8.8 8.8 0 000 17.6z" fill="currentColor" fill-rule="evenodd"/></svg>';

const OUR_UI = `#${CREATE_PLUS_ID}, #${TITLEBAR_TOOLS_ID}, #${SEARCH_ROOT_ID}, #${SEARCH_PANEL_ID}, #${SEARCH_SETTINGS_ID}, #wxdoc-online-viewers, #${REFS_ROOT_ID}, #${FOOTER_ROOT_ID}, #${FOOTER_SPACE_ID}, #${WANDER_ROOT_ID}, #${DOC_META_ROOT_ID}`;

let creating = false;

function currentKind() {
  return parseDocPath(location.pathname)?.kind || "";
}

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
  return ret === 0 || ret == null;
}

async function postForm(path, fields) {
  const query = new URLSearchParams();
  const sid = cookieSid();
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
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  if (!res.ok) throw new Error(`create ${res.status}`);
  return res.json();
}

function pickCreateUrl(data) {
  const body = unwrapBody(data);
  const file =
    (body.file_info && typeof body.file_info === "object" && body.file_info) ||
    (body.file && typeof body.file === "object" && body.file) ||
    (body.new_file_2 && typeof body.new_file_2 === "object" && body.new_file_2) ||
    body;
  const url = String(file.doc_url || file.url || body.doc_url || body.url || "").trim();
  if (url && /doc\.weixin\.qq\.com/i.test(url)) return url;
  const id = String(file.doc_id || file.file_id || body.doc_id || "").trim();
  return id ? `https://doc.weixin.qq.com/smartpage/${id}` : "";
}

function hideSmartpageTexts() {
  if (currentKind() !== "smartpage") return;
  document.querySelectorAll('[data-wecom-better-hide="发布"]').forEach(function (el) {
    el.removeAttribute("data-wecom-better-hide");
  });
  document.querySelectorAll("button, a, [role='button'], span, div").forEach(function (el) {
    if (el.closest(OUR_UI)) return;
    const rect = el.getBoundingClientRect();
    if (rect.top < 0 || rect.top > 64 || rect.height > 48 || rect.left < window.innerWidth * 0.42) return;
    const text = String(el.innerText || el.textContent || "").replace(/\s+/g, "");
    if (!/^成员\d*$/.test(text)) return;
    const target = el.closest("button, a, [role='button']") || el;
    target.setAttribute("data-wecom-better-hide", "成员");
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
  const stop = function (event) {
    if (event.target.closest(`#${CREATE_PLUS_ID}`)) return;
    event.stopPropagation();
  };
  ["pointerdown", "mousedown", "mouseup", "click", "mouseover"].forEach(function (type) {
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
  plus.title = message || "新建失败，请稍后重试";
  window.setTimeout(function () {
    plus.title = "新建智能文档";
  }, 2400);
}

function paintPreview(preview) {
  if (!preview) return;
  try {
    preview.document.open();
    preview.document.write(
      "<!doctype html><html><head><meta charset=\"utf-8\"><title>正在创建文档</title>" +
        "<style>html,body{height:100%;margin:0;background:#f5f6f7;color:#8f959e;" +
        "font:14px/22px 'PingFang SC','Hiragino Sans GB',sans-serif;" +
        "display:flex;align-items:center;justify-content:center}</style></head>" +
        "<body>正在创建智能文档…</body></html>"
    );
    preview.document.close();
  } catch {
    /* 空白页也能继续跳转 */
  }
}

function openCreatedDoc(url, preview) {
  if (preview && !preview.closed) {
    try {
      preview.location.replace(url);
      return true;
    } catch {
      /* 走 window.open */
    }
  }
  const next = window.open(url, "_blank", "noopener");
  return Boolean(next && !next.closed);
}

async function createSmartpageUrl() {
  const data = await postForm("/webdisk/create", {
    func: "17",
    name: "无标题智能文档",
    space_id: "",
    father_id: "",
    add_to_open_list: "true",
  });
  if (!requestOk(data)) throw new Error(data?.head?.msg || "create failed");
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
  createSmartpageUrl()
    .then(function (url) {
      if (openCreatedDoc(url, preview)) return;
      flashFail(plus, "请允许弹出窗口后重试");
    })
    .catch(function () {
      if (preview && !preview.closed) preview.close();
      flashFail(plus);
    })
    .finally(function () {
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
    root.setAttribute("aria-label", "新建智能文档");
    root.title = "新建智能文档";
    root.insertAdjacentHTML("afterbegin", PLUS_ICON);
    root.addEventListener("pointerdown", onPlusActivate, true);
    root.addEventListener("click", onPlusActivate);
  }
  placeTools(ensureTools(), root);
  return root;
}

export function unmountToolbar() {
  document.getElementById(CREATE_PLUS_ID)?.remove();
  const tools = document.getElementById(TITLEBAR_TOOLS_ID);
  if (tools) {
    const search = document.getElementById(SEARCH_ROOT_ID);
    if (search && tools.contains(search)) {
      tools.parentElement?.insertBefore(search, tools);
    }
    tools.remove();
  }
  document.querySelectorAll("[data-wecom-better-hide]").forEach(function (el) {
    el.removeAttribute("data-wecom-better-hide");
  });
}

export function renderToolbar() {
  document.documentElement.dataset.wecomDocKind = currentKind();
  if (!isDocDetailPage()) {
    unmountToolbar();
    return;
  }
  ensurePlus();
  hideSmartpageTexts();
}
