---
name: edit
description: Schneidet und gestaltet Videos in diesem Studio im eigenen Stil - Rohmaterial transkribieren (Whisper), Referenzen laden (yt-dlp), schneiden (ffmpeg) und Motion Graphics aus den 12 Marken-Templates setzen (HyperFrames). Verwenden bei "schneide dieses Video", "mach Captions", "bau einen Titel / Lower Third / Endcard", "/edit" oder jeder anderen Videobearbeitung in diesem Ordner.
---

# edit

Ein Video entsteht hier als HyperFrames-Projekt unter `projects/<name>/`: das geschnittene
Footage als `<video>`, darüber Szenen aus den Templates in `studio/compositions/`.
Alle Pfade unten sind relativ zum Repo-Root; `SK` = `.claude/skills/edit`.

Fehlt `.venv/` oder `node_modules/` (frischer Container): zuerst `bash scripts/setup.sh`.

## Stil (nicht verhandelbar)

- **Farben und Schrift stehen nur in `SK/studio/brand/brand.css`.** Nie Hex-Werte oder
  Schriftnamen in ein Template oder Projekt schreiben; immer `var(--accent)` usw.
  Dunkler Grund `--bg`, heller Text `--text`, genau eine Akzentfarbe `--accent`.
- **Bebas Neue** (`--font-display`, Versalien) für Titel, Zahlen, Captions, Labels auf Flächen.
  **Inter** (`--font-body`) für alles Kleine und Fließtext. Keine dritte Schrift.
- Akzent sparsam: pro Bild höchstens ein Wort bzw. ein Element in Akzentfarbe
  (`*Sternchen*` im Text markieren das Wort).
- Bewegung: Wörter steigen aus ihrer Maske (`EDIT.rise`), Balken und Flächen wischen auf,
  Ease `power4.out`, Einstieg unter 0,7 s, kurzer Fade am Ende. Keine Bounces außer beim
  CTA-Button und Callout-Punkt, keine Verläufe, kein Glow, keine Emojis.
- Größen immer in `calc(var(--u) * N)` (1u = 1px bei 1080 kurzer Kante). Lesetext nie unter 28u.
- Passt keine der 12 Szenen: ein neues Template im selben Muster bauen (siehe unten) statt
  einen Registry-Block von HyperFrames unverändert zu nehmen; die sehen generisch aus.

Ändert der Nutzer Farben oder Schrift: nur `brand.css` (und ggf. Font-Dateien in
`brand/fonts/`) anpassen; bestehende Projekte bekommen die Datei per Kopie nach `projects/<name>/brand/`.

## Ablauf

1. **Material holen.** Eigenes Footage liegt in `raw/footage/`. Download:
   `scripts/dl.sh <url> raw` (Quelle) oder `scripts/dl.sh <url>` (Referenz nach `references/`).
   YouTube blockt Cloud-Server; dann braucht es `cookies.txt` im Repo-Root oder den Download am eigenen Rechner.
2. **Transkribieren.** `scripts/transcribe.sh <datei> small de` schreibt
   `transcripts/<name>.json` (Wort-Zeitstempel), `.srt`, `.txt`. `medium`/`turbo` wenn `small` Fehler macht.
3. **Schnitt planen und schneiden.** Transkript lesen, Versprecher, Wiederholungen und Pausen
   bestimmen (Pausen: `ffmpeg -i in.mp4 -af silencedetect=noise=-35dB:d=0.6 -f null -`).
   Behaltene Bereiche neu kodiert zusammensetzen, nie mit `-c copy` (ungenaue Schnitte):
   ```bash
   ffmpeg -i in.mp4 -filter_complex "[0:v]trim=2.1:9.4,setpts=PTS-STARTPTS[v0];[0:a]atrim=2.1:9.4,asetpts=PTS-STARTPTS[a0];[0:v]trim=12:20.5,setpts=PTS-STARTPTS[v1];[0:a]atrim=12:20.5,asetpts=PTS-STARTPTS[a1];[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]" -map "[v]" -map "[a]" -c:v libx264 -crf 17 -c:a aac -b:a 192k raw/footage/cut.mp4
   ```
   Danach **den Schnitt neu transkribieren**; alle Zeiten ab hier beziehen sich auf `cut.mp4`.
4. **Projekt anlegen.** `node studio/cli.mjs new <name> landscape|portrait raw/footage/cut.mp4`
   kopiert Marke und Templates nach `projects/<name>/` und schreibt `studio.json`.
5. **Captions.** `node studio/cli.mjs captions <name> transcripts/cut.json [maxWords]`
   (Hochformat eher 2). Whisper-Fehler in `studio.json` unter `captions.groups` korrigieren.
6. **Szenen setzen.** Aus dem Transkript ableiten, wo welche Szene hilft, und in
   `studio.json` unter `scenes` eintragen (Format unten), dann `node studio/cli.mjs build <name>`.
   `index.html` und `captions-data.js` sind **generiert**: nie von Hand ändern, sonst
   überschreibt sie der nächste Build bzw. die Studio-Oberfläche.
7. **Prüfen.** Im Projektordner: `npx --prefix ../.. hyperframes check`, dann
   `npx --prefix ../.. hyperframes snapshot --at <sekunden>` für jede Szene (einmal mitten in der
   Animation, einmal im Stand) und die Bilder ansehen. Erst danach rendern.
8. **Rendern.** `npx --prefix ../.. hyperframes render -o ../../exports/<name>.mp4`
   (`--quality draft` für Vorschau). Ergebnis dem Nutzer schicken.

## Szenen-Katalog

Ein Eintrag in `scenes` von `studio.json` (spätere Einträge liegen oben):

```json
{ "template": "title-card", "start": 0, "duration": 3.5, "vars": { "kicker": "Neue Folge", "title": "So geht *das*", "bg": "solid" } }
{ "template": "screen-frame", "start": 30, "duration": 6, "vars": { "label": "claude.ai" }, "media": ["screen.mp4"], "mediaStart": 0 }
```

`media` sind Dateinamen in `projects/<name>/media/` (`split-screen` braucht zwei; `b-roll` ist ein
vollflächiges Video ohne Template). `bg`: `solid` = Vollbild-Karte, `overlay` = abgedunkelt über Footage.
Dieselbe Datei bearbeitet die Studio-Oberfläche (`npm run studio`, http://localhost:4747); der Nutzer
kann dort weiterarbeiten, was hier angelegt wurde, und umgekehrt.

| Template | Wofür | Variablen (außer `duration`) | Länge |
|---|---|---|---|
| `captions` | Wort-für-Wort-Untertitel, aktives Wort in Akzent | `position` bottom/center, `offset` | ganzes Video |
| `title-card` | Hook / Titel am Anfang | `kicker`, `title` (`*Akzent*`), `bg` | 3-4 s |
| `chapter-card` | Kapitelwechsel | `number`, `title`, `bg` | 2-3 s |
| `lower-third` | Name + Rolle | `name`, `role`, `side` left/right | 4-6 s |
| `callout` | Stichwort mit Zeiger auf einen Bildpunkt | `text`, `x`, `y` (% des Bilds), `side` | 2-4 s |
| `list` | Schritte / Aufzählung | `title`, `items` (`a\|b\|c`), `times` (`1.2\|3.4\|...` optional), `bg` | 1,5 s + 1,5 s je Punkt |
| `stat` | Große Zahl zählt hoch | `value`, `decimals`, `prefix`, `suffix`, `label`, `bg` | 3-5 s |
| `quote` | Zitat | `quote` (`*Akzent*`), `author`, `bg` | 4-6 s |
| `screen-frame` | Bildschirmaufnahme im Fenster | `label`, `title` (nur Hochformat sichtbar) | beliebig |
| `split-screen` | Zwei Videos nebeneinander (hoch: übereinander) | `labelA`, `labelB` | beliebig |
| `pip` | Label zum Bild-im-Bild | `label`, `corner` br/bl/tr/tl | beliebig |
| `end-card` | Schluss mit Call-to-Action | `headline` (`*Akzent*`), `cta`, `handle`, `bg` | 4-6 s |

Der Build setzt daraus die Host-Elemente: Szenen mit eigenem Video bekommen ein `<video>` mit
einer Klasse aus `brand/edit.css` (`edit-screen`, `edit-split-a/b`, `edit-pip`, `edit-full`), das Template liegt darüber.

## Regeln beim Setzen

- Captions laufen über allem. Mit `captions.hideOnCards: true` (Standard) blendet der Build sie
  während Vollbild-Karten automatisch aus.
- Nie zwei Text-Szenen gleichzeitig, außer `lower-third` + `callout`.
- `callout`: `side` so wählen, dass das Label ins Bild passt (Punkt rechts der Mitte: `left`).
- `list` mit `times`: Einblendzeiten relativ zum Szenenstart auf die Stelle legen, an der der Punkt gesprochen wird.
- Etwa alle 3-6 s soll sich etwas ändern (Szene, B-Roll, Zoom); stehende Karten nicht länger als nötig.
- `stat`-Zahlen sind `de-DE` formatiert (`locale` ändert das).

## Neues Template bauen

Ein vorhandenes Template in `SK/studio/compositions/` kopieren und anpassen. Was HyperFrames verlangt:

- Wurzel `<div id="root" data-composition-id="NAME" ... data-duration="3600">`, darin `<div class="scene">`.
  CSS-Selektoren ohne Wurzel-Präfix schreiben (HyperFrames scoped sie selbst); Klassen wie
  `solid` auf `.scene` setzen, nie auf `#root`.
- `window.__hyperframes.getVariables()`, `document.querySelector`, `gsap.timeline` und
  `window.__timelines["NAME"] = tl` **müssen im Inline-Script des Templates stehen**: nur dort sind
  sie pro Instanz gescoped. In `brand/edit.js` aufgerufen liefern sie nichts bzw. die falsche Instanz.
- Nur deterministische Animation: GSAP-Tweens auf der einen pausierten Timeline, kein
  `Math.random`, `Date.now`, `fetch`, keine CSS-Animationen.
- Variablen in `data-composition-variables` am `<html>` deklarieren (mit Default), danach Template
  auch in den Katalog oben eintragen und mit `snapshot` in Quer- und Hochformat prüfen.

Neues Template zusätzlich in `TEMPLATE_INFO` in `studio/core.mjs` eintragen, dann erscheint es
auch in der Studio-Oberfläche. `projects/_showcase/` zeigt alle 12 Szenen in einer handgeschriebenen
Timeline (Medien liegen nicht im Git).

## Geschmack

`taste.md` in diesem Ordner hält fest, was der Nutzer behalten und verworfen hat. Vor jedem
Schnitt lesen; neue Korrekturen des Nutzers dort ergänzen.
