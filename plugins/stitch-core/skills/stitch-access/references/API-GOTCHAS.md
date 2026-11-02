# Stitch API gotchas — verified against the live API (2026-11)

Everything here was learned the hard way against
`https://stitch.googleapis.com/mcp` and `@google/stitch-sdk` v0.3.5.

## 1. The MCP 180s timeout vs long generations

`generate_screen_from_text` and `edit_screens` take ~1–3+ minutes.
MCP clients (Roo/Zoo and others) commonly cap requests at 180s:

- The client aborts; **the server keeps generating**.
- Correct protocol: do NOT retry. Poll `list_screens` / `get_screen`
  every ~30s until the screen appears with
  `screenMetadata.status: "COMPLETE"`.
- Retrying duplicates generations and burns quota.
- The SDK has no such cap — for pipelines prefer
  `stitch.callTool(...)` which simply waits.

## 2. Tool responses are wrapped in `outputComponents`

Both MCP and SDK tool calls return:

```json
{
  "outputComponents": [
    { "design": { "screens": [ …screen objects… ], "theme": {} } },
    { "text": "model narration of what it built" },
    { "suggestion": "follow-up idea" }
  ],
  "projectId": "…",
  "sessionId": "…"
}
```

Extract screens with:

```js
const screens = (res.outputComponents ?? [])
  .flatMap(c => c.design?.screens ?? []);
```

The SDK README's `res.screens` examples do not match the live shape.
A silent-empty parse here makes a successful generation look like a
failure.

Screen objects carry `id`, `name` (full resource name), `title`,
`width`/`height` (2x scale), `htmlCode.downloadUrl`,
`screenshot.downloadUrl`, `screenMetadata.status`.

## 3. File downloads: auth header + JSON envelope

`…/v1/projects/<p>/files/<id>:download` URLs:

- require header `X-Goog-Api-Key: <key>` (a bare fetch returns a small
  JSON error envelope — a 660-byte "file" is this, not corruption);
- return `{"dataString": "…"}` — base64 when `imageMetadata` is
  present, plain content otherwise:

```js
const r = await fetch(url, { headers: { "X-Goog-Api-Key": KEY } });
const j = await r.json();
const file = j.imageMetadata
  ? Buffer.from(j.dataString, "base64")
  : j.dataString;
```

The MCP `download_file` tool does both steps for you — prefer it in
agent sessions.

## 4. Full resource names everywhere

`get_screen` wants `name: "projects/<p>/screens/<s>"`. Bare screen ids
return "Request contains an invalid argument". Same for other tools
that reference existing objects (`apply_design_system` wants
`assets/<id>`, screen instances `{id, sourceScreen}`).

## 5. Broken server-side tools / wrappers (as of 2026-11)

- `create_design_system` (MCP and SDK): rejects every payload shape
  with "invalid argument", even minimal valid ones. Workaround: don't
  pre-create design systems — the **first screen generated in a project
  auto-creates a fitting design system from the prompt prose**; put the
  art direction (palette, fonts, mood, component rules) into the
  generation prompt and pass `designSystem: assets/<id>` on later
  screens for consistency.
- SDK wrappers `stitch.createProject()`, `project.generate()`,
  `project.getScreen(bareId)`: same server-side rejection. The SDK
  ships `repairToolSchemas` — known problem. Use `stitch.callTool()`.
- `stitch.projects()` / `project.screens()`: work fine. Screen objects
  expose `.data` (raw) — titles etc. live there, not as direct props.

## 6. Where the truth lives

- The docs site (stitch.withgoogle.com/docs/…) is a JS SPA that returns
  an empty shell to fetchers and even to headless browsers.
- Source of truth: **github.com/google-labs-code/stitch-sdk**
  (README + `.agents/skills/stitch-sdk-usage/SKILL.md`).
- Sibling package `@google/stitch` (CLI): `stitch capture <url>`
  snapshots a live page to self-contained HTML, `stitch upload screen`,
  `stitch edit screen`, `stitch generate screen --new-project …`.

## 7. Working loop (canonical)

See `assets/sdk-tool-client-example.mjs` — create project (callTool) →
generate (callTool, parse outputComponents) → download assets (header +
envelope unwrap) → edit (callTool) → download again. Verified
end-to-end.
