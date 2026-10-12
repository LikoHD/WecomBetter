# 用户偏好

## 搜索

- 腾讯内网资料优先使用 `isearch` skill；不适用时再使用其他搜索工具。
- 会话未加载 `isearch` 时应主动说明，并在可用时使用其底层 MCP 或 `mcporter-internal`。

## 浏览器测试

- 默认通过 Chrome CDP/MCP 连接用户已经登录的 Chrome，复用现有登录状态。
- 同一会话中已授权的浏览器测试及其必要操作直接继续，不要重复要求授权或重新登录。
- 在线编辑回归优先使用测试副本；测试后撤销临时输入，保留用户原文。

## 发布打包

- 每轮改动收尾（用户说「保存」、改完 `src/` 代码）都要执行 `npm run release`，把 `releases/` 更新成当前版本。
- `releases/` 里始终只有两份：`wecombetter-<version>.zip`（上传 Chrome 应用商店）和 `wecombetter-unpacked/`（`chrome://extensions` 直接加载，路径固定）。
- 包内只含运行时文件（manifest、`_locales`、`icons`、`dist` 两份 IIFE、`src/popup`、`src/page/styles`、`src/shared.js`、`src/background/service-worker.js`），不含 `docs/`、`website/`、`tests/`、`store-shots/`、`assets/`。
- 打包清单由 `scripts/release.sh` 按 manifest 引用动态推导，新增文件只要挂进 `manifest.json` 就会自动进包。
- 发版前同步版本号：`manifest.json` / `package.json` / `README.md` / `src/page-bridge.js` 的 `window.__WECOM_BETTER__`（脚本会 warn 不一致）。

