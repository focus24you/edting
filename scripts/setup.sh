#!/usr/bin/env bash
# Installs the studio toolchain. Safe to re-run.
set -euo pipefail
cd "$(dirname "$0")/.."

command -v ffmpeg >/dev/null || { echo "ffmpeg missing: install it first (apt-get install -y ffmpeg / brew install ffmpeg)"; exit 1; }

# Python tools: Whisper (transcription) + yt-dlp (downloads) in a local venv
if command -v uv >/dev/null; then
  [ -d .venv ] || uv venv .venv --python 3.12
  PIP="uv pip install --python .venv/bin/python"
else
  [ -d .venv ] || python3 -m venv .venv
  PIP=".venv/bin/pip install"
fi
if [ "$(uname)" = "Linux" ] && ! command -v nvidia-smi >/dev/null; then
  # CPU-only torch: avoids ~5 GB of unused CUDA libraries
  $PIP torch --index-url https://download.pytorch.org/whl/cpu
fi
$PIP -U openai-whisper "yt-dlp[default]"

# HyperFrames (motion graphics: HTML -> MP4)
npm install --no-fund --no-audit hyperframes@latest

bash scripts/doctor.sh
