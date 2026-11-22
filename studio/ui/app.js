// Edit Studio UI. Vanilla JS, no build step.
const $ = (s, r = document) => r.querySelector(s);
const app = $("#app");
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else if (k === "value") el.value = v;
    else if (k === "checked") el.checked = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  return el;
};
const api = async (path, opts = {}) => {
  if (opts.json) { opts.body = JSON.stringify(opts.json); opts.headers = { "content-type": "application/json" }; }
  const r = await fetch("/api/" + path, opts), j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || r.statusText);
  return j;
};
const fmt = (t) => { t = Math.max(0, t || 0); const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s < 10 ? "0" : ""}${s.toFixed(1)}`; };
let toastTimer;
const toast = (msg) => { const t = $("#toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("on"), 3200); };
const VIDEO = /\.(mp4|mov|m4v|webm|mkv|avi)$/i;

let state = { projects: [], jobs: [] }, templates = [], view = null, uploads = [];
const prefs = { shape: "auto", language: "auto", model: "small", cut: false };
const OPTIONS = { bg: [["solid", "Vollbild-Karte"], ["overlay", "Über dem Video"]], side: [["left", "Links"], ["right", "Rechts"]], corner: [["br", "Unten rechts"], ["bl", "Unten links"], ["tr", "Oben rechts"], ["tl", "Oben links"]] };
const LONG = new Set(["title", "quote", "items", "headline"]);

// ------------------------------------------------------------------ importing
function upload(file, extra = "") {
  return new Promise((ok, no) => {
    const x = new XMLHttpRequest(), u = { name: file.name, pct: 0 };
    uploads.push(u); drawJobs();
    x.open("PUT", `/api/${extra || `upload?shape=${prefs.shape}&language=${prefs.language}&model=${prefs.model}&cut=${prefs.cut ? 1 : 0}&title=${encodeURIComponent(file.name.replace(/\.[^.]+$/, ""))}&`}name=${encodeURIComponent(file.name)}`);
    x.upload.onprogress = (e) => { u.pct = (e.loaded / e.total) * 100; drawJobs(); };
    x.onload = () => { uploads = uploads.filter((y) => y !== u); drawJobs(); x.status < 300 ? ok(JSON.parse(x.responseText)) : no(new Error(JSON.parse(x.responseText || "{}").error || "Upload fehlgeschlagen")); };
    x.onerror = () => { uploads = uploads.filter((y) => y !== u); drawJobs(); no(new Error("Upload fehlgeschlagen")); };
    x.send(file);
  });
}
async function importFiles(files) {
  const vids = [...files].filter((f) => f.type.startsWith("video/") || VIDEO.test(f.name));
  if (!vids.length) return toast("Das ist keine Videodatei.");
  if (view?.type === "editor" && view.onDropMedia) return view.onDropMedia(vids);
  location.hash = "#/";
  for (const f of vids) { try { await upload(f); toast(`„${f.name}" wird verarbeitet`); await poll(); } catch (e) { toast(e.message); } }
}
let dragDepth = 0;
addEventListener("dragenter", (e) => { if (e.dataTransfer?.types.includes("Files")) { dragDepth++; $("#drop-veil").classList.add("on"); } });
addEventListener("dragleave", () => { if (--dragDepth <= 0) { dragDepth = 0; $("#drop-veil").classList.remove("on"); } });
addEventListener("dragover", (e) => e.preventDefault());
addEventListener("drop", (e) => { e.preventDefault(); dragDepth = 0; $("#drop-veil").classList.remove("on"); if (e.dataTransfer?.files.length) importFiles(e.dataTransfer.files); });

// ------------------------------------------------------------------ jobs + polling
function drawJobs() {
  const el = $("#jobs"); el.replaceChildren();
  for (const u of uploads) el.append(h("div", { class: "job" }, `Upload ${u.name.slice(0, 22)}`, h("div", { class: "bar" }, h("i", { style: `width:${u.pct}%` }))));
  const active = state.jobs.filter((j) => j.status === "running" || j.status === "queued");
  if (active[0]) el.append(h("div", { class: "job" }, `${active[0].step}${active.length > 1 ? ` (+${active.length - 1})` : ""}`, h("div", { class: "bar" }, h("i", { style: `width:${active[0].pct}%` }))));
}
const seen = new Set();
async function poll() {
  try { state = await api("state"); } catch { return; }
  drawJobs();
  for (const j of state.jobs) {
    if ((j.status === "done" || j.status === "error") && !seen.has(j.id)) {
      seen.add(j.id);
      if (j.status === "error" && j.type !== "import") toast("Fehler: " + j.error);
      view?.onJob?.(j);
    }
  }
  if (view?.type === "home") view.draw();
}
setInterval(poll, 1200);

// ------------------------------------------------------------------ home
function Home() {
  $("#crumbs").replaceChildren();
  const pick = h("input", { type: "file", accept: "video/*", multiple: true, style: "display:none", onchange: (e) => importFiles(e.target.files) });
  const sel = (key, opts) => h("select", { onchange: (e) => (prefs[key] = e.target.value) }, opts.map(([v, l]) => h("option", { value: v, selected: prefs[key] === v }, l)));
  const url = h("input", { type: "url", placeholder: "…oder Link einfügen (YouTube, Vimeo, Datei-URL)" });
  const grid = h("div", { class: "grid" });
  const root = h("div", { class: "home" },
    h("div", { class: "dz", onclick: (e) => { if (!e.target.closest("label,select,input")) pick.click(); } },
      h("h1", { class: "disp" }, "Video ", h("em", {}, "hier"), " ablegen"),
      h("p", {}, "Oder klicken, um eine Datei zu wählen. Danach wird automatisch vorbereitet, transkribiert und untertitelt."),
      h("div", { class: "opts" },
        h("label", {}, "Format", sel("shape", [["auto", "Automatisch"], ["landscape", "Quer 16:9"], ["portrait", "Hoch 9:16"]])),
        h("label", {}, "Sprache", sel("language", [["auto", "Automatisch"], ["de", "Deutsch"], ["en", "Englisch"]])),
        h("label", {}, "Genauigkeit", sel("model", [["base", "Schnell"], ["small", "Standard"], ["medium", "Genau (langsam)"]])),
        h("label", {}, h("input", { type: "checkbox", checked: prefs.cut, onchange: (e) => (prefs.cut = e.target.checked) }), "Pausen automatisch rausschneiden")),
      pick),
    h("div", { class: "urlrow" }, url, h("button", { class: "btn", onclick: async () => {
      if (!url.value) return;
      try { await api("import-url", { method: "POST", json: { url: url.value, ...prefs, cutSilence: prefs.cut } }); url.value = ""; toast("Download gestartet"); poll(); } catch (e) { toast(e.message); }
    } }, "Laden")),
    h("h2", { class: "disp" }, "Projekte"), grid);
  app.replaceChildren(root);
  let sig = "";
  const draw = () => {
    const s = JSON.stringify([state.projects, state.jobs.filter((j) => j.type === "import")]);
    if (s === sig) return; sig = s;
    grid.replaceChildren(...state.projects.map((p) => {
      const job = state.jobs.find((j) => j.project === p.id && j.type === "import" && j.status !== "done" && j.status !== "error");
      const ready = p.status === "ready";
      return h("a", { class: "card", href: ready ? `#/p/${p.id}` : null },
        h("div", { class: "th", style: p.hasVideo ? `background-image:url(/files/projects/${p.id}/media/thumb.jpg)` : "" }, p.hasVideo ? "" : ready ? "Kein Video" : "…"),
        h("div", { class: "meta" }, h("b", {}, p.title),
          ready ? h("span", {}, `${fmt(p.duration)} · ${p.shape === "portrait" ? "Hochformat" : "Querformat"} · ${p.scenes} Szenen${p.cut ? ` · ${p.cut.removed}s Pausen entfernt` : ""}`)
            : p.status === "error" ? h("div", { class: "err" }, "Import fehlgeschlagen: " + (p.error || ""))
            : [h("span", {}, job ? job.step : "Wartet"), h("div", { class: "bar" }, h("i", { style: `width:${job ? job.pct : 0}%` }))]),
        h("button", { class: "x", title: "Projekt löschen", onclick: async (e) => { e.preventDefault(); e.stopPropagation(); if (confirm(`Projekt „${p.title}" wirklich löschen?`)) { await api("projects/" + p.id, { method: "DELETE" }); poll(); } } }, "✕"));
    }));
    if (!state.projects.length) grid.replaceChildren(h("div", { class: "empty", style: "grid-column:1/-1" }, "Noch keine Projekte. Zieh dein erstes Video in das Feld oben."));
  };
  draw();
  return { type: "home", draw };
}

// ------------------------------------------------------------------ editor
async function Editor(id) {
  let p;
  try { p = await api("projects/" + id); } catch (e) { toast(e.message); location.hash = "#/"; return null; }
  if (p.status !== "ready") { location.hash = "#/"; return null; }
  if (!templates.length) templates = await api("templates");
  const T = Object.fromEntries(templates.map((t) => [t.id, t]));
  let sel = -1, tab = "scenes", zoom = 1, saveTimer, snapAt = null, picking = false;

  const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => api("projects/" + id, { method: "PUT", json: { title: p.title, scenes: p.scenes, captions: p.captions } }).catch((e) => toast(e.message)), 400); };
  const flush = async () => { clearTimeout(saveTimer); await api("projects/" + id, { method: "PUT", json: { title: p.title, scenes: p.scenes, captions: p.captions } }); };

  $("#crumbs").replaceChildren(h("a", { class: "btn ghost sm", href: "#/" }, "← Projekte"), h("input", { value: p.title, oninput: (e) => { p.title = e.target.value; save(); } }));

  // ---- stage
  const video = h("video", { src: p.hasVideo ? `/files/projects/${id}/media/main.mp4` : null, playsinline: true, preload: "auto" });
  const cap = h("div", { class: "cap" }), chip = h("div", { class: "chip", style: "display:none" }), snap = h("img", { class: "snap", style: "display:none" }), pin = h("div", { class: "pin", style: "display:none" });
  const stage = h("div", { class: "stage " + p.shape }, video, cap, snap, chip, pin);
  const playBtn = h("button", { class: "play", title: "Abspielen (Leertaste)", onclick: () => (video.paused ? video.play() : video.pause()) }, "▶");
  const time = h("span", { class: "time" });
  const dl = h("a", { class: "btn", href: `/files/exports/${id}.mp4?download`, style: p.export ? "" : "display:none" }, "↓ Video speichern");
  const busy = () => state.jobs.some((j) => j.project === id && (j.status === "running" || j.status === "queued"));
  const start = async (path, msg) => { if (busy()) return toast("Es läuft schon ein Auftrag für dieses Projekt."); try { await flush(); await api(`projects/${id}/${path}`, { method: "POST" }); toast(msg); poll(); } catch (e) { toast(e.message); } };
  const transport = h("div", { class: "transport" }, playBtn, time,
    h("button", { class: "btn", title: "Rendert das Bild an der Abspielposition exakt wie im fertigen Video", onclick: () => { snapAt = video.currentTime; start(`snapshot?t=${snapAt}`, "Vorschaubild wird gerendert"); } }, "Exaktes Vorschaubild"),
    h("span", { class: "sp" }),
    h("button", { class: "btn", onclick: () => start("render?quality=draft", "Entwurf wird gerendert") }, "Entwurf rendern"),
    h("button", { class: "btn primary", onclick: () => start("render", "Finales Video wird gerendert") }, "Final rendern"), dl);
  stage.addEventListener("click", (e) => {
    const s = p.scenes[sel];
    if (!picking || !s) return;
    const r = stage.getBoundingClientRect();
    s.vars.x = Math.round(((e.clientX - r.left) / r.width) * 100); s.vars.y = Math.round(((e.clientY - r.top) / r.height) * 100);
    picking = false; save(); drawPanel(); tick();
  });

  // ---- timeline
  const tlin = h("div", { class: "tlin" }), head = h("div", { class: "head" });
  const pps = () => Math.max(4, ((tlScroll.clientWidth - 32) / p.duration) * zoom);
  const tlScroll = h("div", { class: "tlscroll" }, tlin);
  const seek = (t) => { video.currentTime = Math.max(0, Math.min(p.duration - 0.03, t)); hideSnap(); tick(); };
  const hideSnap = () => { snap.style.display = "none"; };
  function drawTimeline() {
    const k = pps(), w = p.duration * k;
    tlin.style.width = w + "px";
    const step = [1, 2, 5, 10, 15, 30, 60, 120, 300].find((s) => s * k >= 64) || 600;
    const ruler = h("div", { class: "ruler" });
    for (let t = 0; t < p.duration; t += step) ruler.append(h("i", { style: `left:${t * k}px` }, fmt(t).replace(/\.0$/, "")));
    const lanes = []; // greedy lane packing so overlapping scenes stay readable
    p.scenes.map((s, i) => ({ s, i })).sort((a, b) => a.s.start - b.s.start).forEach(({ s, i }) => {
      let l = lanes.findIndex((end) => end <= s.start + 0.001); if (l < 0) { l = lanes.length; lanes.push(0); }
      lanes[l] = s.start + s.duration; s._lane = l; s._i = i;
    });
    const laneEls = (lanes.length ? lanes : [0]).map(() => h("div", { class: "lane" }));
    p.scenes.forEach((s, i) => {
      const b = h("div", { class: "blk" + (i === sel ? " sel" : ""), style: `left:${s.start * k}px;width:${Math.max(10, s.duration * k)}px`, title: T[s.template]?.label }, T[s.template]?.label || s.template, h("div", { class: "rs" }));
      b.addEventListener("pointerdown", (e) => {
        e.stopPropagation(); b.setPointerCapture(e.pointerId);
        const resize = e.target.classList.contains("rs"), x0 = e.clientX, s0 = s.start, d0 = s.duration; let moved = false;
        const move = (ev) => {
          const dt = (ev.clientX - x0) / k; if (Math.abs(ev.clientX - x0) > 2) moved = true;
          if (resize) s.duration = +Math.max(0.5, Math.min(p.duration - s.start, d0 + dt)).toFixed(2);
          else s.start = +Math.max(0, Math.min(p.duration - s.duration, s0 + dt)).toFixed(2);
          b.style.left = s.start * k + "px"; b.style.width = Math.max(10, s.duration * k) + "px";
        };
        const up = () => { b.removeEventListener("pointermove", move); b.removeEventListener("pointerup", up); sel = i; if (moved) save(); drawTimeline(); drawPanel(); tick(); };
        b.addEventListener("pointermove", move); b.addEventListener("pointerup", up);
      });
      laneEls[s._lane].append(b);
    });
    const caps = h("div", { class: "lane caps" });
    if (p.captions.enabled) for (const g of p.captions.groups) caps.append(h("i", { style: `left:${g.start * k}px;width:${Math.max(2, (g.end - g.start) * k - 1)}px` }));
    tlin.replaceChildren(ruler, h("div", { class: "lane vid" }, h("span", {}, "Video")), ...laneEls, caps, head);
    tick();
  }
  tlin.addEventListener("pointerdown", (e) => {
    const at = (ev) => seek((ev.clientX - tlin.getBoundingClientRect().left) / pps());
    at(e); const mv = (ev) => at(ev), up = () => { removeEventListener("pointermove", mv); removeEventListener("pointerup", up); };
    addEventListener("pointermove", mv); addEventListener("pointerup", up);
  });

  // ---- live state
  let lastGroup = null;
  function tick() {
    const t = video.currentTime || 0;
    time.textContent = `${fmt(t)} / ${fmt(p.duration)}`;
    playBtn.textContent = video.paused ? "▶" : "❚❚";
    head.style.left = t * pps() + "px";
    const active = p.scenes.filter((s) => t >= s.start && t < s.start + s.duration);
    const g = p.captions.enabled ? p.captions.groups.find((g) => t >= g.start && t < g.end) : null;
    cap.className = "cap" + (p.captions.position === "center" ? " center" : "");
    if (g !== lastGroup) { lastGroup = g; cap.replaceChildren(...(g ? g.words.map((w) => h("span", {}, w.t)) : [])); }
    if (g) [...cap.children].forEach((el, i) => el.classList.toggle("on", t >= g.words[i].start && (i === g.words.length - 1 || t < g.words[i + 1].start)));
    chip.style.display = active.length && snap.style.display === "none" ? "" : "none";
    if (active.length) chip.replaceChildren(h("b", {}, active.map((s) => T[s.template]?.label).join(" + ")), "liegt hier · „Exaktes Vorschaubild“ zeigt es");
    const s = p.scenes[sel];
    pin.style.display = s?.template === "callout" && snap.style.display === "none" ? "" : "none";
    if (s?.template === "callout") { pin.style.left = (s.vars.x ?? 50) + "%"; pin.style.top = (s.vars.y ?? 50) + "%"; }
    if (tab === "captions") document.querySelectorAll(".grp").forEach((el) => el.classList.toggle("now", +el.dataset.i === p.captions.groups.indexOf(g)));
  }
  let raf; const loop = () => { tick(); raf = requestAnimationFrame(loop); };
  video.addEventListener("play", () => { hideSnap(); loop(); });
  video.addEventListener("pause", () => { cancelAnimationFrame(raf); tick(); });
  video.addEventListener("seeked", tick);

  // ---- side panel
  const panel = h("div", { class: "panel" });
  const tabs = h("div", { class: "tabs" });
  const field = (label, input) => h("label", { class: "f" }, h("span", {}, label), input);
  function sceneForm(s) {
    const def = T[s.template], upd = (fn) => (e) => { fn(e.target.value); save(); drawTimeline(); };
    const mediaSel = (n) => field(def.media > 1 ? `Video ${n + 1}` : "Video", h("select", { onchange: (e) => { s.media[n] = e.target.value; save(); } },
      h("option", { value: "" }, "– wählen –"), p.media.map((m) => h("option", { value: m, selected: s.media?.[n] === m }, m))));
    const up = h("input", { type: "file", accept: "video/*", style: "display:none", onchange: (e) => view.onDropMedia([...e.target.files]) });
    return h("div", {},
      h("h3", {}, def.label),
      h("div", { class: "f2" },
        field("Start (s)", h("input", { type: "number", step: "0.1", min: "0", value: s.start, oninput: upd((v) => (s.start = Math.max(0, +v || 0))) })),
        field("Länge (s)", h("input", { type: "number", step: "0.1", min: "0.5", value: s.duration, oninput: upd((v) => (s.duration = Math.max(0.5, +v || 0.5))) }))),
      def.media ? [...Array(def.media)].map((_, n) => mediaSel(n)) : null,
      def.media ? h("div", { class: "hint" }, h("button", { class: "btn sm", onclick: () => up.click() }, "+ Video hochladen"), up, " oder Datei ins Fenster ziehen") : null,
      def.vars.map((v) => {
        const cur = s.vars[v.id] ?? v.default, set = (val) => { s.vars[v.id] = v.type === "number" ? +val : val; save(); tick(); };
        const label = v.label.replace(/\*Sternchen\*/, "*Sternchen*");
        if (OPTIONS[v.id]) return field(label.split(/[,:(]/)[0], h("select", { onchange: (e) => set(e.target.value) }, OPTIONS[v.id].map(([val, l]) => h("option", { value: val, selected: cur === val }, l))));
        if (v.id === "items") return field("Punkte (einer pro Zeile)", h("textarea", { rows: 4, oninput: (e) => set(e.target.value.split("\n").map((x) => x.trim()).filter(Boolean).join("|")) }, String(cur).split("|").join("\n")));
        if (LONG.has(v.id)) return field(label, h("textarea", { rows: 2, oninput: (e) => set(e.target.value) }, String(cur)));
        return field(label, h("input", { type: v.type === "number" ? "number" : "text", value: cur, oninput: (e) => set(e.target.value) }));
      }),
      s.template === "callout" ? h("div", { class: "hint" }, h("button", { class: "btn sm", onclick: () => { picking = true; toast("Jetzt im Video auf die Stelle klicken"); } }, "Punkt im Video anklicken")) : null,
      h("div", { style: "display:flex;gap:8px;margin-top:6px" },
        h("button", { class: "btn sm", onclick: () => seek(s.start + Math.min(1.2, s.duration / 2)) }, "Hinspringen"),
        h("button", { class: "btn sm danger", onclick: () => { p.scenes.splice(sel, 1); sel = -1; save(); drawTimeline(); drawPanel(); } }, "Szene löschen")));
  }
  function drawPanel() {
    tabs.replaceChildren(...[["scenes", "Szenen"], ["captions", "Untertitel"]].map(([k, l]) => h("button", { class: tab === k ? "on" : "", onclick: () => { tab = k; drawPanel(); } }, l)));
    if (tab === "scenes") {
      const s = p.scenes[sel];
      panel.replaceChildren(
        s ? sceneForm(s) : h("div", { class: "hint", style: "margin:0 0 18px" }, "Szene hinzufügen: sie landet an der aktuellen Abspielposition. Blöcke in der Timeline lassen sich ziehen und am rechten Rand verlängern."),
        h("h3", { style: "margin-top:22px" }, "Szene hinzufügen"),
        h("div", { class: "pal" }, templates.map((t) => h("button", { onclick: () => {
          const vars = Object.fromEntries(t.vars.map((v) => [v.id, v.default]));
          if (t.vars.some((v) => v.id === "bg") && ["lower-third", "callout"].includes(t.id) === false && t.id !== "title-card" && t.id !== "end-card") vars.bg = "solid";
          const st = +Math.min(video.currentTime || 0, Math.max(0, p.duration - 1)).toFixed(2);
          p.scenes.push({ template: t.id, start: st, duration: +Math.min(t.dur, p.duration - st).toFixed(2), vars, media: [] });
          sel = p.scenes.length - 1; save(); drawTimeline(); drawPanel();
        } }, t.label, h("small", {}, t.media ? `braucht ${t.media} Video${t.media > 1 ? "s" : ""}` : `${t.dur}s`)))));
    } else {
      const c = p.captions, chk = (key, label) => h("label", { class: "check" }, h("input", { type: "checkbox", checked: c[key], onchange: (e) => { c[key] = e.target.checked; save(); drawTimeline(); } }), label);
      panel.replaceChildren(
        chk("enabled", "Untertitel anzeigen"), chk("hideOnCards", "Auf Vollbild-Karten ausblenden"),
        h("div", { class: "f2" },
          field("Position", h("select", { onchange: (e) => { c.position = e.target.value; save(); tick(); } }, [["bottom", "Unten"], ["center", "Mitte"]].map(([v, l]) => h("option", { value: v, selected: c.position === v }, l)))),
          field("Wörter pro Einblendung", h("select", { onchange: async (e) => { await flush(); p.captions = await api(`projects/${id}/regroup`, { method: "POST", json: { maxWords: +e.target.value } }); lastGroup = null; drawPanel(); drawTimeline(); } }, [1, 2, 3, 4, 5].map((n) => h("option", { value: n, selected: c.maxWords === n }, n))))),
        h("h3", { style: "margin-top:14px" }, `Text (${c.groups.length})`),
        h("div", { class: "hint" }, "Wort anklicken zum Korrigieren, leeren zum Entfernen. Zeit anklicken springt hin."),
        ...c.groups.map((g, gi) => h("div", { class: "grp", "data-i": gi }, h("button", { onclick: () => seek(g.start + 0.01) }, fmt(g.start)),
          h("div", { class: "ws" }, g.words.map((w, wi) => h("span", { contenteditable: "plaintext-only", spellcheck: "false",
            onkeydown: (e) => { if (e.key === "Enter") { e.preventDefault(); e.target.blur(); } e.stopPropagation(); },
            onblur: (e) => { const t = e.target.textContent.trim(); if (t === w.t) return; if (!t) { g.words.splice(wi, 1); if (!g.words.length) c.groups.splice(gi, 1); drawPanel(); } else w.t = t; lastGroup = null; save(); tick(); } }, w.t))))),
        c.groups.length ? "" : h("div", { class: "empty" }, "Keine Sprache erkannt."));
    }
  }

  const tl = h("div", { class: "tl" }, h("div", { class: "tlbar" }, "Timeline", h("input", { type: "range", min: 1, max: 12, step: 0.25, value: 1, oninput: (e) => { zoom = +e.target.value; drawTimeline(); } }), "Zoom", h("span", { style: "flex:1" }), "Leertaste: Play · Entf: Szene löschen"), tlScroll);
  app.replaceChildren(h("div", { class: "ed" }, h("div", { class: "stagewrap" }, h("div", { class: "stagebox" }, stage), transport), h("div", { class: "side" }, tabs, panel), tl));
  drawPanel(); drawTimeline();
  const onResize = () => drawTimeline(); addEventListener("resize", onResize);
  const onKey = (e) => {
    if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.target.isContentEditable) return;
    if (e.code === "Space") { e.preventDefault(); video.paused ? video.play() : video.pause(); }
    if ((e.key === "Delete" || e.key === "Backspace") && sel >= 0) { p.scenes.splice(sel, 1); sel = -1; save(); drawTimeline(); drawPanel(); }
    if (e.key === "ArrowLeft") seek(video.currentTime - (e.shiftKey ? 1 : 0.1));
    if (e.key === "ArrowRight") seek(video.currentTime + (e.shiftKey ? 1 : 0.1));
  };
  addEventListener("keydown", onKey);

  return {
    type: "editor",
    destroy() { removeEventListener("resize", onResize); removeEventListener("keydown", onKey); cancelAnimationFrame(raf); clearTimeout(saveTimer); video.pause(); },
    onJob(j) {
      if (j.project !== id || j.status !== "done") return;
      if (j.type === "snapshot") { video.pause(); if (snapAt != null) video.currentTime = snapAt; snap.src = `/files/projects/${id}/media/preview.png?${j.result}`; snap.style.display = ""; tick(); }
      if (j.type === "render") { dl.style.display = ""; toast("Video ist fertig – „Video speichern“ lädt es herunter."); window.open(`/files/exports/${id}.mp4?${j.result}`, "_blank"); }
    },
    async onDropMedia(files) {
      for (const f of files) {
        try {
          toast(`„${f.name}" wird hochgeladen`);
          const r = await upload(f, `projects/${id}/media?`);
          p.media.push(r.name);
          const s = p.scenes[sel], def = s && T[s.template];
          if (def?.media) { s.media = s.media || []; const n = [...Array(def.media).keys()].find((n) => !s.media[n]); if (n != null) s.media[n] = r.name; }
          else { const st = +Math.min(video.currentTime || 0, Math.max(0, p.duration - 1)).toFixed(2); p.scenes.push({ template: "b-roll", start: st, duration: +Math.min(4, p.duration - st).toFixed(2), vars: {}, media: [r.name] }); sel = p.scenes.length - 1; }
          save(); drawTimeline(); drawPanel();
        } catch (e) { toast(e.message); }
      }
    },
  };
}

// ------------------------------------------------------------------ router
async function route() {
  view?.destroy?.(); view = null;
  const m = location.hash.match(/^#\/p\/([a-z0-9_-]+)/);
  await poll();
  view = m ? await Editor(m[1]) : Home();
}
addEventListener("hashchange", route);
route();
