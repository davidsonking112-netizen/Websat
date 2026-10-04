# Websat

A lightweight UI-only recreation inspired by ChatGPT Canvas and the Jan open-source AI workspace, rebranded as **Forge**.

The current UX pass is workspace-first: Projects, Assistants, Model Hub, local thread context, a command palette, Canvas mode, and simulated local responses are represented without backend or model calls.

The prototype is now functional in-browser:

- Threads persist to `localStorage` and can be created, switched, and restored.
- Projects, Assistants, and Model Hub open real workspace views.
- Canvas opens an editable work surface with local save and quick editing tools.
- Composer interactions, model switching, keyboard shortcuts, context drawer, and simulated responses work without a server.

The latest prototype pass also adds:

- Copy, edit, regenerate, continue, and delete message actions.
- Markdown/code rendering with lightweight syntax highlighting and code copy.
- File/image attachment chips per conversation.
- Search filtering and windowed rendering for long conversations.
- Side-by-side Canvas context, version restore, Markdown/PDF/code export.
- Local project creation, rename/delete/switch, files, folders, instructions, memory toggle, and project-file attachment.

## Run locally

```bash
python3 -m http.server 4173
```

Then open <http://localhost:4173>.

This is a front-end mockup only: it has no model provider, authentication, persistence, or backend connection.
