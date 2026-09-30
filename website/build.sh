#!/bin/bash
# 组装官网：把 sections/*.html 片段拼进 index.html。改动片段后重跑本脚本即可。
set -euo pipefail
cd "$(dirname "$0")"

cat > index.html <<'HEAD'
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>WecomBetter 企微搭子 — 让企微文档，好用那么一点</title>
  <meta name="description" content="企业微信文档 Chrome 扩展：顶栏快捷搜索、在看头像、关联文档、标题作者时间、默认 Web 版式、快速创建。免费开源，数据不出本机。" />
  <link rel="icon" type="image/png" href="assets/icon48.png" />
  <link rel="stylesheet" href="css/base.css" />
  <link rel="stylesheet" href="css/hero.css" />
  <link rel="stylesheet" href="css/features.css" />
  <link rel="stylesheet" href="css/closing.css" />
</head>
<body>
HEAD

cat sections/nav-hero.html >> index.html
printf '\n' >> index.html
cat sections/features.html >> index.html
printf '\n' >> index.html
cat sections/closing.html >> index.html

cat >> index.html <<'FOOT'
<script src="js/main.js" defer></script>
<script src="js/hero.js" defer></script>
<script src="js/features.js" defer></script>
<script src="js/closing.js" defer></script>
</body>
</html>
FOOT

echo "index.html 组装完成：$(wc -l < index.html) 行"
