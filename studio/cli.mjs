#!/usr/bin/env node
// CLI for the same project model the studio UI uses.
//   node studio/cli.mjs new <name> [landscape|portrait] [video]
//   node studio/cli.mjs captions <project> <transcripts/x.json> [maxWords]
//   node studio/cli.mjs build <project>
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import * as core from "./core.mjs";

const [cmd, a, b, c] = process.argv.slice(2);
if (cmd === "new") {
  const id = core.freeId(a);
  let duration = 10, hasVideo = false;
  if (c) duration = parseFloat(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", c]).toString());
  const p = core.createProject({ id, title: a, shape: b || "landscape", duration, hasVideo: false });
  if (c) { fs.copyFileSync(c, path.join(core.projectDir(id), "media/main.mp4")); p.hasVideo = true; core.saveProject(p); }
  console.log(`created projects/${id} (${p.shape}, ${duration.toFixed(2)}s)`);
} else if (cmd === "captions") {
  const p = core.loadProject(a);
  if (c) p.captions.maxWords = +c;
  p.captions.groups = core.groupWords(core.wordsFromWhisper(JSON.parse(fs.readFileSync(b, "utf8"))), { maxWords: p.captions.maxWords });
  core.saveProject(p);
  console.log(`${p.captions.groups.length} caption groups -> projects/${a}`);
} else if (cmd === "build") {
  core.build(core.loadProject(a));
  console.log(`built projects/${a}/index.html`);
} else {
  console.log("usage: cli.mjs new <name> [landscape|portrait] [video] | captions <project> <transcript.json> [maxWords] | build <project>");
  process.exit(1);
}
