const { test, expect } = require("@playwright/test");
const { build } = require("esbuild");
const path = require("node:path");

const repo = path.resolve(__dirname, "..");
let metaScript;

test.beforeAll(async () => {
  const result = await build({
    entryPoints: [path.join(repo, "src/doc-meta.js")],
    bundle: true,
    format: "iife",
    globalName: "docMetaTest",
    write: false,
  });
  metaScript = result.outputFiles[0].text;
});

async function openEditor(page, kind = "smartpage") {
  // All document/network data stays in this local fixture, including the production bundles.
  await page.route("https://doc.weixin.qq.com/**", (route) => route.fulfill({
    contentType: "text/html",
    body: `<!doctype html><html><head><meta charset="utf-8"><style>
      * { box-sizing: border-box; }
      body { margin: 0; color: #1f2329; font: 16px/1.5 sans-serif; }
      #workbench-titlebar { height: 72px; background: #f5f6f7; }
      #sc-scroll-container { height: 828px; overflow: auto; }
      .jumper-dom-container { width: min(820px, 100%); margin: auto; padding: 96px 64px; }
      #root-editable { outline: none; }
      h1 { margin: 0; font-size: 32px; }
      h2 { margin: 24px 0 12px; font-size: 24px; }
      p { margin: 12px 0; }
      ol { margin: 12px 0; }
      .spacer { height: 1200px; }
    </style></head><body>
      <div id="workbench-titlebar">文档编辑回归验证</div>
      <div id="workbench-content-container"><div id="sc-scroll-container">
        <div class="jumper-dom-container"><div id="sc-page-content">
          <div id="root-editable" contenteditable="true" spellcheck="false">
            <div class="jumper-dom-superlist">
              <div class="sc-block-wrapper block-wrapper-padding" id="title-block"><h1 class="sc-text-input-content">标题与编号验证</h1></div>
              <h2 class="sc-block-wrapper" id="heading">二级标题</h2>
              <p class="sc-block-wrapper" id="paragraph">普通正文</p>
              <ol start="3"><li class="sc-block-wrapper" id="item">编号条目</li><li class="sc-block-wrapper">下一条</li></ol>
              <p class="spacer" contenteditable="false"></p>
            </div>
          </div>
        </div></div>
      </div></div>
    </body></html>`,
  }));
  await page.goto(`https://doc.weixin.qq.com/${kind}/regression-document`);
  await page.addStyleTag({ path: path.join(repo, "src/page/styles/doc-meta.css") });
  await page.addScriptTag({ content: metaScript });
}

async function renderMeta(page, overrides = {}) {
  await page.evaluate((overrides) => docMetaTest.renderDocMeta({
    name: "test-user",
    avatar: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E",
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    ...overrides,
  }), overrides);
}

async function watchEditor(page) {
  return page.evaluate(() => {
    const editor = document.getElementById("root-editable");
    window.editorMutations = [];
    window.editorObserver = new MutationObserver((records) => editorMutations.push(...records.map((r) => r.type)));
    editorObserver.observe(editor, { subtree: true, childList: true, characterData: true, attributes: true });
    return editor.innerHTML;
  });
}

async function caretAtEnd(page, selector) {
  await page.locator(selector).evaluate((el) => {
    el.closest("[contenteditable='true']").focus({ preventScroll: true });
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const selection = document.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
}

test("metadata mount, updates and unmount leave the editor DOM untouched", async ({ page }) => {
  await openEditor(page);
  const before = await watchEditor(page);
  await renderMeta(page);
  await expect(page.locator("#wxdoc-doc-meta")).toBeVisible();
  expect(await page.locator("#root-editable").innerHTML()).toBe(before);
  expect(await page.evaluate(() => editorMutations)).toEqual([]);
  await renderMeta(page, { name: "updated-user", updatedAt: 1800000000000 });
  await page.evaluate(() => {
    for (let i = 0; i < 30; i++) docMetaTest.placeDocMeta(document.getElementById("wxdoc-doc-meta"));
    docMetaTest.unmountDocMeta();
  });
  expect(await page.locator("#root-editable").innerHTML()).toBe(before);
  expect(await page.evaluate(() => editorMutations)).toEqual([]);
});

test("metadata does not shift native blocks or cover the title", async ({ page }) => {
  await openEditor(page);
  const titleBefore = await page.locator(".sc-text-input-content").boundingBox();
  const headingBefore = await page.locator("#heading").boundingBox();
  await renderMeta(page);
  expect(await page.locator(".sc-text-input-content").boundingBox()).toEqual(titleBefore);
  expect(await page.locator("#heading").boundingBox()).toEqual(headingBefore);
  const meta = await page.locator("#wxdoc-doc-meta").boundingBox();
  expect(meta.y + meta.height).toBeLessThanOrEqual(titleBefore.y);
  expect(meta.x).toBeGreaterThanOrEqual(titleBefore.x);
  expect(meta.x + meta.width).toBeLessThanOrEqual(titleBefore.x + titleBefore.width);
});

test("asynchronous creator updates wait until the composition is committed", async ({ page }) => {
  await openEditor(page);
  await renderMeta(page);
  await caretAtEnd(page, "#heading");
  await page.evaluate(() => {
    window.avatarMutations = [];
    const observer = new MutationObserver((records) => avatarMutations.push(...records.map((r) => r.type)));
    observer.observe(document.getElementById("wxdoc-doc-meta"), { subtree: true, childList: true, attributes: true, characterData: true });
    document.activeElement.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
  });
  await renderMeta(page, { name: "async-creator" });
  await page.waitForTimeout(650);
  expect(await page.evaluate(() => avatarMutations)).toEqual([]);
  await expect(page.locator(".wxdm-name")).toHaveText("test-user");
  await page.evaluate(() => document.activeElement.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true })));
  await expect(page.locator(".wxdm-name")).toHaveText("async-creator");
  expect(await page.locator("#root-editable [id^='wxdoc-']").count()).toBe(0);
});

test("typing in headings and numbered items preserves selection and native format", async ({ page }) => {
  await openEditor(page);
  await renderMeta(page);
  await page.evaluate(() => {
    document.addEventListener("input", () => docMetaTest.placeDocMeta(document.getElementById("wxdoc-doc-meta")));
    document.addEventListener("compositionupdate", () => docMetaTest.placeDocMeta(document.getElementById("wxdoc-doc-meta")));
  });
  for (const selector of ["#heading", "#paragraph", "#item"]) {
    await caretAtEnd(page, selector);
    const before = await page.locator(selector).evaluate((el) => ({
      tag: el.tagName, weight: getComputedStyle(el).fontWeight, size: getComputedStyle(el).fontSize,
    }));
    await page.keyboard.type(" typing", { delay: 10 });
    await expect(page.locator(selector)).toContainText(" typing");
    const selection = await page.evaluate(() => {
      const sel = document.getSelection();
      window.savedSelection = { node: sel.anchorNode, offset: sel.anchorOffset, active: document.activeElement };
      return { offset: sel.anchorOffset };
    });
    await renderMeta(page, { updatedAt: Date.now() });
    expect(await page.evaluate(() => {
      const sel = document.getSelection();
      return sel.anchorNode === savedSelection.node && sel.anchorOffset === savedSelection.offset && document.activeElement === savedSelection.active;
    })).toBe(true);
    expect(selection.offset).toBeGreaterThan(0);
    expect(await page.locator(selector).evaluate((el) => ({
      tag: el.tagName, weight: getComputedStyle(el).fontWeight, size: getComputedStyle(el).fontSize,
    }))).toEqual(before);
  }
  await page.evaluate(() => {
    const target = document.activeElement;
    target.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    target.dispatchEvent(new CompositionEvent("compositionupdate", { data: "中文", bubbles: true }));
    document.execCommand("insertText", false, "中文");
    target.dispatchEvent(new CompositionEvent("compositionend", { data: "中文", bubbles: true }));
  });
  await expect(page.locator("ol")).toHaveAttribute("start", "3");
  await expect(page.locator("ol > li")).toHaveCount(2);
  await expect(page.locator("#item")).toContainText("中文");
  expect(await page.locator("#root-editable [id^='wxdoc-']").count()).toBe(0);
});

test("scrolling, wrapping and missing title do not leave a stale overlay over the body", async ({ page }) => {
  await openEditor(page);
  await renderMeta(page);
  await page.evaluate(() => {
    const place = () => docMetaTest.placeDocMeta(document.getElementById("wxdoc-doc-meta"));
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    document.querySelector(".sc-text-input-content").textContent = "需要自动换行的长标题".repeat(8);
    place();
  });
  await page.setViewportSize({ width: 560, height: 900 });
  await expect(page.locator("#wxdoc-doc-meta")).toBeVisible();
  // viewport resizing and its resize event are not synchronous in Chromium.
  await expect.poll(async () => {
    const title = await page.locator(".sc-text-input-content").boundingBox();
    const meta = await page.locator("#wxdoc-doc-meta").boundingBox();
    return meta.x + meta.width <= title.x + title.width;
  }).toBe(true);
  const title = await page.locator(".sc-text-input-content").boundingBox();
  const meta = await page.locator("#wxdoc-doc-meta").boundingBox();
  expect(meta.x + meta.width).toBeLessThanOrEqual(title.x + title.width);
  expect(meta.y + meta.height).toBeLessThanOrEqual(title.y);
  await page.evaluate(() => document.getElementById("sc-scroll-container").scrollTop = 600);
  await expect(page.locator("#wxdoc-doc-meta")).toBeHidden();
  await page.evaluate(() => document.getElementById("sc-scroll-container").scrollTop = 0);
  await expect(page.locator("#wxdoc-doc-meta")).toBeVisible();
  await page.evaluate(() => {
    document.getElementById("title-block").remove();
    docMetaTest.placeDocMeta(document.getElementById("wxdoc-doc-meta"));
  });
  await expect(page.locator("#wxdoc-doc-meta")).toBeHidden();
  await page.evaluate(() => {
    const title = document.createElement("h1");
    title.className = "sc-text-input-content";
    title.textContent = "切换后的文档标题";
    document.querySelector(".jumper-dom-superlist").prepend(title);
    docMetaTest.placeDocMeta(document.getElementById("wxdoc-doc-meta"));
  });
  await expect(page.locator("#wxdoc-doc-meta")).toBeVisible();
});

test("no spare space above the title hides metadata without adding a spacer", async ({ page }) => {
  await openEditor(page);
  await page.locator(".jumper-dom-container").evaluate((el) => el.style.paddingTop = "4px");
  const before = await watchEditor(page);
  await renderMeta(page);
  await expect(page.locator("#wxdoc-doc-meta")).toBeHidden();
  expect(await page.locator("#root-editable").innerHTML()).toBe(before);
  expect(await page.evaluate(() => editorMutations)).toEqual([]);
});

test("production bundles keep blocks stable through input, polling and feature toggles", async ({ page }, testInfo) => {
  await openEditor(page);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("https://doc.weixin.qq.com/**", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ head: { ret: 0 }, body: {} }),
  }));
  const manifest = require("../manifest.json");
  for (const css of manifest.content_scripts[1].css) {
    if (!css.endsWith("doc-meta.css")) await page.addStyleTag({ path: path.join(repo, css) });
  }
  await page.evaluate(() => {
    window.featureState = { viewers: true, refs: true, search: true, docMeta: true, webLayout: true, create: true, mention: true };
    window.storageListeners = [];
    window.chrome = {
      runtime: { id: "regression-extension" },
      storage: {
        sync: { get: async () => ({ features: featureState }) },
        local: { get: async (defaults) => defaults, set: async () => {} },
        onChanged: { addListener: (fn) => storageListeners.push(fn) },
      },
    };
    window.FileMetaInfo = { infoSubjectMap: { "regression-document": { _value: { data: {
      creatorName: "test-user", createTime: 1700000000000,
    } } } } };
  });
  const before = await watchEditor(page);
  const headingBefore = await page.locator("#heading").boundingBox();
  await page.addScriptTag({ path: path.join(repo, "dist/page-bridge.iife.js") });
  await page.addScriptTag({ path: path.join(repo, "dist/content.iife.js") });
  await expect(page.locator("#wxdoc-doc-meta")).toBeVisible();
  // Observe more than two production polling intervals (1200ms each).
  await page.waitForTimeout(2800);
  expect(await page.locator("#root-editable").innerHTML()).toBe(before);
  expect(await page.evaluate(() => editorMutations)).toEqual([]);
  expect(await page.locator("#heading").boundingBox()).toEqual(headingBefore);

  // No plugin layout writes while an IME composition is in progress, even when
  // another snapshot arrives; one update catches up after the composition ends.
  await caretAtEnd(page, "#heading");
  await page.evaluate(() => {
    window.metaMutations = [];
    window.metaObserver = new MutationObserver((records) => metaMutations.push(...records.map((r) => r.type)));
    metaObserver.observe(document.getElementById("wxdoc-doc-meta"), { subtree: true, attributes: true, childList: true, characterData: true });
    document.activeElement.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    document.dispatchEvent(new CustomEvent("wecom-better:snapshot", { detail: {
      source: "wecom-better", viewers: [], refs: [], total: 0,
      docMeta: { name: "test-user", createdAt: 1700000000000, updatedAt: 1800000000000 },
    } }));
    document.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForTimeout(650);
  expect(await page.evaluate(() => metaMutations)).toEqual([]);
  await page.evaluate(() => document.activeElement.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true })));
  await expect.poll(() => page.evaluate(() => metaMutations.length)).toBeGreaterThan(0);
  await page.evaluate(() => metaObserver.disconnect());

  await caretAtEnd(page, "#heading");
  await page.keyboard.type(" after polling", { delay: 15 });
  await expect(page.locator("#heading")).toContainText(" after polling");
  await expect(page.locator("#heading")).toHaveCSS("font-size", "24px");
  await expect(page.locator("ol")).toHaveAttribute("start", "3");
  const afterTyping = await page.locator("#root-editable").innerHTML();
  await page.evaluate(() => {
    editorMutations.length = 0;
    featureState.docMeta = false;
    storageListeners.forEach((fn) => fn({ features: { newValue: featureState } }, "sync"));
  });
  await expect(page.locator("#wxdoc-doc-meta")).toHaveCount(0);
  await page.evaluate(() => {
    featureState.docMeta = true;
    storageListeners.forEach((fn) => fn({ features: { newValue: featureState } }, "sync"));
  });
  await expect(page.locator("#wxdoc-doc-meta")).toBeVisible();
  expect(await page.locator("#root-editable").innerHTML()).toBe(afterTyping);
  expect(await page.evaluate(() => editorMutations)).toEqual([]);
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("smartpage.png") });
});

test("ordinary canvas documents retain metadata placement and page DOM", async ({ page }) => {
  await openEditor(page, "doc");
  await page.evaluate(() => {
    document.getElementById("sc-page-content").innerHTML = `<div class="melo-doc-view" style="position:relative;width:690px;height:900px">
      <div class="melo-page-container-view page-0" style="padding:60px 42px;height:800px">
        <div class="paragraph-drag-cover" style="height:40px">画布正文</div>
      </div></div>`;
  });
  const before = await page.locator(".page-0").innerHTML();
  await renderMeta(page);
  await expect(page.locator("#wxdoc-doc-meta")).toBeVisible();
  await expect(page.locator(".melo-doc-view > #wxdoc-doc-meta")).toHaveCount(1);
  expect(await page.locator(".page-0").innerHTML()).toBe(before);
});
