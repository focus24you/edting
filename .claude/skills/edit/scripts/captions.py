#!/usr/bin/env python3
"""Whisper JSON (word timestamps) -> captions-data.js for the captions template.

usage: captions.py <transcripts/x.json> <projects/name> [--max-words 3] [--max-chars 18] [--gap 0.6]
"""
import argparse, json, pathlib, re

ap = argparse.ArgumentParser()
ap.add_argument("transcript"); ap.add_argument("project")
ap.add_argument("--max-words", type=int, default=3)
ap.add_argument("--max-chars", type=int, default=18)
ap.add_argument("--gap", type=float, default=0.6, help="pause in seconds that forces a new group")
a = ap.parse_args()

words = [w for seg in json.load(open(a.transcript))["segments"] for w in seg.get("words", [])]
if not words:
    raise SystemExit("No word timestamps: transcribe with scripts/transcribe.sh (uses --word_timestamps True).")

groups, cur = [], []
def flush():
    global cur
    if cur:
        groups.append(cur); cur = []
for w in words:
    raw = w["word"].strip()
    t = re.sub(r"[^\w\s'’%€$&+\-/]", "", raw).strip()   # captions carry no punctuation
    if not t:
        continue
    if cur and (w["start"] - cur[-1]["end"] > a.gap or len(cur) >= a.max_words
                or len(" ".join(x["t"] for x in cur)) + 1 + len(t) > a.max_chars):
        flush()
    cur.append({"t": t, "start": round(w["start"], 3), "end": round(w["end"], 3)})
    if re.search(r"[.!?,;:]$", raw):   # sentence or clause ends: never run a group across it
        flush()
flush()

out = []
for i, g in enumerate(groups):
    end = g[-1]["end"] + 0.5
    if i + 1 < len(groups):
        end = min(end, groups[i + 1][0]["start"])
    out.append({"start": g[0]["start"], "end": round(max(end, g[-1]["end"]), 3), "words": g})

dst = pathlib.Path(a.project) / "captions-data.js"
dst.write_text("window.EDIT_CAPTIONS = " + json.dumps({"groups": out}, ensure_ascii=False) + ";\n")
print(f"{len(out)} caption groups -> {dst}")
