#!/usr/bin/env bash
# Verifies every studio tool is installed and runnable.
cd "$(dirname "$0")/.."
ok=0
check() { if out=$("${@:2}" 2>&1 | head -1); then echo "ok   $1  $out"; else echo "FAIL $1"; ok=1; fi; }
check ffmpeg      ffmpeg -version
check ffprobe     ffprobe -version
check yt-dlp      .venv/bin/yt-dlp --version
check whisper     .venv/bin/python -c "import whisper,torch;print('whisper',whisper.__version__,'torch',torch.__version__)"
check hyperframes npx --no-install hyperframes --version
exit $ok
