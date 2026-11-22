#!/usr/bin/env node
// Edit Studio: local web UI. Start with `npm run studio`, open http://localhost:4747
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import * as core from "./core.mjs";

const PORT = +process.env.PORT || 4747;
const UI = path.join(core.ROOT, "studio/ui");
const RAW = path.join(core.ROOT, "raw/footage");
const TRANS = path.join(core.ROOT, "transcripts");
const BIN = {
  whisper: path.join(core.ROOT, ".venv/bin/whisper"),
  ytdlp: path.join(core.ROOT, ".venv/bin/yt-dlp"),
  hf: path.join(core.ROOT, "node_modules/.bin/hyperframes"),
};
for (const d of [RAW, TRANS, core.PROJECTS, core.EXPORTS]) fs.mkdirSync(d, { recursive: true });

// ---------------------------------------------------------------- jobs (one at a time: all of this is CPU-heavy)
const jobs = []; let running = false, jobSeq = 0;
function addJob(project, type, label, fn) {
  const job = { id: ++jobSeq, project, type, label, status: "queued", pct: 0, step: "Wartet", error: null };
  jobs.push({ job, fn }); pump();
  return job;
}
const history = [];
async function pump() {
  if (running || !jobs.length) return;
  running = true;
  const { job, fn } = jobs[0];
  job.status = "running";
  try { await fn(job); job.status = "done"; job.pct = 100; job.step = "Fertig"; }
  catch (e) { job.status = "error"; job.error = String(e.message || e).slice(-600); console.error(`[job ${job.id}]`, e); }
  jobs.shift(); history.unshift(job); history.length = Math.min(history.length, 20);
  running = false; pump();
}
const allJobs = () => [...jobs.map((j) => j.job), ...history];

function run(cmd, args, { cwd = core.ROOT, onLine, env } = {}) {
  return new Promise((resolve, reject) => {
    const ch = spawn(cmd, args, { cwd, env: { ...process.env, PYTHONUNBUFFERED: "1", ...env } });
    let tail = "";
    const feed = (buf) => {
      const s = buf.toString(); tail = (tail + s).slice(-4000);
      if (onLine) s.split(/[\r\n]+/).forEach((l) => l && onLine(l));
    };
    ch.stdout.on("data", feed); ch.stderr.on("data", feed);
    ch.on("error", reject);
    ch.on("close", (code) => (code === 0 ? resolve(tail) : reject(new Error(`${path.basename(cmd)} exit ${code}: ${tail.slice(-500)}`))));
  });
}
async function probe(file) {
  const out = await run("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:stream_side_data=rotation:format=duration", "-of", "json", file]);
  const j = JSON.parse(out.slice(out.indexOf("{")));
  let { width = 0, height = 0 } = j.streams?.[0] || {};
  const rot = Math.abs(+(j.streams?.[0]?.side_data_list?.[0]?.rotation || 0));
  if (rot === 90 || rot === 270) [width, height] = [height, width];
  return { width, height, duration: +j.format.duration };
}
const hms = (t) => { const p = t.split(":").map(Number); return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]; };

// ---------------------------------------------------------------- import pipeline
async function ingest(job, id, src, opts) {
  const dir = core.projectDir(id), main = path.join(dir, "media/main.mp4");
  const p = core.loadProject(id);
  const set = (step, pct) => { job.step = step; job.pct = pct; };

  set("Video wird analysiert", 2);
  const info = await probe(src);
  let keep = null;
  if (opts.cutSilence) {
    set("Pausen werden gesucht", 5);
    const log = await run("ffmpeg", ["-hide_banner", "-i", src, "-vn", "-af", "silencedetect=noise=-35dB:d=0.7", "-f", "null", "-"]);
    const sil = []; let a = null;
    for (const m of log.matchAll(/silence_(start|end): ([\d.]+)/g)) {
      if (m[1] === "start") a = +m[2]; else if (a !== null) { sil.push([a, +m[2]]); a = null; }
    }
    if (a !== null) sil.push([a, info.duration]);
    const pad = 0.15; keep = []; let t = 0;
    for (const [s, e] of sil) { if (s + pad - t > 0.3) keep.push([t, s + pad]); t = Math.max(t, e - pad); }
    if (info.duration - t > 0.3) keep.push([t, info.duration]);
    if (!sil.length || !keep.length) keep = null;
  }
  const outDur = keep ? keep.reduce((n, [s, e]) => n + e - s, 0) : info.duration;
  const long = info.width >= info.height ? 1920 : 1080;
  let vf = `fps=30,scale='min(${long},iw)':-2`, af = "aresample=48000";
  if (keep) {
    const sel = keep.map(([s, e]) => `between(t,${s.toFixed(3)},${e.toFixed(3)})`).join("+");
    vf = `fps=30,select='${sel}',setpts=N/FRAME_RATE/TB,scale='min(${long},iw)':-2`;
    af = `aselect='${sel}',asetpts=N/SR/TB,aresample=48000`;
  }
  set(keep ? `Pausen werden geschnitten (${keep.length} Teile)` : "Video wird vorbereitet", 8);
  await run("ffmpeg", ["-hide_banner", "-y", "-i", src, "-vf", vf, "-af", af, "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-progress", "pipe:1", "-nostats", main], {
    onLine: (l) => { const m = l.match(/^out_time_ms=(\d+)/); if (m) job.pct = 8 + Math.min(32, (m[1] / 1e6 / outDur) * 32); },
  });
  const fin = await probe(main);
  p.hasVideo = true; p.duration = +fin.duration.toFixed(2);
  p.shape = opts.shape === "landscape" || opts.shape === "portrait" ? opts.shape : fin.height > fin.width ? "portrait" : "landscape";
  p.captions.maxWords = p.shape === "portrait" ? 2 : 3;
  p.cut = keep ? { removed: +(info.duration - outDur).toFixed(1), parts: keep.length } : null;
  await run("ffmpeg", ["-hide_banner", "-y", "-ss", String(Math.min(1, fin.duration / 2)), "-i", main, "-frames:v", "1", "-vf", "scale=640:-2", path.join(dir, "media/thumb.jpg")]);
  p.status = "transcribing"; core.saveProject(p);

  set("Sprache wird transkribiert", 40);
  const args = [main, "--model", opts.model || "small", "--word_timestamps", "True", "--output_format", "json", "--output_dir", path.join(TRANS, id), "--fp16", "False"];
  if (opts.language && opts.language !== "auto") args.push("--language", opts.language);
  fs.mkdirSync(path.join(TRANS, id), { recursive: true });
  // Whisper only reports per 30s window, so creep forward on an estimate in between
  const t0 = Date.now(), creep = setInterval(() => { job.pct = Math.max(job.pct, 40 + 55 * (1 - Math.exp(-(Date.now() - t0) / 1000 / (p.duration * 1.5 + 20)))); }, 1000);
  try {
    await run(BIN.whisper, args, {
      onLine: (l) => { const m = l.match(/^\[([\d:.]+) --> ([\d:.]+)\]/); if (m) job.pct = Math.max(job.pct, 40 + Math.min(58, (hms(m[2]) / p.duration) * 58)); },
    });
  } finally { clearInterval(creep); }
  const tr = JSON.parse(fs.readFileSync(path.join(TRANS, id, "main.json"), "utf8"));
  p.language = tr.language;
  p.captions.groups = core.groupWords(core.wordsFromWhisper(tr), { maxWords: p.captions.maxWords });
  p.status = "ready"; core.saveProject(p);
}
function failProject(id, e) { try { const p = core.loadProject(id); p.status = "error"; p.error = String(e.message || e).slice(-400); core.saveProject(p); } catch {} }

function startImport(title, src, opts) {
  const id = core.freeId(title);
  const p = core.createProject({ id, title, shape: "landscape", duration: 1 });
  p.status = "processing"; core.saveProject(p);
  const job = addJob(id, "import", `Import: ${title}`, (job) => ingest(job, id, src, opts).catch((e) => { failProject(id, e); throw e; }));
  return { id, job: job.id };
}

// ---------------------------------------------------------------- http helpers
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime", ".mp3": "audio/mpeg", ".jpg": "image/jpeg", ".png": "image/png", ".woff2": "font/woff2", ".svg": "image/svg+xml" };
const json = (res, code, obj) => { res.writeHead(code, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(obj)); };
function sendFile(req, res, file, download) {
  let st; try { st = fs.statSync(file); } catch { return json(res, 404, { error: "not found" }); }
  if (!st.isFile()) return json(res, 404, { error: "not found" });
  const h = { "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream", "accept-ranges": "bytes", "cache-control": "no-cache" };
  if (download) h["content-disposition"] = `attachment; filename="${path.basename(file)}"`;
  const r = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
  if (r) {
    const start = r[1] ? +r[1] : Math.max(0, st.size - +r[2]), end = r[1] && r[2] ? Math.min(+r[2], st.size - 1) : st.size - 1;
    if (start > end) { res.writeHead(416, { "content-range": `bytes */${st.size}` }); return res.end(); }
    res.writeHead(206, { ...h, "content-range": `bytes ${start}-${end}/${st.size}`, "content-length": end - start + 1 });
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...h, "content-length": st.size });
  fs.createReadStream(file).pipe(res);
}
const inside = (base, rel) => { const f = path.resolve(base, rel); return f === base || f.startsWith(base + path.sep) ? f : null; };
const body = (req) => new Promise((ok, no) => { let s = ""; req.on("data", (d) => { s += d; if (s.length > 5e6) req.destroy(); }); req.on("end", () => { try { ok(s ? JSON.parse(s) : {}); } catch (e) { no(e); } }); req.on("error", no); });
const receive = (req, file) => new Promise((ok, no) => { const w = fs.createWriteStream(file); req.pipe(w); w.on("finish", ok); w.on("error", no); req.on("error", no); req.on("aborted", () => no(new Error("upload aborted"))); });
const safeName = (n) => path.basename(String(n || "file")).replace(/[^\w.\-]+/g, "_").slice(-80);

// ---------------------------------------------------------------- routes
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x"), q = url.searchParams, seg = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  try {
    // only this machine's own pages may call the API
    const origin = req.headers.origin;
    if (origin && new URL(origin).host !== req.headers.host) return json(res, 403, { error: "forbidden" });

    if (seg[0] === "api") {
      if (seg[1] === "state") return json(res, 200, { projects: core.listProjects().map(({ captions, scenes, ...p }) => ({ ...p, scenes: scenes.length })), jobs: allJobs() });
      if (seg[1] === "templates") return json(res, 200, core.templates());
      if (seg[1] === "upload" && req.method === "PUT") {
        const name = safeName(q.get("name")), file = path.join(RAW, `${Date.now()}-${name}`);
        await receive(req, file);
        return json(res, 200, startImport(q.get("title") || name.replace(/\.[^.]+$/, ""), file, { shape: q.get("shape"), language: q.get("language"), model: q.get("model"), cutSilence: q.get("cut") === "1" }));
      }
      if (seg[1] === "import-url" && req.method === "POST") {
        const b = await body(req);
        if (!/^https?:\/\//.test(b.url || "")) return json(res, 400, { error: "Bitte einen http(s)-Link angeben." });
        const stamp = Date.now(), tpl = path.join(RAW, `${stamp}-%(title).50s.%(ext)s`);
        const id = core.freeId("download"), p = core.createProject({ id, title: b.url, duration: 1 });
        p.status = "processing"; core.saveProject(p);
        const job = addJob(id, "import", "Download", async (job) => {
          try {
            job.step = "Video wird geladen"; job.pct = 1;
            const cookies = fs.existsSync(path.join(core.ROOT, "cookies.txt")) ? ["--cookies", path.join(core.ROOT, "cookies.txt")] : [];
            await run(BIN.ytdlp, ["--js-runtimes", "node", ...cookies, "-f", "bv*[height<=1080]+ba/b[height<=1080]/b", "--merge-output-format", "mp4", "--restrict-filenames", "--no-playlist", "-o", tpl, b.url]);
            const f = fs.readdirSync(RAW).find((x) => x.startsWith(stamp + "-"));
            if (!f) throw new Error("Download lieferte keine Datei.");
            const pp = core.loadProject(id); pp.title = f.replace(/^\d+-/, "").replace(/\.[^.]+$/, "").replace(/_/g, " "); core.saveProject(pp);
            await ingest(job, id, path.join(RAW, f), b);
          } catch (e) { failProject(id, e); throw e; }
        });
        return json(res, 200, { id, job: job.id });
      }
      if (seg[1] === "projects" && seg[2]) {
        const id = seg[2], dir = core.projectDir(id);
        if (!seg[3] && req.method === "GET") return json(res, 200, { ...core.loadProject(id), media: fs.readdirSync(path.join(dir, "media")).filter((f) => /\.(mp4|mov|webm|m4v)$/i.test(f) && f !== "main.mp4"), export: fs.existsSync(path.join(core.EXPORTS, id + ".mp4")) ? fs.statSync(path.join(core.EXPORTS, id + ".mp4")).mtimeMs : null });
        if (!seg[3] && req.method === "PUT") {
          const b = await body(req), p = core.loadProject(id);
          for (const k of ["title", "scenes", "captions"]) if (b[k] !== undefined) p[k] = b[k];
          core.saveProject(p); return json(res, 200, { ok: true });
        }
        if (!seg[3] && req.method === "DELETE") { fs.rmSync(dir, { recursive: true, force: true }); return json(res, 200, { ok: true }); }
        if (seg[3] === "regroup" && req.method === "POST") {
          const b = await body(req), p = core.loadProject(id);
          p.captions.maxWords = Math.max(1, Math.min(6, +b.maxWords || 3));
          p.captions.groups = core.groupWords(p.captions.groups.flatMap((g) => g.words), { maxWords: p.captions.maxWords, maxChars: 8 + p.captions.maxWords * 5 });
          core.saveProject(p); return json(res, 200, p.captions);
        }
        if (seg[3] === "media" && req.method === "PUT") {
          const name = safeName(q.get("name")).replace(/\.[^.]+$/, "") + ".mp4", raw = path.join(RAW, `${Date.now()}-${safeName(q.get("name"))}`);
          await receive(req, raw);
          await run("ffmpeg", ["-hide_banner", "-y", "-i", raw, "-vf", "fps=30,scale='min(1920,iw)':-2", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-an", path.join(dir, "media", name)]);
          return json(res, 200, { name });
        }
        if (seg[3] === "snapshot" && req.method === "POST") {
          const t = Math.max(0, +q.get("t") || 0).toFixed(2);
          core.build(core.loadProject(id));
          const job = addJob(id, "snapshot", `Vorschaubild ${t}s`, async (job) => {
            job.step = "Bild wird gerendert"; job.pct = 30;
            const out = await run(BIN.hf, ["snapshot", "--at", t], { cwd: dir });
            const m = out.match(/(\S+frame-00-at-[\d.]+s\.png)/);
            if (!m) throw new Error("Kein Bild erzeugt: " + out.slice(-300));
            fs.copyFileSync(m[1], path.join(dir, "media/preview.png")); job.result = Date.now();
          });
          return json(res, 200, { job: job.id });
        }
        if (seg[3] === "render" && req.method === "POST") {
          const draft = q.get("quality") === "draft";
          core.build(core.loadProject(id));
          const job = addJob(id, "render", draft ? "Entwurf rendern" : "Final rendern", async (job) => {
            job.step = "Video wird gerendert"; job.pct = 1;
            const tmp = path.join(core.EXPORTS, `${id}.part.mp4`);
            await run(BIN.hf, ["render", "-o", tmp, ...(draft ? ["--quality", "draft"] : [])], { cwd: dir, onLine: (l) => {
              const m = l.match(/@hf-progress (\{.*\})/); if (m) try { const j = JSON.parse(m[1]); if (j.pct != null) job.pct = Math.max(job.pct, Math.min(99, j.pct)); } catch {}
              const f = l.match(/"framesCompleted":(\d+).*?|"totalFrames":(\d+)/);
            } });
            fs.renameSync(tmp, path.join(core.EXPORTS, `${id}.mp4`)); job.result = Date.now();
          });
          return json(res, 200, { job: job.id });
        }
      }
      return json(res, 404, { error: "unknown endpoint" });
    }
    if (seg[0] === "files") {
      const base = seg[1] === "exports" ? core.EXPORTS : seg[1] === "projects" ? core.PROJECTS : seg[1] === "brand" ? path.join(core.SKEL, "brand") : null;
      const f = base && inside(base, seg.slice(2).join("/"));
      return f ? sendFile(req, res, f, q.has("download")) : json(res, 404, { error: "not found" });
    }
    const f = inside(UI, seg.join("/") || "index.html");
    return f ? sendFile(req, res, f) : json(res, 404, { error: "not found" });
  } catch (e) {
    console.error(e); if (!res.headersSent) json(res, 500, { error: String(e.message || e) });
  }
});
// projects left mid-import by a previous run can never finish: mark them
for (const p of core.listProjects()) if (p.status === "processing" || p.status === "transcribing") failProject(p.id, new Error("Import wurde unterbrochen (Studio neu gestartet)."));
server.listen(PORT, "127.0.0.1", () => console.log(`Edit Studio läuft: http://localhost:${PORT}`));
