#!/usr/bin/env bash
# Download a video.  Usage: scripts/dl.sh <url> [ref|raw] [extra yt-dlp args]
#   ref (default) -> references/   raw -> raw/downloads/
set -euo pipefail
cd "$(dirname "$0")/.."
url=${1:?usage: scripts/dl.sh <url> [ref|raw] [yt-dlp args]}; kind=${2:-ref}; shift; shift || true
[ "$kind" = raw ] && out=raw/downloads || out=references
cookies=(); [ -f cookies.txt ] && cookies=(--cookies cookies.txt)
.venv/bin/yt-dlp --js-runtimes node "${cookies[@]}" \
  -f "bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[height<=1080]/b" --merge-output-format mp4 \
  --restrict-filenames -o "$out/%(title).60s-%(id)s.%(ext)s" "$@" "$url"
