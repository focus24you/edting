# Edit studio

## Studio UI

```bash
bash scripts/setup.sh   # once
npm run studio          # then open http://localhost:4747
```

Drop a video (or paste a link): it is normalized, optionally silence-trimmed, transcribed and
captioned. Then place scenes on the timeline, fix caption words, render a draft or final MP4.
Everything stays on your machine; the server only listens on localhost.

A Claude Code video editing studio.

| Tool | Job | Run |
|---|---|---|
| Whisper | transcripts with word timings | `scripts/transcribe.sh <media> [model] [lang]` |
| yt-dlp | download reference / source videos | `scripts/dl.sh <url> [ref\|raw]` |
| HyperFrames | motion graphics (HTML -> MP4) | `npx hyperframes <command>` |
| ffmpeg | cutting, concat, audio, export | `ffmpeg` / `ffprobe` |

First time (or in a fresh container): `bash scripts/setup.sh`. Check health: `bash scripts/doctor.sh`.

## Folders

- `raw/footage/` your own recordings, `raw/downloads/` downloaded source clips
- `references/` reference videos, sorted into `keep/` and `kill/`
- `transcripts/` Whisper output
- `projects/<name>/` one HyperFrames project per video
- `assets/` fonts, music, sfx, logos
- `exports/` finished videos

Media files are git-ignored: only code, templates and settings are committed.

YouTube blocks downloads from cloud servers ("confirm you're not a bot"). Export your
browser cookies to `cookies.txt` in this folder (git-ignored) and `scripts/dl.sh` uses them,
or run the download on your own computer.

## The `edit` skill

`/edit` (in `.claude/skills/edit/`) holds the whole workflow plus 12 scene templates in the brand
colors and fonts: captions, title card, chapter card, lower third, callout, list, stat, quote,
screen frame, split screen, picture-in-picture, end card. Colors and fonts live in one file:
`.claude/skills/edit/studio/brand/brand.css`.
