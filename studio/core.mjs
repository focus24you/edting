// Shared project model for the studio UI, the CLI and the edit skill.
// A project is projects/<id>/studio.json; index.html + captions-data.js are generated from it.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SKEL = path.join(ROOT, ".claude/skills/edit/studio");
export const PROJECTS = path.join(ROOT, "projects");
export const EXPORTS = path.join(ROOT, "exports");

// label, default length (s), number of extra media files the scene needs
export const TEMPLATE_INFO = {
  "title-card": { label: "Titelkarte", dur: 3.5 },
  "chapter-card": { label: "Kapitelkarte", dur: 2.5 },
  "lower-third": { label: "Bauchbinde", dur: 5 },
  callout: { label: "Callout", dur: 3 },
  list: { label: "Liste", dur: 7 },
  stat: { label: "Zahl", dur: 4 },
  quote: { label: "Zitat", dur: 5 },
  "screen-frame": { label: "Screen-Fenster", dur: 6, media: 1 },
  "split-screen": { label: "Split Screen", dur: 6, media: 2 },
  pip: { label: "Bild-im-Bild", dur: 6, media: 1 },
  "end-card": { label: "Endkarte", dur: 5 },
  "b-roll": { label: "B-Roll", dur: 4, media: 1 },
};

export function slug(s) {
  return String(s).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/\.[a-z0-9]+$/, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "video";
}
export function validId(id) { return /^[a-z0-9][a-z0-9_-]{0,60}$/.test(id); }
export function projectDir(id) {
  if (!validId(id)) throw new Error("invalid project id");
  return path.join(PROJECTS, id);
}
export function freeId(base) {
  let id = slug(base), n = 2;
  while (fs.existsSync(path.join(PROJECTS, id))) id = `${slug(base)}-${n++}`;
  return id;
}

export function templates() {
  const out = [];
  for (const [id, info] of Object.entries(TEMPLATE_INFO)) {
    let vars = [];
    const f = path.join(SKEL, "compositions", id + ".html");
    if (fs.existsSync(f)) {
      const m = fs.readFileSync(f, "utf8").match(/data-composition-variables='([^']*)'/);
      if (m) vars = JSON.parse(m[1].replace(/&#39;/g, "'")).filter((v) => v.id !== "duration");
    }
    out.push({ id, ...info, vars });
  }
  return out;
}

export function loadProject(id) {
  return JSON.parse(fs.readFileSync(path.join(projectDir(id), "studio.json"), "utf8"));
}
export function saveProject(p) {
  fs.writeFileSync(path.join(projectDir(p.id), "studio.json"), JSON.stringify(p, null, 1));
  if (p.status === "ready") build(p);
}
export function listProjects() {
  if (!fs.existsSync(PROJECTS)) return [];
  return fs.readdirSync(PROJECTS).filter((d) => fs.existsSync(path.join(PROJECTS, d, "studio.json")))
    .map((d) => { try { return loadProject(d); } catch { return null; } }).filter(Boolean)
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

/** Copy the brand + templates skeleton and write an empty project. */
export function createProject({ id, title, shape = "landscape", duration = 10, hasVideo = false }) {
  const dir = projectDir(id);
  if (fs.existsSync(path.join(dir, "studio.json"))) throw new Error(`project ${id} exists`);
  fs.mkdirSync(path.join(dir, "media"), { recursive: true });
  fs.cpSync(SKEL, dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "hyperframes.json"), JSON.stringify({
    $schema: "https://hyperframes.heygen.com/schema/hyperframes.json",
    registry: "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry",
    paths: { blocks: "compositions", components: "compositions/components", assets: "assets" },
    media: { autoProxy: true },
  }, null, 2));
  fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify({ id, name: id }));
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({
    name: id, private: true, type: "module",
    scripts: { check: "npx --prefix ../.. hyperframes check", render: "npx --prefix ../.. hyperframes render" },
  }, null, 2));
  const p = {
    id, title: title || id, shape, duration, hasVideo, status: "ready", createdAt: new Date().toISOString(),
    captions: { enabled: true, position: "bottom", maxWords: shape === "portrait" ? 2 : 3, hideOnCards: true, groups: [] },
    scenes: [],
  };
  saveProject(p);
  return p;
}

/** Whisper words -> caption groups. */
export function groupWords(words, { maxWords = 3, maxChars = 18, gap = 0.6 } = {}) {
  const groups = []; let cur = [];
  const flush = () => { if (cur.length) groups.push(cur); cur = []; };
  for (const w of words) {
    const raw = String(w.word ?? w.t ?? "").trim();
    const t = raw.replace(/[^\p{L}\p{N}\s'’%€$&+\-/]/gu, "").trim();
    if (!t) continue;
    if (cur.length && (w.start - cur[cur.length - 1].end > gap || cur.length >= maxWords ||
        cur.map((x) => x.t).join(" ").length + 1 + t.length > maxChars)) flush();
    cur.push({ t, start: +(+w.start).toFixed(3), end: +(+w.end).toFixed(3) });
    if (/[.!?,;:]$/.test(raw)) flush();
  }
  flush();
  return groups.map((g, i) => {
    let end = g[g.length - 1].end + 0.5;
    if (i + 1 < groups.length) end = Math.min(end, groups[i + 1][0].start);
    return { start: g[0].start, end: +Math.max(end, g[g.length - 1].end).toFixed(3), words: g };
  });
}
export function wordsFromWhisper(json) {
  return (json.segments || []).flatMap((s) => s.words || []);
}

const attr = (o) => JSON.stringify(o).replace(/&/g, "&amp;").replace(/'/g, "&#39;");
const SOLID = new Set(["title-card", "chapter-card", "list", "stat", "quote", "end-card", "screen-frame"]);

/** studio.json -> index.html + captions-data.js */
export function build(p) {
  const dir = projectDir(p.id);
  const [W, H] = p.shape === "portrait" ? [1080, 1920] : [1920, 1080];
  for (const f of fs.readdirSync(path.join(SKEL, "compositions"))) {
    const html = fs.readFileSync(path.join(SKEL, "compositions", f), "utf8")
      .replace('data-width="1920" data-height="1080"', `data-width="${W}" data-height="${H}"`);
    fs.writeFileSync(path.join(dir, "compositions", f), html);
  }
  fs.cpSync(path.join(SKEL, "brand"), path.join(dir, "brand"), { recursive: true });

  const dur = +(+p.duration).toFixed(2), L = [], covered = [], tdefs = Object.fromEntries(templates().map((t) => [t.id, t]));
  const video = (id, cls, s, d, src, z, ms = 0) =>
    `      <video id="${id}" class="clip ${cls}" style="z-index:${z}" src="media/${src}" muted data-start="${s}" data-duration="${d}" data-media-start="${ms}" data-track-index="1"></video>`;
  if (p.hasVideo) L.push(`      <video id="main-video" class="clip edit-full" src="media/main.mp4" data-start="0" data-duration="${dur}" data-has-audio="true" data-track-index="0"></video>`);
  (p.scenes || []).forEach((s, i) => {
    const def = tdefs[s.template]; if (!def) return;
    const start = +Math.max(0, Math.min(+s.start, dur)).toFixed(2), d = +Math.min(+s.duration, dur - start).toFixed(2);
    if (d <= 0.2) return;
    const z = 10 + i * 4, id = `sc${i + 1}-${s.template}`, v = { duration: d };
    for (const dv of def.vars) {
      let val = s.vars?.[dv.id]; if (val === undefined || val === null) val = dv.default;
      v[dv.id] = dv.type === "number" ? Number(val) || 0 : String(val);
    }
    const m = s.media || [], ms = +s.mediaStart || 0;
    if (def.media && !m[0]) return; // media scene without a file: skip instead of rendering a hole
    if (s.template === "b-roll") { L.push(video(id, "edit-full", start, d, m[0], z, ms)); return; }
    if (s.template === "screen-frame") L.push(video(id + "-v", "edit-screen", start, d, m[0], z, ms));
    if (s.template === "split-screen") {
      if (!m[1]) return;
      L.push(video(id + "-a", "edit-split-a", start, d, m[0], z, ms), video(id + "-b", "edit-split-b", start, d, m[1], z, ms));
    }
    if (s.template === "pip") {
      const c = String(v.corner || "br");
      L.push(video(id + "-v", `edit-pip${c.includes("l") ? " left" : ""}${c[0] === "t" ? " top" : ""}`, start, d, m[0], z, ms));
    }
    if (SOLID.has(s.template) && v.bg !== "overlay") covered.push([start, start + d]);
    L.push(`      <div id="${id}" class="layer" style="z-index:${z + 1}" data-composition-id="${id}" data-composition-src="compositions/${s.template}.html" data-start="${start}" data-duration="${d}" data-track-index="${2 + (i % 6)}" data-variable-values='${attr(v)}'></div>`);
  });
  const c = p.captions || {};
  let groups = c.enabled ? c.groups || [] : [];
  if (c.hideOnCards) groups = groups.filter((g) => !covered.some(([a, b]) => g.start < b && g.end > a));
  groups = groups.filter((g) => g.start < dur);
  fs.writeFileSync(path.join(dir, "captions-data.js"), "window.EDIT_CAPTIONS = " + JSON.stringify({ groups }) + ";\n");
  if (groups.length) L.push(`      <div id="captions-main" class="layer" style="z-index:900" data-composition-id="captions-main" data-composition-src="compositions/captions.html" data-start="0" data-duration="${dur}" data-track-index="9" data-variable-values='${attr({ position: c.position || "bottom", offset: 0 })}'></div>`);

  fs.writeFileSync(path.join(dir, "index.html"), `<!doctype html>
<!-- GENERATED from studio.json by studio/core.mjs. Edit studio.json (or use the studio UI), then: node studio/cli.mjs build ${p.id} -->
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${W}, height=${H}" />
    <link rel="stylesheet" href="brand/brand.css" />
    <link rel="stylesheet" href="brand/edit.css" />
    <script src="brand/gsap.min.js"></script>
    <style>
      html, body { width: ${W}px; height: ${H}px; background: var(--bg); }
      #film { position: relative; width: ${W}px; height: ${H}px; overflow: hidden; }
    </style>
  </head>
  <body>
    <div id="film" data-composition-id="main" data-start="0" data-duration="${dur}" data-width="${W}" data-height="${H}">
${L.join("\n")}
    </div>
    <script>
      window.__timelines = window.__timelines || {};
      window.__timelines["main"] = gsap.timeline({ paused: true });
    </script>
  </body>
</html>
`);
}
