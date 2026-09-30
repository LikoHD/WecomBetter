# WecomBetter 官网视觉规范（Dia 风格 · 晨光编辑部）

> 参考源：diabrowser.com（The Browser Company）。本文件是官网实现的**唯一事实源**，
> 所有 builder 动工前必须通读。任何拿不准的值，先查本文件；本文件没有的，补回本文件再实现。

## 0. 设计概念

**「晨光里的文档搭子」**。Dia 把浏览器包装成"一天的开始"，WecomBetter 把企微文档包装成"一天工作的顺手的开始"。
暖奶油纸面 + 日出金 Canvas 天空 + 高对比衬线中文大标题，工具产品做出杂志晨报的编辑感。

氛围关键词：温暖、晴朗、克制、编辑感（editorial）、精致、俏皮但不吵闹。

一句话原则：**热闹留给 hero，其余全部安静。**

## 1. 色板（CSS 变量见 `css/tokens.css`，值以本表为准）

| 变量 | 值 | 用途 |
|---|---|---|
| `--paper` | `#FBFAF6` | 页面主背景（暖奶油白，**绝不用纯白**，这是灵魂） |
| `--paper-soft` | `#F8F8F8` | 导航胶囊底、黑按钮上的文字 |
| `--ink` | `rgba(0,0,0,0.85)` | 主文字 |
| `--ink-2` | `rgba(0,0,0,0.60)` | 次要文字 |
| `--ink-3` | `rgba(0,0,0,0.45)` | 三级文字、未激活态、eyebrow |
| `--stroke` | `rgba(0,0,0,0.10)` | 卡片/分隔细描边 |
| `--fill` | `rgba(0,0,0,0.05)` | chips、hover 浅填充 |
| `--btn` | `#000000` | 主按钮填充（全站唯一高纯度色块） |
| `--gold` | `#FFB005` | 日出金：hero 天空、贴纸、小面积点缀 |
| `--gold-deep` | `#ECB826` | hero 天空深色段 |
| `--glow` | `#FFE48C` | hero 中央光晕 |
| `--wecom` | `#267EF0` | 企微品牌蓝：**只出现在产品 UI 示意与小面积点缀**，不做大面积色块 |
| `--sunset` | `#FF6F3C` | 金色天空向地平线过渡的暖橙 |

天空渐变（hero canvas 用）：顶部 `#FFCB30` → 中段 `#ECB826` → 地平线 `#FF6F3C`（带 30% 透明），中央椭圆光晕 `#FFE48C` blur 40px。

## 2. 字体系统

**SF 优先，全站 Apple 原生字体栈，零外部字体依赖。**

| 角色 | font-family 栈 | 用法 |
|---|---|---|
| Display | `-apple-system, "SF Pro Display", "PingFang SC", sans-serif` | 情感大标题：hero 44~56px/1.15/w600/`letter-spacing:-0.03em`；section 标题 40~48px/1.2/w600/ls -0.03em；卡片标题 20~22px/w600 |
| Body | `-apple-system, "SF Pro Text", "PingFang SC", sans-serif` | 正文 17~19px/1.7；导航 16px/w400 + opacity 0.7；按钮 20px/w400 |
| Mono | `ui-monospace, "SF Mono", "Menlo", monospace` | eyebrow 标签、编号、页脚栏目：12~13px、**全大写、`letter-spacing:+0.1em`**、色 `--ink-3` |
| 手写 | `"Bradley Hand", "Segoe Print", cursive` | 金色星形贴纸内文字，20~24px |

排版铁律：**大标题一律负字距收紧，mono 一律大写加宽字距**——一松一紧是对比的核心。
精致度要点：黑按钮上的文字用 **w400 细字重**，粗体按钮文字是廉价感的来源。

## 3. 布局

- 内容最大宽度 `1120px`；hero 与页脚近全幅（两侧 20px 边距）
- 垂直节奏极松弛：section 内边距 `120px` 上下
- **签名式分隔：超大椭圆拱**——`border-radius:50% 50% 0 0 / 100% 100% 0 0`、宽 140vw、左移 -20vw、高 160px 的 `--paper` 色椭圆，像地平线一样从 hero 底部拱起；后续深色/浅色 section 交替处可复用
- 栅格：bento 区 2~3 列等宽，gap 20px；1440px 视口下内容左缘 ≈160px

## 4. 组件规范（v2 · 按 Dia 实测像素级精修）

- **主按钮（下载 CTA 规格，实测自 Dia 的 sunrise-cta-pill）**：纯 `#000` 平涂（**静止态零阴影**，连 alpha 0 的阴影都不要预设）+ `#F8F8F8` 文字 **20px/w400**、radius 999px、高 56px、padding `0 24px`、内嵌 14×17 下箭头图标（opacity .8，gap 10px）。hover：`scale(1.02)` + 三层阴影慢淡入（`inset 0 1px 0 rgba(255,255,255,.18)` + `0 2px 4px rgba(0,0,0,.16)` + `0 18px 40px -10px rgba(0,0,0,.34)`）；active：`scale(0.98)`。过渡：transform .22s、box-shadow .42s，缓动 `cubic-bezier(.22,1,.36,1)`。按钮下 16px 配说明小字：14px、`rgba(0,0,0,0.5)`、居中
- **次级按钮**：`--fill` 浅灰胶囊 + 黑字；hover 200ms 背景微变
- **导航**（实测 Dia）：顶部居中悬浮胶囊，`top:28px`、高 52px、**不透明 `#F8F8F8`** + `backdrop-filter:blur(12px)` + **1px rgba(0,0,0,0.08) 描边** + 双层微阴影（`0 2px 8px rgba(0,0,0,.06)` + `0 0 2px rgba(0,0,0,.04)`）、radius 16px、padding `0 24px 0 6px`（logo 贴左）。链接 16px 纯黑 **opacity 0.7**。**滚动后不做任何变化**
- **卡片**：透明/奶油底 + 1px `--stroke` 细描边 + 大圆角 24px，padding 32px。结构 = mono 大写 eyebrow → 标题 → `--ink-2` 正文 → 底部出血的 UI 示意图
- **编号列表**：mono 小号 `01/02/03`，激活项 `--ink` + 左侧 2px 黑竖线，未激活 `--ink-3`
- **chips**：浅灰圆角胶囊（`--fill` + radius 999px，13px），用于 marquee 滚动条
- **装饰**：金色星形爆炸贴纸（旋转 -8deg）+ 手写体字；虚线点状描边大框（`stroke-dasharray:1 6`）框住「隐私」区——克制的小面积俏皮

## 5. 动效规范（Motion Graphics —— 本站的高级感全在这里）

全局缓动（tokens.css 已定义）：
- `--ease-dia: cubic-bezier(.87,0,.13,1)` —— 先急后稳的戏剧化缓动，用于大 reveal
- `--ease-out: cubic-bezier(.22,1,.36,1)` —— 常规入场
- 时长：hover 200ms / 常规过渡 350ms / 入场 reveal 800ms / hero 编排 1200ms

**M1 · Hero 日出天空（签名动效，v2 按 Dia 实测重做）**
不做纵向渐变。三层叠加结构：
1. 平底色 `#FFCB30`
2. canvas 动态云层：大块径向渐变斑块，深云影 `#D8A723`、亮云 `#EDBC31`、光晕奶油 `#FFF7D8`；中央偏下是一条**横向"日带"亮区**（太阳低垂在地平线的辉光，不是顶部光源），四角轻微压暗（暗角感）；动画是**极缓慢的形态蠕动（无平移）**——2 秒帧差几乎不可察觉
3. hero 底部 20px 棕色微渐变压底：`linear-gradient(0deg, rgba(91,63,8,0.08), transparent)`
收尾靠奶油色椭圆拱从下一屏盖上来。`prefers-reduced-motion` 时静态一帧；出视口暂停 rAF。

**M1.5 · Hero 等比缩放体系（实测自 Dia）**
hero 区所有尺寸挂在 `--s: min(100vw/1440, 100svh/854)` 上等比缩放（`calc(N * var(--s))`），任何视口构图不走样，不写手写断点。hero 高 100svh（min 640px），overflow hidden。

**M2 · 页面加载编排（一次精心编排的入场胜过一堆零散微交互）**
导航从 -16px 淡入（200ms）→ hero eyebrow 淡入（300ms 起）→ 主标题逐行上移淡入（每行 stagger 90ms，ease-dia，800ms）→ 副标题与 CTA（再 +180ms）→ hero 底部的文档窗口示意图上浮 24px 淡入（最后，1000ms）。

**M3 · 滚动触发 reveal**
所有 section 内容块：`opacity 0 → 1` + `translateY(28px) → 0`，800ms，ease-dia，进入视口 15% 触发一次不重播。同组元素 stagger 80ms。JS 用 IntersectionObserver，`.reveal` → `.is-in`。

**M4 · 功能编号列表 × sticky 演示窗（核心交互）**
左侧 01/02/03 编号列表，右侧 sticky 的模拟企微文档窗口。滚动经过每个编号项时：列表激活态切换（竖线 + 颜色，300ms），右侧窗口内容交叉淡入切换（旧 `opacity→0 translateY(-12px)` 250ms，新 `0→1 translateY(12px→0)` 400ms）。判定：每项视口中心线通过即激活。

**M4.5 · Hero 窗口反向视差（实测自 Dia）**
hero 内的标题/天空随滚动 1:1 上移（无视差）；唯独模拟文档窗口额外 `translateY = -0.35 × scrollY`，**封顶 -140px**——窗口先于内容离场，制造构图张力。reduced-motion 时关闭。

**M5 · 产品 UI 示意窗内循环动效（motion designer 的秀场）**
每个功能演示窗是一个 5~6s 循环的微型动画（纯 CSS/JS，不用视频）：
- 快捷搜索：光标点击搜索框 → 逐字打出「周报模板」（80ms/字）→ 建议列表逐条浮现（stagger 60ms）→ 停顿 1.2s → 淡出循环
- 在看头像：3 个头像依次从右侧弹入堆叠（scale .5→1，回弹 `cubic-bezier(.34,1.56,.64,1)`）→ hover 态浮现名字 tooltip → 循环
- 关联文档：文档内容向上滚动 → 滚到文末 → 「本文引用」卡片逐张滑入 → 循环
窗口带 macOS 三色灯与 12px 圆角，底 1px `--stroke` 描边 + 极浅投影。

**M6 · Marquee 无限滚动条**
hero 下方一条 chips marquee：「顶栏快捷搜索 · 在看头像 · 关联文档 · 标题作者时间 · 默认 Web 版式 · 快速创建 · 本地运行 · 不上传数据 …」横向无限循环，40s 一圈，线性匀速，hover 暂停（`animation-play-state`）。

**M7 · 页尾 CTA 椭圆日出**
结尾区底部升起半个金色椭圆「太阳」（radial-gradient + blur），随滚动从 translateY(60px) 浮到 0，配合「即刻使用」大标题——呼应 hero 的日出，完成叙事闭环。

**M8 · 微交互纪律**
hover 永远只做 200ms 颜色过渡，无位移无阴影变化（贴纸除外，可 -8deg → 0deg 轻旋）。
链接下划线用 `background-size` 动画（0%→100%，250ms）。
`prefers-reduced-motion: reduce` 时：关闭 canvas 动画/粒子/marquee/视差，reveal 改为直接显示。

## 6. Section 拓扑与文案（逐字文案，builder 不得改写）

页面：`website/index.html`，中文，`<html lang="zh-CN">`。

**S0 导航**（极简，对齐 Dia 的克制）：logo 圆标（`assets/icon48.png`）+「企微搭子」——不放链接、不放 CTA，全部交给 hero 与页尾

**S1 Hero**（天空上的文字全部白色系，实测 Dia 即白字金字）
- 主标题（纯白 `#FFF`，两行，text-wrap: balance）：`让企微文档，` / `好用那么一点。`
- CTA：**下载样式黑胶囊「免费下载」**（带下箭头图标，href = Chrome Web Store 正式地址）+ 次级「查看功能」(#features)
- 底部：模拟企微文档窗口（M5 搜索动效默认播），**上缘与上方内容做重叠构图**（负 margin 压上去），滚动走 M4.5 反向视差
- 右上装饰：金色星形贴纸（链接到 CWS）+ 深色手写字（金字天上用 `rgba(0,0,0,0.75)` 保对比）

**S2 Marquee**（M6，无标题）

**S3 功能·编号列表**（M4+M5，sticky）
- eyebrow `FEATURES` + 标题 `六个功能，一个比一个顺手。`
- 01 顶栏快捷搜索 / `智能文档、文档顶栏都有搜索框。输入即出建议列表，不用再先回首页。`
- 02 正在查看头像 / `顶栏堆叠此刻在看的人。hover 看名字，点击复制 ID——协作前先知道谁在场。`
- 03 本文关联文档 / `滚到文末，自动列出文内引用的所有文档。顺藤摸瓜，不用翻来翻去。`

**S4 功能·bento 网格**（2×2 或 3 列卡片，各带小型静态/微动态示意）
- eyebrow `MORE` + 标题 `还有这些。`
- 标题作者与时间：`标题下面直接显示创建人和最后编辑时间，不用点开详情页。`
- 默认 Web 版式：`打开文档自动切到 Web 版式，正文铺满不分页。`
- 快速创建文档：`顶栏加号按钮，一键新建智能文档。`
- 隐私卡（虚线点状框 + 锁图标）：`本地运行，零上传` / `所有功能都在你的浏览器里完成。不采集、不上传、不联网。源码就在 GitHub 上。`

**S5 安装**（三步）
- eyebrow `INSTALL` + 标题 `三分钟，装好。`
- 步骤卡 01 `下载源码`：`GitHub 克隆或下载 ZIP，解压到任意目录。`
- 步骤卡 02 `加载扩展`：`Chrome 打开 chrome://extensions，开「开发者模式」，「加载已解压的扩展程序」。`
- 步骤卡 03 `打开文档`：`访问任意 doc.weixin.qq.com 文档，功能自动生效。`

**S6 页尾 CTA + 日出**（M7）
- 大标题 `即刻使用。`
- 副标题 `明天的第一份文档，顺手一点。`
- **下载样式黑胶囊「免费下载」**（带下箭头图标，href = Chrome Web Store 正式地址）+ 说明小字（14px `rgba(0,0,0,0.5)`）：`解压后加载到 Chrome · 免费开源`

**S7 页脚**：mono 大写四列（功能 / 安装 / 源码 / 隐私）+ 版权行 `© 2026 WeCOMBETTER · 企微搭子`

## 7. 工程约定

- 纯静态：HTML + CSS + 原生 JS，无框架无构建。各 section 先写成 `sections/*.html` 片段 + 独立 `css/*.css`，最后由工头组装进 `index.html`
- 类名约定：工具类 `.container` `.eyebrow` `.btn` `.btn-ghost` `.reveal`（base.css 提供）；section 私有类以 section 名做前缀（如 `.hero-` `.feat-` `.bento-`）
- 每个 section 的 CSS/JS 只写自己前缀的选择器，**禁止改他人文件，禁止改 tokens/base**
- 图标资产从仓库 `icons/`、`assets/official/` 拷贝到 `website/assets/`
- 字体：**全站 Apple 原生字体栈（SF Pro Display / SF Pro Text / SF Mono / Bradley Hand），零外部字体请求**，非 Apple 平台自动落到 PingFang SC / Menlo / 系统黑体
- 响应式断点：960px / 640px。移动端：sticky 列表改纵向堆叠，bento 改单列，hero 标题 34px
