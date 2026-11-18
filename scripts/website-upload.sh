#!/usr/bin/env bash
# Uploads website files to amlsync.com (Hostinger public_html) via the Hostinger API (TUS).
# Usage: scripts/website-upload.sh file…   (paths relative to website/public_html)
# The Hostinger API token is injected by the session's network proxy; upload keys are short-lived
# and are never printed.
set -euo pipefail
cd "$(dirname "$0")/../website/public_html"
R=$(curl -sS -X POST https://developers.hostinger.com/api/hosting/v1/files/upload-urls \
  -H "Authorization: Bearer proxy-injected" -H "content-type: application/json" \
  -d '{"username":"u462915833","domain":"amlsync.com"}')
URL=$(echo "$R" | python3 -c "import json,sys; print(json.load(sys.stdin)['url'])")
AK=$(echo "$R" | python3 -c "import json,sys; print(json.load(sys.stdin)['auth_key'])")
RK=$(echo "$R" | python3 -c "import json,sys; print(json.load(sys.stdin)['rest_auth_key'])")
echo "upload host: $(echo "$URL" | sed -E 's#https?://([^/]+).*#\1#')"
for f in "$@"; do
  size=$(stat -c%s "$f")
  c=$(curl -sS -o /dev/null -w "%{http_code}" -X POST "$URL/$f?override=true" -H "X-Auth: $AK" -H "X-Auth-Rest: $RK" \
      -H "Tus-Resumable: 1.0.0" -H "Upload-Length: $size" -H "Upload-Offset: 0")
  p=$(curl -sS -o /dev/null -w "%{http_code}" -X PATCH "$URL/$f?override=true" -H "X-Auth: $AK" -H "X-Auth-Rest: $RK" \
      -H "Tus-Resumable: 1.0.0" -H "Content-Type: application/offset+octet-stream" -H "Upload-Offset: 0" --data-binary "@$f")
  echo "$f ($size bytes): create $c, upload $p"
done
