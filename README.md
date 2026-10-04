# Websat

A lightweight UI-only recreation inspired by ChatGPT Canvas and the Jan open-source AI workspace, rebranded as **Forge**.

The current UX pass is workspace-first: Projects, Assistants, Model Hub, local thread context, a command palette, Canvas mode, and simulated local responses are represented without backend or model calls.

## Run locally

```bash
python3 -m http.server 4173
```

Then open <http://localhost:4173>.

This is a front-end mockup only: it has no model provider, authentication, persistence, or backend connection.
