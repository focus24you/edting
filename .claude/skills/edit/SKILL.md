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
4. **Projekt anlegen.** `bash SK/scripts/new-project.sh <name> landscape|portrait raw/footage/cut.mp4`
   kopiert Marke und Templates nach `projects/<name>/` und schreibt `index.html` mit dem Video und der Caption-Spur.
5. **Captions.** `python3 SK/scripts/captions.py transcripts/cut.json projects/<name>`
   (`--max-words 3`; Hochformat eher 2). Whisper-Fehler direkt in `captions-data.js` korrigieren.
6. **Szenen setzen.** Aus dem Transkript ableiten, wo welche Szene hilft, und Snippets
   (Katalog unten) bei `<!-- SCENES -->` in `index.html` einfügen. Zeiten aus den Wort-Zeitstempeln nehmen.
7. **Prüfen.** Im Projektordner: `npx --prefix ../.. hyperframes check`, dann
   `npx --prefix ../.. hyperframes snapshot --at <sekunden>` für jede Szene (einmal mitten in der
   Animation, einmal im Stand) und die Bilder ansehen. Erst danach rendern.
8. **Rendern.** `npx --prefix ../.. hyperframes render -o ../../exports/<name>.mp4`
   (`--quality draft` für Vorschau). Ergebnis dem Nutzer schicken.

## Szenen-Katalog

Jede Szene ist eine Zeile im Host. `ID` pro Instanz eindeutig, `duration` in den Variablen
**muss gleich `data-duration` sein** (steuert die Ausblendung). `bg`: `solid` = Vollbild-Karte,
`overlay` = abgedunkelt über Footage.

```html
<div id="ID" class="layer" style="z-index:10" data-composition-id="ID" data-composition-src="compositions/TEMPLATE.html" data-start="12.4" data-duration="4" data-track-index="2" data-variable-values='{"duration":4, ...}'></div>
```

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

Szenen mit eigenem Video: das `<video>` steht im **Host** und bekommt eine Klasse aus `brand/edit.css`;
das Template liegt darüber (höherer `z-index`).

```html
<!-- screen-frame: Template malt Hintergrund + Fenster, das Video scheint durch -->
<video id="scr1" class="clip edit-screen" style="z-index:2" src="media/screen.mp4" muted data-start="30" data-duration="6" data-media-start="0" data-track-index="1"></video>
<div id="s-scr1" class="layer" style="z-index:3" data-composition-id="s-scr1" data-composition-src="compositions/screen-frame.html" data-start="30" data-duration="6" data-variable-values='{"duration":6,"label":"claude.ai"}'></div>

<!-- split-screen -->
<video id="spa" class="clip edit-split-a" src="media/a.mp4" muted data-start="40" data-duration="6" data-track-index="1"></video>
<video id="spb" class="clip edit-split-b" src="media/b.mp4" muted data-start="40" data-duration="6" data-track-index="2"></video>
<div id="s-sp" class="layer" style="z-index:3" data-composition-id="s-sp" data-composition-src="compositions/split-screen.html" data-start="40" data-duration="6" data-variable-values='{"duration":6,"labelA":"Vorher","labelB":"Nachher"}'></div>

<!-- pip: Klassen left / top / round am Video verschieben bzw. runden es; corner passend setzen -->
<video id="pip1" class="clip edit-pip" style="z-index:4" src="media/cam.mp4" muted data-start="50" data-duration="8" data-track-index="2"></video>
<div id="s-pip1" class="layer" style="z-index:5" data-composition-id="s-pip1" data-composition-src="compositions/pip.html" data-start="50" data-duration="8" data-variable-values='{"duration":8,"label":"Live","corner":"br"}'></div>
```

B-Roll vollflächig: `<video class="clip edit-full" muted ...>`. Ton nur am Hauptvideo
(`data-has-audio="true"`); Musik als `<audio>` mit `data-volume="0.15"`.

## Regeln beim Setzen

- Captions laufen über allem (`z-index:50`). Während Vollbild-Karten (`bg: solid`) mit eigenem
  Text die betroffenen Gruppen aus `captions-data.js` nehmen oder die Karte so legen, dass nichts kollidiert.
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

`projects/_showcase/` zeigt alle 12 Szenen in einer Timeline (Medien liegen nicht im Git;
eigenes `media/broll.mp4` + `media/voice.mp3` einlegen, um es neu zu rendern).

## Geschmack

`taste.md` in diesem Ordner hält fest, was der Nutzer behalten und verworfen hat. Vor jedem
Schnitt lesen; neue Korrekturen des Nutzers dort ergänzen.
