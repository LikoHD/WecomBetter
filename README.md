# WecomBetter 企微搭子

打开 [企微文档](https://doc.weixin.qq.com/) 后自动工作：

- **顶栏快捷搜索**：智能文档 / 文档顶栏搜索框，点击后在框下展示最近浏览和实时建议
- **正在查看头像**：顶栏堆叠当前浏览者，hover 看 Id，点击复制；右侧显示在看/总人数
- **本文关联文档**：智能文档 / 文档滚到文末，列出文内引用的企微文档
- **You may also wander**：关联文档右侧推荐相关文档；标题分词搜文档名，非本人创建再补创建者热门文档，可刷新

兼容智能文档、企微文档、在线表格、智能表格，以及幻灯片 / 思维导图 / 流程图路径。

后续每次改代码再打包，按 [docs/打包注意事项.md](docs/打包注意事项.md) 做。

## 安装

1. 改过 `src/page-bridge.js`、`src/content.js`、`src/refs.js`、`src/viewers.js`、`src/search.js`、`src/toolbar.js` 或 `src/shared.js` 后，先跑 `npm run build`（详见 [打包注意事项](docs/打包注意事项.md)）
2. Chrome 打开 `chrome://extensions`
3. 打开「开发者模式」
4. 「加载已解压的扩展程序」，选中本仓库根目录
5. 打开任意 `https://doc.weixin.qq.com/...` 文档

油猴脚本请先关掉。文档页控制台里 `window.__WECOM_BETTER__` 应为 `"1.0.3"`。

## 目录

```
dist/page-bridge.iife.js    MAIN 产物（esbuild IIFE，过企微 CSP）
dist/content.iife.js        isolated 产物（esbuild IIFE，不能直接 import）
src/page-bridge.js          MAIN 源码：采集在看 / 关联文档，派发快照
src/content.js              isolated 入口：收快照、按开关画 UI
src/viewers.js              isolated：顶栏头像
src/search.js               isolated：顶栏快捷搜索
src/toolbar.js              isolated：顶栏新建
src/refs.js                 isolated：文末关联文档
src/shared.js               两边共用的常量和小工具
src/popup/                  工具栏开关
src/background/             service worker
```

企微文档 CSP 会拦 MAIN world 的 ES `import`，也会拦页面里插的 `chrome-extension://` 标签。所以：

- MAIN、isolated 都只跑构建后的**经典 IIFE**（manifest 的 content script 不能 `import`）
- popup / service worker 可以继续用 ESM
- 两边用 DOM 上的 `wecom-better:snapshot` CustomEvent 传数据，不靠页面去拉扩展脚本

`chrome.storage` 只在 isolated / popup / SW。MAIN 始终采集；开关只决定 isolated 画不画。

## 加新功能

1. 开关默认值放 `src/shared.js`
2. 采集写进 `src/page-bridge.js` 的快照
3. 渲染写进对应模块（或新的 isolated 文件），在 `src/content.js` 里按开关调用
4. `npm run build`
5. 如需开关，改 `src/popup/index.html`


## 权限

只要 `storage` 和 `https://doc.weixin.qq.com/*`。复制 Id 走页面点击下的 Clipboard API。
