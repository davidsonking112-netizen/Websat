# Websat

A lightweight UI-first recreation inspired by ChatGPT Canvas and the Jan open-source AI workspace, rebranded as **Forge**.

The current UX pass is workspace-first: Projects, Assistants, Model Hub, local thread context, a command palette, Canvas mode, and simulated local responses are represented without a backend or model calls.

The prototype is functional in-browser:

- Threads persist locally in the browser via `localStorage` and can be created, switched, searched, edited, regenerated, continued, and restored.
- Local state is validated on load and guarded against malformed or unavailable browser storage.
- Projects, Assistants, and Model Hub open real workspace views.
- Canvas opens an editable work surface with local save, version history, restore, and export tools.
- Composer interactions, model switching, keyboard shortcuts, context drawer, and simulated responses work without a server.
- Message and file names are rendered with safe DOM/text handling.
- Long conversations use a bounded render window while keeping the full local message history.
- Multiple tabs can refresh from local-storage changes.

## Run locally

```bash
python3 -m http.server 4173
```

Then open <http://localhost:4173>.

This is still a front-end prototype: it has no real model provider, authentication, server-side database, or remote synchronization. File attachments currently store local metadata only; their contents are not uploaded or parsed.

## Validation

The production branch remains unchanged while fixes are developed on the `fix/websat-stability-security` branch. The repaired `app.js` passes JavaScript syntax validation after the changes.


## Production foundation

Websat now has a Vite build/dev workflow, automated source smoke tests with Vitest, a Playwright keyboard/console smoke test, local appearance/onboarding settings, custom assistants, and guarded MCP/tool connection records.

Windows packaging is configured with Electron + electron-builder:

```bash
npm install
npm run build
npm run desktop:build
```

The Windows workflow publishes tagged `vX.Y.Z` builds through GitHub Releases.

### Safety model

Tool connections are stored locally, disabled by default, and marked confirmation-required by default. Assistant permissions explicitly separate local-file read, local-file write, and network capabilities. The current frontend does not execute MCP servers itself; these records define the permission boundary for the future tool runtime.

### Architecture note

The current UI remains a carefully preserved vanilla runtime while the Vite build/test boundary is introduced. A full React component migration is intentionally **not** performed in this release because replacing the working DOM architecture in one pass would create unnecessary regression risk. React's current client model expects the framework to own a root and its component tree, so the migration should be a dedicated, tested phase rather than an unused dependency added for appearance. citeturn2search0turn2search1
