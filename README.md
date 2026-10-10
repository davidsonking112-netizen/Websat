# Websat

A lightweight UI-first recreation inspired by ChatGPT Canvas and the Jan open-source AI workspace, rebranded as **Forge**.

The workspace-first UX includes Projects, Assistants, Model Hub, local thread context, a command palette, Canvas mode, local preview responses, and optional live model-provider connections.

The prototype is functional in-browser:

- Threads persist locally in the browser via `localStorage` and can be created, switched, searched, edited, regenerated, continued, and restored.
- Local state is validated on load and guarded against malformed or unavailable browser storage.
- Projects, Assistants, and Model Hub open real workspace views.
- Canvas opens an editable work surface with local save, version history, restore, and export tools.
- Composer interactions, model switching, keyboard shortcuts, context drawer, and local preview responses work without a server.
- Forge can connect to Ollama (`/api/chat`) or OpenAI-compatible chat-completions endpoints. Browser requests stream when the endpoint supports it; Electron uses buffered main-process requests to avoid renderer CORS restrictions, so desktop replies currently arrive as complete messages rather than progressive tokens.
- Provider requests include the global system prompt, active assistant instructions, saved project instructions, recent thread history, and readable local attachment contents.
- Provider endpoints, model names, and Bearer API keys are configurable in Settings. A blank key field preserves the saved key; key deletion is explicit. Electron stores keys with `safeStorage` and attaches them from the main process; browser mode stores them in local storage and the provider must permit browser CORS.
- OpenAI-compatible and Ollama tool-call responses can invoke MCP tools, pass results back to the model, and continue to a final answer. Per-turn execution is bounded to 8 MCP calls and 6 model/tool rounds.
- Attachments are now ingested locally: text/code files are read for context, images receive local previews, large text files are truncated safely, and attachment status is visible in the context drawer.
- Voice input uses the browser Speech Recognition API when available and gives a clear permission/support fallback when it is not.
- Share exports now include Markdown copy/download, JSON download, and the device share sheet where supported; no remote link is implied.
- Search is unified across threads, message text, attachment names/content, projects, project files, assistants, models, and the current Canvas draft.
- Message and file names are rendered with safe DOM/text handling.
- Complete thread and message histories remain accessible and are included in model context within the request-history limit.
- Multiple tabs can refresh from local-storage changes.

## Run locally

```bash
python3 -m http.server 4173
```

Then open <http://localhost:4173>.

This is still a front-end prototype: it has no user authentication, server-side database, or remote synchronization. Browser provider requests require the provider's CORS policy to allow the Websat origin; Electron uses the main-process transport instead. MCP connections support Streamable HTTP JSON-RPC initialization, paginated tool discovery, notifications, session headers, manual calls, and model-triggered calls. MCP OAuth flows and per-server credential configuration are not implemented yet.

### Connect providers and MCP tools

1. Open **Settings**, configure the provider type, base URL, model, and API key, then enable the real model. The **Global instructions** field is sent as the top-level system message on every live-model request.
2. Open **Assistants & tools**, add an MCP Streamable HTTP endpoint, enable it, and select **Discover**.
3. Edit an assistant, allowlist the discovered MCP tools, and enable **Network tools** permission. Read-only/destructive annotations also require the corresponding assistant permission.
4. Tool connections require approval by default. The connection's **Auto-call** setting disables that confirmation; use it only for trusted endpoints and actions.

## Validation

Validation covers Vitest source checks, Playwright browser regressions for provider authentication/system prompts, Ollama streaming, MCP tool execution and discovery pagination, the production build, and Electron main/preload syntax checks.

### Forge research demo

Run `npm run dev -- --host 0.0.0.0` and open `/?forgeDemo=all` to load a reproducible local demo pack. It seeds Canvas with an AI-assisted 450-word, source-linked Nigeria fuel-subsidy essay and an eight-slide outline, plus separate threads for a 52-message Gen Z/Gen Alpha debate and a before/after Forge deployment refactor. The demo is URL-triggered and does not alter the normal workspace unless that URL is used.


## Production foundation

Websat now has a Vite build/dev workflow, automated source smoke tests with Vitest, a Playwright keyboard/console smoke test, local appearance/onboarding settings, custom assistants, guarded MCP/tool connections, and real provider integration.

Windows packaging is configured with Electron + electron-builder:

```bash
npm install
npm run build
npm run desktop:build
```

The Windows workflow publishes tagged `vX.Y.Z` builds through GitHub Releases.

### Safety model

Tool connections are stored locally, disabled by default, and marked confirmation-required by default. A model only sees tools that are enabled, allowlisted for the active assistant, and permitted by its network/read/write permissions. The connection-level confirmation setting defaults on; turning it off allows model-initiated calls to execute without a per-call prompt. Requests are bounded and remote endpoints must use HTTPS; plain HTTP is limited to loopback.

### Desktop shell

The Electron build adds native capabilities without exposing Node APIs to the renderer:

- Provider API keys are stored with Electron `safeStorage`, never decrypted into the renderer during normal requests, and sent by the main-process provider transport.
- Provider and MCP network calls run in the main process with URL/scheme checks, timeouts, response-size limits, and redirects disabled, avoiding the renderer's CORS restrictions.
- Native file dialogs read text and image attachments with the same size limits as browser mode.
- Assistant responses can trigger system notifications when supported by the operating system.
- Native File/View menus expose new thread, open files, context, Canvas, settings, reload, and developer tools actions.
- Renderer navigation is restricted to the app, external popups are HTTPS-only, and a Content Security Policy blocks untrusted scripts and embedded objects. Provider/MCP connections may use HTTPS or loopback HTTP for local services.

Browser mode continues to use the file input and browser storage fallback. Browser-based remote provider and MCP calls still depend on the target server's CORS policy.

### Architecture note

The current UI remains a carefully preserved vanilla runtime while the Vite build/test boundary is introduced. A full React component migration is intentionally **not** performed in this release because replacing the working DOM architecture in one pass would create unnecessary regression risk. React's current client model expects the framework to own a root and its component tree, so the migration should be a dedicated, tested phase rather than an unused dependency added for appearance.
