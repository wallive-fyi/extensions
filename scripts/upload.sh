#!/bin/bash
# Uploads a build to the store's host: each new zip under a/, the media, then index.json and index.json.sig last, so a
# Mac that reads the new index finds every zip it names.
#
#   scripts/upload.sh <build dir>
#
# A version's zip is not written over: one the host serves fails the job (build.py refuses a changed folder
# at a served version; this is the second guard, against a previous index that missed it).
#
# The host is the R2 bucket STORE_BUCKET, served with Cloudflare's CDN at STORE_HOST (store.wallive.fyi). The upload
# token is a Cloudflare API token with R2 write on that bucket, in the account CLOUDFLARE_ACCOUNT_ID. The index is
# cached for 60 s, so a Mac reads a new one within a minute of the upload; a zip's path names its version, so it is
# cached as immutable.
set -euo pipefail

build="${1:?usage: upload.sh <build dir>}"
: "${STORE_HOST:?STORE_HOST is not set: the store has no host, so nothing is uploaded.}"
: "${STORE_UPLOAD_TOKEN:?STORE_UPLOAD_TOKEN is not set: the publish environment holds no upload token yet.}"
: "${STORE_BUCKET:?STORE_BUCKET is not set: the repository variable names the R2 bucket.}"
: "${CLOUDFLARE_ACCOUNT_ID:?CLOUDFLARE_ACCOUNT_ID is not set: the repository variable names the Cloudflare account.}"

put() {
    local cache="public, max-age=31536000, immutable" type
    case "$1" in index.json | index.json.sig) cache="public, max-age=60" ;; esac
    case "$1" in
        *.json) type=application/json ;;
        *.sig) type="text/plain; charset=utf-8" ;;
        *.zip) type=application/zip ;;
        *.png) type=image/png ;;
        *.jpg | *.jpeg) type=image/jpeg ;;
        *.webp) type=image/webp ;;
        *.gif) type=image/gif ;;
        *.mp4) type=video/mp4 ;;
        *) type=application/octet-stream ;;
    esac
    CLOUDFLARE_API_TOKEN="$STORE_UPLOAD_TOKEN" npx --yes wrangler@4.107.0 r2 object put "$STORE_BUCKET/$1" \
        --file "$1" --remote --cache-control "$cache" --content-type "$type"
}

served() {
    [ "$(curl -s -o /dev/null -w '%{http_code}' --head "https://$STORE_HOST/$1")" = 200 ]
}

cd "$build"
find a -name '*.zip' | sort | while read -r zip; do
    if served "$zip"; then
        echo "error: https://$STORE_HOST/$zip is served; a published version is not written over." >&2
        exit 1
    fi
    put "$zip"
done
find media -type f | sort | while read -r file; do put "$file"; done
put index.json
put index.json.sig
