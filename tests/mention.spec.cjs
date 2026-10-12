const { test, expect } = require('@playwright/test');
const path = require('node:path');
const repo = path.resolve(__dirname, '..');
const url = 'https://doc.weixin.qq.com/doc/target-document';

async function openCanvas(page) {
  await page.route('https://doc.weixin.qq.com/**', route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><div class="surface"><div id="melo-hidden-editor" contenteditable="true"></div><i class="melo-caret" style="position:fixed;left:120px;top:200px;height:20px"></i></div><button id="other">其他控件</button>',
  }));
  await page.goto('https://doc.weixin.qq.com/doc/mention-regression');
  await page.evaluate(() => {
    window.text = '前文 @输入 后文\r';
    window.calls = [];
    window.mentions = [];
    window.acceptPaste = true;
    window.rejectRange = false;
    const pool = { size: () => text.length, subText: (start, len) => text.slice(start, start + len) };
    window.pad = { editor: {
      _state: {
        selection: { gcpRange: { gcpBegin: 6, len: 0 } },
        getTextStream: () => ({ textPool: pool }),
        moveTo(start, len) { if (!rejectRange) this.selection.gcpRange = { gcpBegin: start, len }; },
      },
      clipboardManager: {
        pasteFromDirectCall(html, plain, unused, options) {
          calls.push({ html, plain, options, range: { ...pad.editor._state.selection.gcpRange }, focus: document.activeElement.id });
          if (!acceptPaste) return { success: false };
          const { gcpBegin, len } = pad.editor._state.selection.gcpRange;
          text = text.slice(0, gcpBegin) + '[文档链接]' + text.slice(gcpBegin + len);
          return { success: true };
        },
      },
    } };
    document.addEventListener('wecom-better:mention', e => mentions.push(e.detail));
    document.getElementById('melo-hidden-editor').focus();
  });
  await page.addScriptTag({ path: path.join(repo, 'dist/page-bridge.iife.js') });
  await page.evaluate(() => document.dispatchEvent(new Event('selectionchange')));
  await expect.poll(() => page.evaluate(() => mentions.some(m => m.active && m.query === '输入'))).toBe(true);
}
async function insert(page) {
  await page.evaluate(url => document.dispatchEvent(new CustomEvent('wecom-better:insert-doc', {
    detail: { source: 'wecom-better', url, title: '标题 & <测试>' },
  })), url);
}

test('canvas replaces the entire model keyword using native paste after focus moves to the panel', async ({ page }) => {
  await openCanvas(page);
  await page.locator('#other').focus();
  await insert(page);
  expect(await page.evaluate(() => text)).toBe('前文 [文档链接] 后文\r');
  const calls = await page.evaluate(() => window.calls);
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({ plain: url, range: { gcpBegin: 3, len: 3 }, focus: 'melo-hidden-editor', options: { isKeepTargetStyle: true } });
  expect(calls[0].html).toContain('标题 &amp; &lt;测试&gt;');
});

test('canvas ignores transient DOM input and reads committed text after the model settles', async ({ page }) => {
  await openCanvas(page);
  await page.evaluate(() => {
    const input = document.getElementById('melo-hidden-editor');
    input.textContent = '@临时';
    const r = document.createRange(); r.selectNodeContents(input); r.collapse(false);
    getSelection().removeAllRanges(); getSelection().addRange(r);
    mentions.length = 0;
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    setTimeout(() => { text = '前文 @提交 后文\r'; }, 35);
  });
  await expect.poll(() => page.evaluate(() => mentions.some(m => m.active && m.query === '提交'))).toBe(true);
  expect(await page.evaluate(() => mentions.some(m => m.query === '临时'))).toBe(false);
});

for (const change of ['caret', 'text', 'document', 'range', 'permission']) {
  test(`canvas does not paste into a stale or rejected target: ${change}`, async ({ page }) => {
    await openCanvas(page);
    await page.evaluate(change => {
      document.getElementById('other').focus();
      if (change === 'caret') pad.editor._state.selection.gcpRange.gcpBegin = 10;
      if (change === 'text') text = '前文 @别字 后文 @输入\r';
      if (change === 'document') history.replaceState({}, '', '/doc/another-document');
      if (change === 'range') rejectRange = true;
      if (change === 'permission') acceptPaste = false;
    }, change);
    const before = await page.evaluate(() => text);
    await insert(page);
    expect(await page.evaluate(() => text)).toBe(before);
    expect(await page.evaluate(() => calls.length)).toBe(change === 'permission' ? 1 : 0);
  });
}

async function openMentionPanel(page, files, count) {
  await page.route('https://doc.weixin.qq.com/diskfile/**', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ head: { ret: 0 }, body: { files } }),
  }));
  await page.evaluate(() => {
    window.chrome = { runtime: { id: 'test-extension' }, storage: { sync: { get: async defaults => defaults }, local: { get: async defaults => defaults, set: async () => {} }, onChanged: { addListener() {} } } };
  });
  await page.addScriptTag({ path: path.join(repo, 'dist/content.iife.js') });
  await page.evaluate(() => document.dispatchEvent(new Event('selectionchange')));
  await expect(page.locator('#wxdoc-mention-docs .wxmd-item')).toHaveCount(count);
}

test('mention panel leaves IME keys alone while supporting normal keyboard selection', async ({ page }) => {
  await openCanvas(page);
  await openMentionPanel(page, [{ doc_id: 'target-document', doc_url: url, name: '输入文档' }], 1);
  const composing = await page.evaluate(() => ['ArrowDown', 'ArrowUp', 'Enter'].map(key => {
    const e = new KeyboardEvent('keydown', { key, isComposing: true, bubbles: true, cancelable: true });
    document.getElementById('melo-hidden-editor').dispatchEvent(e);
    return e.defaultPrevented;
  }));
  expect(composing).toEqual([false, false, false]);
  expect(await page.evaluate(() => calls.length)).toBe(0);
  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => text)).toBe('前文 [文档链接] 后文\r');
});

// 两种编辑器入口都找不到时才插纯文本。
// 关键是不能用合成 paste —— 企微的粘贴处理器不认 clipboardData，转去读系统剪贴板，
// 插进来的会是用户刚复制的那篇文档，而不是列表里选的那篇。
test('page without any editor entry inserts the selected url as text, never a synthetic paste', async ({ page }) => {
  await page.route('https://doc.weixin.qq.com/**', route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><div id="root-editable" contenteditable="true">前文 @输入</div>',
  }));
  await page.goto('https://doc.weixin.qq.com/smartpage/mention-regression');
  await page.evaluate(() => {
    window.pastes = 0;
    document.addEventListener('paste', () => { window.pastes += 1; }, true);
    const node = document.getElementById('root-editable').firstChild;
    const range = document.createRange();
    range.setStart(node, node.data.length);
    range.collapse(true);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
  });
  await page.addScriptTag({ path: path.join(repo, 'dist/page-bridge.iife.js') });
  await insert(page);
  expect(await page.evaluate(() => window.pastes)).toBe(0);
  expect(await page.evaluate(() => document.getElementById('root-editable').textContent)).toContain(url);
});

// 智能文档：DOM 里看得到 @，内容却以编辑器模型为准，服务从 window.__getInstance 取。
async function openSmartCanvas(page) {
  await page.route('https://doc.weixin.qq.com/**', route => route.fulfill({
    contentType: 'text/html; charset=utf-8', body: '<!doctype html><div id="root-editable" contenteditable="true">前文 @输入</div>',
  }));
  await page.goto('https://doc.weixin.qq.com/smartpage/mention-regression');
  await page.evaluate(() => {
    window.calls = [];
    window.pastes = 0;
    window.quote = false;
    window.rejectInsert = false;
    document.addEventListener('paste', () => { window.pastes += 1; }, true);
    const store = { id: 'block', title: [['前文 @输入']] };
    window.store = store;
    const services = {
      TextSelectionStore: { multiSelection: { start: { store, index: 6 }, end: { store, index: 6 } } },
      CharTriggerController: { endTrigger() { calls.push({ type: 'endTrigger' }); } },
      // 编辑器的 dispatch 会吞掉回调里的异常，只记日志。
      DataService: { dispatch(callback) { try { callback({ id: 'command' }); } catch {} } },
      LinkController: {
        insertLinkFromDialog({ selection, text, link, command }) {
          const sameStore = selection.start.store === store && selection.end.store === store;
          calls.push({ type: 'insert', start: selection.start.index, end: selection.end.index, sameStore, text, link, command: command.id });
          if (rejectInsert) throw new Error('readonly');
          const plain = store.title.map(token => token[0]).join('');
          store.title = [[plain.slice(0, selection.start.index)], ['△', [['p', [link, text]]]], [plain.slice(selection.end.index)]].filter(token => token[0]);
          return quote;
        },
        updateLinkInfoByApi(options) {
          calls.push({ type: 'update', kind: options.type, linkUrl: options.linkUrl, linkName: options.linkName, selection: options.selection, sameStore: options.store === store });
          return Promise.resolve();
        },
      },
    };
    window.__getInstance = name => {
      if (!services[name]) throw new Error(`No matching bindings found for ${name}`);
      return services[name];
    };
    const editor = document.getElementById('root-editable');
    editor.focus();
    const range = document.createRange();
    range.setStart(editor.firstChild, editor.firstChild.data.length);
    range.collapse(true);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
  });
  await page.addScriptTag({ path: path.join(repo, 'dist/page-bridge.iife.js') });
}

const callTypes = page => page.evaluate(() => calls.map(call => call.type));

test('smart canvas swaps the typed keyword for a doc link in the model, then fills the doc info', async ({ page }) => {
  await openSmartCanvas(page);
  await insert(page);
  await expect.poll(() => callTypes(page)).toEqual(['endTrigger', 'insert', 'update']);
  const calls = await page.evaluate(() => window.calls);
  expect(calls[1]).toEqual({ type: 'insert', start: 3, end: 6, sameStore: true, text: '标题 & <测试>', link: url, command: 'command' });
  expect(calls[2]).toEqual({ type: 'update', kind: 'IconLink', linkUrl: url, linkName: '标题 & <测试>', selection: { startIndex: 3, endIndex: 4 }, sameStore: true });
  expect(await page.evaluate(() => window.pastes)).toBe(0);
  expect(await page.evaluate(() => document.getElementById('root-editable').textContent)).toBe('前文 @输入');
});

test('smart canvas leaves page references to the editor without fetching link info', async ({ page }) => {
  await openSmartCanvas(page);
  await page.evaluate(() => { window.quote = true; });
  await insert(page);
  await page.waitForTimeout(50);
  expect(await callTypes(page)).toEqual(['endTrigger', 'insert']);
});

test('smart canvas does not fetch link info when the editor rejects the insert', async ({ page }) => {
  await openSmartCanvas(page);
  await page.evaluate(() => { window.rejectInsert = true; });
  await insert(page);
  await page.waitForTimeout(50);
  expect(await callTypes(page)).toEqual(['endTrigger', 'insert']);
  expect(await page.evaluate(() => store.title)).toEqual([['前文 @输入']]);
});

for (const change of ['text', 'caret', 'range']) {
  test(`smart canvas does not insert into a stale model: ${change}`, async ({ page }) => {
    await openSmartCanvas(page);
    await page.evaluate(change => {
      const selection = __getInstance('TextSelectionStore').multiSelection;
      if (change === 'text') store.title = [['前文 @别字']];
      if (change === 'caret') { selection.start.index = 2; selection.end.index = 2; }
      if (change === 'range') selection.start.index = 3;
    }, change);
    await insert(page);
    await page.waitForTimeout(50);
    expect(await callTypes(page)).toEqual([]);
    expect(await page.evaluate(() => document.getElementById('root-editable').textContent)).toBe('前文 @输入');
  });
}

const pickDocs = [
  { doc_id: 'first-document', doc_url: 'https://doc.weixin.qq.com/smartpage/first-document', name: '输入一' },
  { doc_id: 'second-document', doc_url: 'https://doc.weixin.qq.com/doc/second-document', name: '输入二' },
];

async function openSmartCanvasPanel(page) {
  await openSmartCanvas(page);
  await openMentionPanel(page, pickDocs, 2);
}

test('smart canvas inserts the doc picked with arrow keys and Enter', async ({ page }) => {
  await openSmartCanvasPanel(page);
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('#wxdoc-mention-docs .wxmd-item.is-active')).toContainText('输入二');
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => calls.find(call => call.type === 'insert'))).toMatchObject({ start: 3, end: 6, text: '输入二', link: pickDocs[1].doc_url });
  await expect.poll(() => page.evaluate(() => calls.find(call => call.type === 'update')?.linkUrl)).toBe(pickDocs[1].doc_url);
  expect(await page.evaluate(() => document.getElementById('root-editable').textContent)).toBe('前文 @输入');
});

test('smart canvas inserts the doc picked by click', async ({ page }) => {
  await openSmartCanvasPanel(page);
  await page.locator('#wxdoc-mention-docs .wxmd-item').nth(1).click();
  await expect.poll(() => page.evaluate(() => calls.find(call => call.type === 'insert'))).toMatchObject({ start: 3, end: 6, text: '输入二', link: pickDocs[1].doc_url });
  expect(await page.evaluate(() => document.activeElement.id)).toBe('root-editable');
});

