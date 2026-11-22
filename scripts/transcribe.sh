#!/usr/bin/env bash
# Transcribe with word-level timestamps.  Usage: scripts/transcribe.sh <media> [model] [language]
# Writes transcripts/<name>.json (words + timings), .srt and .txt. Models: tiny base small medium large-v3 turbo
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
in=${1:?usage: scripts/transcribe.sh <media> [model] [language]}; model=${2:-small}
lang=(); [ -n "${3:-}" ] && lang=(--language "$3")
"$root/.venv/bin/whisper" "$in" --model "$model" --word_timestamps True "${lang[@]}" \
  --output_format all --output_dir "$root/transcripts" --verbose False
echo "-> $root/transcripts/$(basename "${in%.*}").json"
