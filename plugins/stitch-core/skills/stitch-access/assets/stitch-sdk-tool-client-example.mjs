// Canonical Stitch SDK loop — verified against the live API.
// Setup:  npm install @google/stitch-sdk   (Node >= 18)
//         export STITCH_API_KEY=...        (stitch.withgoogle.com -> Settings -> API keys)
// Run:    node stitch-sdk-tool-client-example.mjs
//
// Uses ONLY the reliable surface: stitch.projects / project.screens /
// stitch.callTool (the convenience wrappers createProject/generate/
// getScreen are broken server-side as of SDK v0.3.5 — see
// references/API-GOTCHAS.md).
import { stitch } from "@google/stitch-sdk";
import { writeFileSync } from "node:fs";

const KEY = process.env.STITCH_API_KEY;
if (!KEY) throw new Error("STITCH_API_KEY not set");
const log = (...a) => console.log("[stitch]", ...a);
const tool = (name, args) => stitch.callTool(name, args);

// --- responses wrap screens in outputComponents[] — ALWAYS parse like this
const screensFrom = (res) =>
  (res.outputComponents ?? []).flatMap((c) => c.design?.screens ?? []);

// --- file downloads need the API-key header and {dataString} unwrap
const download = async (label, url, file) => {
  const r = await fetch(url, { headers: { "X-Goog-Api-Key": KEY } });
  const j = await r.json(); // {"dataString": "...", "imageMetadata": {...}?}
  writeFileSync(file, j.imageMetadata
    ? Buffer.from(j.dataString, "base64")   // image
    : j.dataString);                        // html
  log(`${label} -> ${file}`);
};

const saveScreens = async (screens, tag) => {
  for (const s of screens) {
    const id = (s.name ?? s.id ?? "").replace(/^.*screens\//, "");
    log(`${tag}:`, id, "|", s.title, `| ${s.width}x${s.height}`, "|", s.screenMetadata?.status);
    if (s.htmlCode?.downloadUrl)
      await download(`${tag} html`, s.htmlCode.downloadUrl, `stitch-${tag}-${id}.html`);
    if (s.screenshot?.downloadUrl)
      await download(`${tag} png`, s.screenshot.downloadUrl, `stitch-${tag}-${id}.png`);
    return id;
  }
};

// 1) create a project (tool client, NOT the broken createProject wrapper)
const created = await tool("create_project", { title: "SDK example" });
const projectId = (created.name ?? created.project?.name ?? "")
  .replace("projects/", "");
log("project:", projectId);

// 2) generate — put the full art direction in the prompt; the first
//    screen auto-creates a fitting design system
const PROMPT = [
  "A square 1080x1080 social share card for a fan-community site.",
  "Style: warm cream background, dark ink outlines (2px), hard offset shadows,",
  "one vivid accent color, chunky display type, sticker/pill chips,",
  "one taped polaroid photo rotated -2deg. Celebratory, not corporate.",
  "Content: giant headline 'You're Fan #4,212', small caps subline,",
  "tiny footer with a URL. All numbers in tabular figures.",
].join(" ");

const gen = await tool("generate_screen_from_text", {
  projectId,
  prompt: PROMPT,
  deviceType: "AGNOSTIC", // or MOBILE | DESKTOP | TABLET
});
const v1Id = await saveScreens(screensFrom(gen), "v1");

// 3) edit one screen — same response shape
const edit = await tool("edit_screens", {
  projectId,
  selectedScreenIds: [v1Id],
  prompt: "Add a small starburst sticker in the top-right corner saying 'EST. FAN'. Keep everything else identical.",
});
await saveScreens(screensFrom(edit), "v2");

// 4) read paths that work without wrappers
const screens = await stitch.project(projectId).screens();
log("project now has", screens.length, "screen(s)");

await stitch.close();
log("done.");
