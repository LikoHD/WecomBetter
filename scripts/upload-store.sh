#!/bin/bash
# 上传扩展 zip 到 Chrome Web Store 并发布（或仅上传待审）。
# 用法：
#   export CWS_CLIENT_ID=... CWS_CLIENT_SECRET=... CWS_REFRESH_TOKEN=...
#   ./scripts/upload-store.sh <zip> [--draft]
set -euo pipefail

ZIP="${1:?usage: upload-store.sh <zip> [--draft]}"
DRAFT="${2:-}"
EXT_ID="hdekdcibebjbealobngklalnghfnjnoi"
SCOPE="https://www.googleapis.com/auth/chromewebstore"

for V in CWS_CLIENT_ID CWS_CLIENT_SECRET CWS_REFRESH_TOKEN; do
  [ -n "${!V:-}" ] || { echo "missing env: $V" >&2; exit 1; }
done
[ -f "$ZIP" ] || { echo "zip not found: $ZIP" >&2; exit 1; }

TOKEN=$(curl -sf https://oauth2.googleapis.com/token \
  -d "client_id=$CWS_CLIENT_ID&client_secret=$CWS_CLIENT_SECRET" \
  -d "refresh_token=$CWS_REFRESH_TOKEN&grant_type=refresh_token" | \
  python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')

echo ">> uploading $ZIP ..."
curl -sf -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-goog-api-version: 2" \
  -T "$ZIP" \
  "https://www.googleapis.com/upload/chromewebstore/v1.1/items/$EXT_ID"
echo

if [ "$DRAFT" = "--draft" ]; then
  echo ">> draft uploaded (not published)."
else
  echo ">> publishing to default (stable) channel ..."
  curl -sf -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -H "x-goog-api-version: 2" \
    -H "Content-Length: 0" \
    "https://www.googleapis.com/chromewebstore/v1.1/items/$EXT_ID/publish"
  echo
fi
