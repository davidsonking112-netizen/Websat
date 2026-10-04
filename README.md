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
