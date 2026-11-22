#!/usr/bin/env bash
# Create projects/<name> from the studio skeleton (brand + all scene templates).
# usage: new-project.sh <name> [landscape|portrait] [main-video]
set -euo pipefail
skill="$(cd "$(dirname "$0")/.." && pwd)"; root="$(cd "$skill/../../.." && pwd)"
name=${1:?usage: new-project.sh <name> [landscape|portrait] [main-video]}; shape=${2:-landscape}; video=${3:-}
case "$shape" in landscape) W=1920; H=1080;; portrait) W=1080; H=1920;; *) echo "shape must be landscape or portrait"; exit 1;; esac
dst="$root/projects/$name"; [ -e "$dst" ] && { echo "$dst already exists"; exit 1; }
mkdir -p "$dst/media"; cp -R "$skill/studio/." "$dst/"
sed -i.bak "s/data-width=\"1920\" data-height=\"1080\"/data-width=\"$W\" data-height=\"$H\"/" "$dst"/compositions/*.html && rm "$dst"/compositions/*.bak
echo 'window.EDIT_CAPTIONS = { groups: [] };' > "$dst/captions-data.js"
dur=10; vid=""
if [ -n "$video" ]; then
  cp "$video" "$dst/media/main.mp4"
  dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$video" | awk '{printf "%.2f", $1}')
  vid="      <video id=\"main-video\" class=\"clip edit-full\" src=\"media/main.mp4\" data-start=\"0\" data-duration=\"$dur\" data-has-audio=\"true\" data-track-index=\"0\"></video>"
fi
ver=$(cd "$root" && node -p "require('hyperframes/package.json').version" 2>/dev/null || echo latest)
cat > "$dst/index.html" <<HTML
<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=$W, height=$H" />
    <link rel="stylesheet" href="brand/brand.css" />
    <link rel="stylesheet" href="brand/edit.css" />
    <script src="brand/gsap.min.js"></script>
    <style>
      html, body { width: ${W}px; height: ${H}px; background: var(--bg); }
      #film { position: relative; width: ${W}px; height: ${H}px; overflow: hidden; }
    </style>
  </head>
  <body>
    <div id="film" data-composition-id="main" data-start="0" data-duration="$dur" data-width="$W" data-height="$H">
$vid
      <!-- SCENES: paste scene snippets from the edit skill here (later in the file = on top) -->

      <div id="captions-main" class="layer" data-composition-id="captions-main" data-composition-src="compositions/captions.html" data-start="0" data-duration="$dur" data-track-index="9"></div>
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      window.__timelines["main"] = gsap.timeline({ paused: true });
    </script>
  </body>
</html>
HTML
cat > "$dst/hyperframes.json" <<JSON
{
  "\$schema": "https://hyperframes.heygen.com/schema/hyperframes.json",
  "registry": "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry",
  "paths": { "blocks": "compositions", "components": "compositions/components", "assets": "assets" },
  "media": { "autoProxy": true }
}
JSON
echo "{ \"id\": \"$name\", \"name\": \"$name\" }" > "$dst/meta.json"
cat > "$dst/package.json" <<JSON
{
  "name": "$name",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "npx --prefix ../.. hyperframes preview",
    "check": "npx --prefix ../.. hyperframes check",
    "render": "npx --prefix ../.. hyperframes render"
  }
}
JSON
echo "created $dst (${W}x${H}, ${dur}s, hyperframes $ver)"
