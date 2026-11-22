# Edit studio

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
