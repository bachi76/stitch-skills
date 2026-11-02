---
name: stitch-access
description: "Connect to Google Stitch via MCP or the @google/stitch-sdk and survive its API quirks: 180s MCP timeouts, {dataString} download envelopes, broken SDK wrappers, outputComponents response shape. Entry point that routes to the stitch design/utilities workflow skills."
license: MIT
compatibility: universal
metadata:
  author: bachi
  version: 0.1.0
---

# Stitch access — connect, survive the API, route to the right skill

Google Stitch (stitch.withgoogle.com) generates UI screens from text
prompts. This skill is the **access layer**: how to connect (MCP for
agent chat, SDK for scripts) and the API gotchas that break naive
integrations. It does NOT teach design workflows — it routes to the
skills that do (see routing table).

## When to use which connection

| | MCP server | SDK (`@google/stitch-sdk`) |
|---|---|---|
| Best for | interactive agent sessions | scripts, pipelines, batch jobs |
| Setup | register server once | `npm i @google/stitch-sdk` + env |
| Long generations | **times out at 180s** → poll (below) | waits natively (1–3 min) |
| File access | `download_file` tool (handles auth) | your fetch + envelope unwrap |

**API key** (same key for both): stitch.withgoogle.com → profile →
Settings → API keys. Env var `STITCH_API_KEY` for the SDK.

## MCP setup

Server: `https://stitch.googleapis.com/mcp`, header `X-Goog-Api-Key`.
Roo/Zoo `.roo/mcp.json` shape (other clients analogous):

```json
"stitch": {
  "type": "streamable-http",
  "url": "https://stitch.googleapis.com/mcp",
  "headers": { "X-Goog-Api-Key": "YOUR_KEY" },
  "disabled": false,
  "alwaysAllow": [],
  "timeout": 180
}
```

**MCP timeout protocol (critical):** `generate_screen_from_text` /
`edit_screens` regularly exceed 180s. The call times out client-side
but **keeps running server-side**. Never retry — poll `list_screens`
(or `get_screen`) every ~30s until the new screen appears with status
COMPLETE. Retrying duplicates generations.

## SDK quickstart (Node ≥ 18)

```js
import { stitch } from "@google/stitch-sdk";   // STITCH_API_KEY in env
const projects = await stitch.projects();        // works
const screens  = await stitch.project(id).screens(); // works
const res = await stitch.callTool("generate_screen_from_text",
  { projectId, prompt, deviceType: "MOBILE" });  // works — use THIS
```

⚠️ v0.3.5 convenience wrappers `createProject()`, `project.generate()`,
`getScreen(bareId)` fail server-side ("invalid argument") — always use
`callTool()` with the MCP tool names and payloads. Screens come back at
`res.outputComponents[].design.screens[]` (NOT `res.screens` — parsing
that silently loses results).

Full proven loop incl. asset download: run
[`assets/sdk-tool-client-example.mjs`](assets/sdk-tool-client-example.mjs).

## Gotchas index (details in [references/API-GOTCHAS.md](references/API-GOTCHAS.md))

1. File downloads (`…/files/<id>:download`) need the `X-Goog-Api-Key`
   header AND return a JSON envelope `{"dataString": …}` — base64 for
   images, plain text for HTML.
2. Screen refs need FULL resource names: `projects/<p>/screens/<s>`.
3. The first screen generated in a project auto-creates a fitting
   design system — put the art direction in the prompt prose instead of
   pre-creating one (`create_design_system` is currently broken
   server-side).
4. The docs site is an unreadable JS SPA; the source of truth is
   github.com/google-labs-code/stitch-sdk.
5. Sibling CLI `npx @google/stitch` does `capture <url>` (snapshot live
   page → Stitch), `upload screen`, `edit screen` — handy for
   code-to-design flows.

## Routing to the workflow skills

| Task | Skill |
|---|---|
| Generate/edit screens, design systems, MCP workflow | `generate-design`, `manage-design-system` |
| Vague idea → strong prompt | `enhance-prompt`, `taste-design` |
| Frontend code → Stitch project | `code-to-design`, `extract-static-html`, `upload-to-stitch` |
| Stitch project → design system doc | `extract-design-md`, `design-md` |
| Site brief → project constitution | `site-md` |
| Iterative site building loop | `stitch-loop` |

## Troubleshooting

- "Request contains an invalid argument" → wrong payload shape or bare
  id where a full resource name is required (gotchas 2, 3).
- Empty screens after a "successful" generate → you parsed `res.screens`
  instead of `outputComponents` (see above).
- 660-byte "files" → you fetched a download URL without the API-key
  header; you got the error envelope (gotcha 1).
