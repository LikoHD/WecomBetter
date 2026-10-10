const { test, expect } = require("@playwright/test");
const { build } = require("esbuild");
const path = require("node:path");

const repo = path.resolve(__dirname, "..");
let editingScript;

test.beforeAll(async () => {
  const result = await build({
    entryPoints: [path.join(repo, "src/editing.js")],
    bundle: true,
    format: "iife",
    globalName: "editingTest",
    write: false,
  });
  editingScript = result.outputFiles[0].text;
});

async function openCanvas(page) {
  await page.route("https://doc.weixin.qq.com/**", (route) => route.fulfill({
    contentType: "text/html",
    body: `<!doctype html><body>
      <div class="surface"><div id="melo-hidden-editor" contenteditable="true"></div></div>
      <div id="wxdoc-quick-search"><input id="search-input"></div>
    </body>`,
  }));
  await page.goto("https://doc.weixin.qq.com/doc/input-regression");
  await page.addScriptTag({ content: editingScript });
}

test("IME keeps the editor busy until composition ends, without cancelling input", async ({ page }) => {
  await openCanvas(page);
  await page.evaluate(() => {
    window.idleCount = 0;
    window.watcher = editingTest.watchEditing({ onIdle: () => idleCount++ });
    document.getElementById("melo-hidden-editor").focus();
    document.activeElement.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
  });
  // A pause while choosing Chinese characters is not the end of an edit transaction.
  await page.waitForTimeout(650);
  expect(await page.evaluate(() => watcher.isEditing())).toBe(true);
  expect(await page.evaluate(() => idleCount)).toBe(0);
  expect(await page.evaluate(() => {
    const event = new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "insertCompositionText", data: "测试", isComposing: true });
    return document.activeElement.dispatchEvent(event);
  })).toBe(true);
  await page.evaluate(() => document.activeElement.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "测试" })));
  await expect.poll(() => page.evaluate(() => watcher.isEditing())).toBe(false);
  expect(await page.evaluate(() => idleCount)).toBe(1);
});

test("search input and navigation do not suppress document updates; disposal removes listeners", async ({ page }) => {
  await openCanvas(page);
  await page.evaluate(() => {
    window.edits = 0;
    window.watcher = editingTest.watchEditing({ onEdit: () => edits++ });
  });
  await page.locator("#search-input").fill("标题");
  expect(await page.evaluate(() => watcher.isEditing())).toBe(false);
  await page.locator("#melo-hidden-editor").focus();
  await page.keyboard.press("ArrowRight");
  expect(await page.evaluate(() => watcher.isEditing())).toBe(false);
  await page.keyboard.press("Space");
  expect(await page.evaluate(() => watcher.isEditing())).toBe(true);
  await page.evaluate(() => { watcher.dispose(); window.edits = 0; });
  await page.keyboard.type("x");
  expect(await page.evaluate(() => edits)).toBe(0);
});

test("production MAIN defers scans and cancels automatic layout changes after editing starts", async ({ page }) => {
  await openCanvas(page);
  await page.evaluate(() => {
    window.switches = [];
    window.reads = 0;
    window.snapshots = 0;
    document.addEventListener("wecom-better:snapshot", () => snapshots++);
    window.pad = { editor: {
      _layoutTypeManager: {
        currentLayoutType: 2,
        switchTo(value) { switches.push(value); this.currentLayoutType = value; },
      },
      _state: { _dataEngine: { dataStream: { textPool: {
        size: () => 20,
        subText() { reads++; return "普通文档没有引用的正文"; },
      } } } },
    } };
    document.getElementById("melo-hidden-editor").focus();
  });
  await page.addScriptTag({ path: path.join(repo, "dist/page-bridge.iife.js") });
  expect(await page.evaluate(() => switches)).toEqual([8]);
  await page.evaluate(() => {
    document.activeElement.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    // The native editor can restore its saved layout after startup.
    pad.editor._layoutTypeManager.currentLayoutType = 2;
    reads = 0;
    snapshots = 0;
  });
  await page.waitForTimeout(1300);
  expect(await page.evaluate(() => ({ reads, snapshots, switches }))).toEqual({ reads: 0, snapshots: 0, switches: [8] });
  await page.evaluate(() => document.activeElement.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true })));
  await expect.poll(() => page.evaluate(() => snapshots)).toBeGreaterThan(0);
  expect(await page.evaluate(() => reads)).toBeGreaterThan(0);
  expect(await page.evaluate(() => switches)).toEqual([8]);
});
