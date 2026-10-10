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

test('mention panel leaves IME keys alone while supporting normal keyboard selection', async ({ page }) => {
  await openCanvas(page);
  await page.route('https://doc.weixin.qq.com/diskfile/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ head: { ret: 0 }, body: { files: [{ doc_id: 'target-document', doc_url: url, name: '输入文档' }] } }) }));
  await page.evaluate(() => {
    window.chrome = { runtime: { id: 'test-extension' }, storage: { sync: { get: async defaults => defaults }, local: { get: async defaults => defaults, set: async () => {} }, onChanged: { addListener() {} } } };
  });
  await page.addScriptTag({ path: path.join(repo, 'dist/content.iife.js') });
  await page.evaluate(() => document.dispatchEvent(new Event('selectionchange')));
  await expect(page.locator('#wxdoc-mention-docs .wxmd-item')).toHaveCount(1);
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
