# Chrome Web Store 上架文案（1.0.5）

扩展 ID：`hdekdcibebjbealobngklalnghfnjnoi`
安装包：`releases/wecombetter-1.0.5.zip`（160K，40 个文件，manifest 在根目录）
截图：`store-shots/01-overview.png` ~ `05-more-features.png`（1280×800，已是 SF 字体版）

## 简短描述（≤132 字符）

中文：

```
企业微信文档增强：顶栏快捷搜索、正在查看头像、本文关联文档、标题作者与时间、默认 Web 版式、快速创建。本地运行，零上传。
```

English：

```
Enhances WeCom Docs: quick search, viewer avatars, referenced docs, doc meta, Web layout & quick create. 100% local.
```

## 完整描述（中文，粘到「商品详情 → 详细说明」）

```
让企微文档，好用那么一点。

WecomBetter 企微搭子是企业微信文档的浏览器增强插件。打开 doc.weixin.qq.com 就自动工作，免注册、免配置，装完即忘。

【六个顺手的小功能】

1. 顶栏快捷搜索 —— 智能文档、文档页顶栏都有搜索框，输入即出建议列表，不用先回首页。
2. 正在查看头像 —— 顶栏堆叠此刻在看的人，悬停看名字，点击复制成员 ID，协作前先知道谁在场。
3. 本文关联文档 —— 滚到文末自动列出文内引用的所有文档，顺藤摸瓜，不用翻来翻去。
4. 标题作者与时间 —— 标题下直接显示创建人和最后编辑时间，不用点开详情页。
5. 默认 Web 版式 —— 打开文档自动切到 Web 版式，正文铺满不分页。
6. 快速创建文档 —— 顶栏加号按钮，一键新建智能文档。

【隐私】

所有功能都在你的浏览器本地完成：不采集、不上传、不联网。插件没有自己的服务器，数据不出本机。
开源，代码公开可审计。

官网：https://fableai.github.io/WecomBetter/
隐私政策：https://fableai.github.io/WecomBetter/privacy.html
问题反馈：https://github.com/fableai/WecomBetter/issues
```

## Full Description (English)

```
Makes WeCom Docs a little better.

WecomBetter is a browser extension that enhances WeCom Docs (doc.weixin.qq.com). It works automatically the moment you open a doc — no signup, no configuration.

Six small quality-of-life features:

1. Top-bar quick search — search from the top bar on smart docs and docs, with instant suggestions. No more going back to the home page.
2. Who's-here avatars — see who's viewing right now, stacked in the top bar. Hover for names, click to copy member IDs.
3. Referenced docs — scroll to the end and every doc linked in the page is listed automatically.
4. Title meta — creator and last-edited time right under the title, no detail panel needed.
5. Web layout by default — docs open in the full-width Web layout instead of paginated view.
6. Quick create — a plus button in the top bar creates a smart doc in one click.

Privacy:

Everything runs locally in your browser: no collection, no upload, no network calls. We run no servers — your data never leaves your machine. Open source and auditable.

Website: https://fableai.github.io/WecomBetter/
Privacy policy: https://fableai.github.io/WecomBetter/privacy.html
Feedback: https://github.com/fableai/WecomBetter/issues
```

## 提交流程

### 方式 A：后台手动（推荐，一次性）

1. 打开 https://chrome.google.com/webstore/devconsole ，进入「企微搭子」
2. **软件包** → 上传 `releases/wecombetter-1.0.5.zip`
3. **商店商品详情** → 图形资源里替换 5 张截图（`store-shots/0*.png`）
4. 粘贴上面的简短描述与完整描述
5. 提交审核

### 方式 B：Chrome Web Store API（可脚本化）

需要先在 Google Cloud Console 建好 OAuth 客户端（Chrome Web Store API  scope：
`https://www.googleapis.com/auth/chromewebstore`），拿到 refresh token 后：

```bash
export CWS_CLIENT_ID=...
export CWS_CLIENT_SECRET=...
export CWS_REFRESH_TOKEN=...
./scripts/upload-store.sh releases/wecombetter-1.0.5.zip
```

默认发布到 stable 通道；如需先提审不发布，加 `--draft` 只上传不发布。
