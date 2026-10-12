#!/usr/bin/env bash
# 打包 Chrome 扩展发布产物到 releases/，只含运行时文件（不含 docs / website / tests 等）。
#
# 产出（每次只保留当前版本这一份）：
#   releases/wecombetter-<version>.zip      上传 Chrome 应用商店用
#   releases/wecombetter-unpacked/          chrome://extensions → 加载已解压的扩展程序（固定路径，便于「重新加载」）
#
# 用法：
#   bash scripts/release.sh                  # 重新构建 + 重新打包
#   bash scripts/release.sh --if-changed     # 源码没变化就跳过（hook 用）
#   bash scripts/release.sh --no-build       # 不跑 esbuild，复用现有 dist/ 只重新打包
#   bash scripts/release.sh --hook           # hook 模式：日志走 stderr，stdout 只输出 {}
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

RELEASES="$ROOT/releases"
UNPACKED="$RELEASES/wecombetter-unpacked"
STAMP="$RELEASES/.pack-stamp"

DO_BUILD=1
IF_CHANGED=0
HOOK_MODE=0

for arg in "$@"; do
  case "$arg" in
    --if-changed) IF_CHANGED=1 ;;
    --no-build)   DO_BUILD=0 ;;
    --hook)       HOOK_MODE=1 ;;
    -h|--help)    sed -n '2,15p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "unknown arg: $arg" >&2; exit 2 ;;
  esac
done

log() { if [ "$HOOK_MODE" = 1 ]; then printf '%s\n' "$*" >&2; else printf '%s\n' "$*"; fi; }
die() { printf 'release: %s\n' "$*" >&2; exit 1; }
hook_ok() { [ "$HOOK_MODE" = 1 ] && printf '{}\n'; return 0; }

command -v python3 >/dev/null 2>&1 || die "python3 not found"
[ -f manifest.json ] || die "manifest.json not found (run from the extension repo)"

VERSION="$(python3 -c 'import json;print(json.load(open("manifest.json"))["version"])')"
[ -n "$VERSION" ] || die "cannot read version from manifest.json"
ZIP="$RELEASES/wecombetter-${VERSION}.zip"

# ---- 构建产物是否最新：只看输入，dist/ 是派生物 ----
fingerprint() {
  { find manifest.json package.json src _locales icons -type f ! -name '.DS_Store' 2>/dev/null | LC_ALL=C sort
    find manifest.json package.json src _locales icons -type f ! -name '.DS_Store' -exec shasum -a 256 {} + 2>/dev/null | LC_ALL=C sort
  } | shasum -a 256 | awk '{print $1}'
}

FP="$(fingerprint)"

if [ "$IF_CHANGED" = 1 ] && [ -f "$STAMP" ] && [ "$(cat "$STAMP")" = "$FP" ] \
   && [ -f "$ZIP" ] && [ -f "$UNPACKED/manifest.json" ]; then
  log "release: no source change since last pack, skip (v$VERSION)"
  hook_ok; exit 0
fi

# ---- 找 npm（hook 环境的 PATH 可能不含 node）----
if [ "$DO_BUILD" = 1 ]; then
  if ! command -v npm >/dev/null 2>&1; then
    for cand in "$HOME"/.workbuddy/binaries/node/versions/*/bin \
                "$HOME"/.nvm/versions/node/*/bin \
                /opt/homebrew/bin /usr/local/bin; do
      if [ -x "$cand/npm" ]; then PATH="$cand:$PATH"; export PATH; break; fi
    done
  fi
  command -v npm >/dev/null 2>&1 || die "npm not found; cannot build"
  log "release: building dist/ ..."
  npm run build >/dev/null || die "npm run build failed"
fi

[ -f dist/page-bridge.iife.js ] || die "missing dist/page-bridge.iife.js"
[ -f dist/content.iife.js ] || die "missing dist/content.iife.js"

# ---- 清理上一版产物：只动 releases 下已知命名的条目 ----
mkdir -p "$RELEASES"
while IFS= read -r entry; do
  [ -n "$entry" ] || continue
  base="$(basename "$entry")"
  case "$base" in
    wecombetter-*.zip|wecombetter-unpacked)
      case "$entry" in
        "$RELEASES"/*) log "release: removing stale $base"; rm -rf -- "$entry" ;;
        *) die "refusing to remove unexpected path: $entry" ;;
      esac
      ;;
  esac
done < <(find "$RELEASES" -mindepth 1 -maxdepth 1 -print)

# ---- 组装可加载目录：manifest 引用到的文件 + 它们相对路径 import 的 ESM 依赖 ----
mkdir -p "$UNPACKED"

python3 - "$UNPACKED" <<'PY'
import json, os, shutil, sys, re, glob

stage = sys.argv[1]
manifest = json.load(open("manifest.json"))
paths = ["manifest.json"]

def add(p):
    if isinstance(p, str) and p and not p.startswith(("http:", "https:", "//", "*")):
        paths.append(p.lstrip("/"))

for v in (manifest.get("icons") or {}).values():
    add(v)
action = manifest.get("action") or manifest.get("browser_action") or {}
for v in (action.get("default_icon") or {}).values():
    add(v)
add(action.get("default_popup"))
add((manifest.get("background") or {}).get("service_worker"))
for cs in manifest.get("content_scripts") or []:
    for p in (cs.get("js") or []) + (cs.get("css") or []):
        add(p)
for war in manifest.get("web_accessible_resources") or []:
    for p in (war.get("resources") or []) if isinstance(war, dict) else []:
        add(p)

missing = [p for p in paths if not os.path.exists(p)]
if missing:
    sys.exit("manifest references missing files: " + ", ".join(missing))

# _locales 整目录（含 default_locale 之外的语言）
if os.path.isdir("_locales"):
    paths.append("_locales")

copied = set()
def copy(src):
    src = os.path.normpath(src)
    if src in copied or not os.path.isfile(src) or os.path.basename(src) == ".DS_Store":
        return
    dst = os.path.join(stage, src)
    os.makedirs(os.path.dirname(dst) or stage, exist_ok=True)
    shutil.copy2(src, dst)
    copied.add(src)

def copy_tree(src):
    for root, dirs, files in os.walk(src):
        dirs[:] = [d for d in dirs if d != ".DS_Store"]
        for f in files:
            if f != ".DS_Store":
                copy(os.path.join(root, f))

for p in sorted(set(paths)):
    if os.path.isdir(p):
        copy_tree(p)
    else:
        copy(p)

# popup 目录：index.html 引用的资源跟着走
if action.get("default_popup"):
    copy_tree(os.path.dirname(action["default_popup"]))

# 传递闭包：stage 里的 ESM 相对 import 也要在包里（popup/service worker 是 module）
rel_import = re.compile(r"""(?:from|import)\s*\(?\s*["'](\.[^"']+)["']""")
for _ in range(5):
    pending = []
    for root, _, files in os.walk(stage):
        for f in files:
            if not f.endswith(".js"):
                continue
            full = os.path.join(root, f)
            rel = os.path.relpath(full, stage)
            for m in rel_import.findall(open(full, encoding="utf-8", errors="ignore").read()):
                target = os.path.normpath(os.path.join(os.path.dirname(rel), m))
                if os.path.isfile(target) and target not in copied:
                    pending.append(target)
    if not pending:
        break
    for p in pending:
        copy(p)
PY

# ---- 自检 ----
[ -f "$UNPACKED/manifest.json" ] || die "manifest.json missing from package (扩展无法加载)"
[ -f "$UNPACKED/dist/content.iife.js" ] || die "dist/content.iife.js missing from package"

while IFS= read -r js; do
  head -c 4096 "$js" | grep -qE '^[[:space:]]*(import|export)[[:space:]]' \
    && die "$js 含顶层 import/export，content script 必须是 IIFE（见 docs/打包注意事项.md）"
done < <(find "$UNPACKED/dist" -name '*.js')

python3 - "$VERSION" <<'PY'
import json, re, sys, os
version = sys.argv[1]
warn = []
pkg = json.load(open("package.json"))
if pkg.get("version") != version:
    warn.append(f"package.json({pkg.get('version')}) != manifest.json({version})")
for f, pat in (("README.md", r"__WECOM_BETTER__[^\n]*?[\"'`](\d+\.\d+\.\d+)"),
               ("src/page-bridge.js", r"__WECOM_BETTER__\s*=\s*[\"'`](\d+\.\d+\.\d+)")):
    if os.path.isfile(f):
        m = re.search(pat, open(f, encoding="utf-8", errors="ignore").read())
        if m and m.group(1) != version:
            warn.append(f"{f}({m.group(1)}) != manifest.json({version})")
for w in warn:
    print("release: WARN version mismatch -> " + w, file=sys.stderr)
PY

# ---- 打 zip：包内以 manifest.json 为根 ----
rm -f "$ZIP"
( cd "$UNPACKED" && zip -r -X -q "$ZIP" . -x '.*' -x '*/.*' ) || die "zip failed"

STAGED=$(find "$UNPACKED" -type f ! -name '.DS_Store' | wc -l | tr -d ' ')
PACKED=$(unzip -Z1 "$ZIP" | grep -vc '/$' || true)
[ "$STAGED" = "$PACKED" ] || die "zip file count mismatch: staged=$STAGED packed=$PACKED"

printf '%s' "$FP" > "$STAMP"

SIZE=$(du -h "$ZIP" | awk '{print $1}')
log "release: v$VERSION ok"
log "  zip      $ZIP  ($SIZE, $PACKED files)"
log "  unpacked $UNPACKED"
hook_ok
