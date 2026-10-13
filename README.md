# Websat

A lightweight UI-first recreation inspired by ChatGPT Canvas and the Jan open-source AI workspace, rebranded as **Forge**.

The workspace-first UX includes Projects, Assistants, Model Hub, local thread context, a command palette, Canvas mode, local preview responses, and optional live model-provider connections.

The prototype is functional in-browser:

- Threads persist locally in the browser via `localStorage` and can be created, switched, searched, edited, regenerated, continued, and restored.
- Local state is validated on load and guarded against malformed or unavailable browser storage.
- Projects, Assistants, and Model Hub open real workspace views.
- Canvas opens an editable work surface with local draft autosave, explicit version checkpoints, restore, and export tools. Its writing actions use the configured provider only when explicitly clicked; they never invoke MCP tools, and each successful rewrite keeps the prior draft as a restore point. Code export extracts a single fenced block with a matching file extension, while Markdown preserves full or multi-block drafts.
- Composer interactions, runtime switching between deterministic local preview and a configured provider, keyboard shortcuts, and the context drawer work without a server. The active-runtime indicator identifies when prompts are sent to a configured endpoint.
- The composer keeps ordinary **Chat** as its default and offers **Auto / Low / Medium / High** reasoning guidance for either chat or Agent Tasks. Auto preserves the existing behavior. Base chat applies guidance through the system prompt without sending provider-specific reasoning fields; Agent Tasks also adjust their bounded output and verification budgets. Provider-native reasoning support varies, and High can use more provider tokens or evaluation calls. The local preview makes no model request.
- Forge can connect to Ollama (`/api/chat`) or OpenAI-compatible chat-completions endpoints. Browser requests stream when the endpoint supports it; Electron uses buffered main-process requests to avoid renderer CORS restrictions, so desktop replies currently arrive as complete messages rather than progressive tokens.
- Provider requests include the global system prompt, active assistant instructions, recent thread history, and readable thread attachments. Regenerating an earlier turn sends only history up to that user message. Project instructions and text files are included only when that specific thread explicitly selects that project; project memory must also be on. Unselected projects are never included, including in local preview responses.
- Provider endpoints, model names, and Bearer API keys are configurable in Settings. Remote endpoints must use HTTPS; HTTP is allowed only for loopback. When enabled, prompts, recent thread history, system/assistant/project instructions, and readable attachment text are sent to the configured endpoint. A blank key field preserves the saved key; key deletion is explicit. Electron stores keys with `safeStorage` and attaches them from the main process; browser mode stores them in local storage and the provider must permit browser CORS.
- OpenAI-compatible and Ollama tool-call responses can invoke MCP tools, pass results back to the model, and continue to a final answer. Per-turn execution is bounded to 8 MCP calls and 6 model/tool rounds. Provider-backed turns have pause/stop controls, approval checkpoints, and a bounded local run log.
- Attachments are now ingested locally: text/code files are read for context, images receive local previews, text reads stop at 1 MiB, and attachment status is visible in the context drawer. Provider/MCP responses are capped at 10 MiB while being read.
- Voice input uses the browser Speech Recognition API when available and gives a clear permission/support fallback when it is not.
- Share exports now include Markdown copy/download, JSON download, and the device share sheet where supported; no remote link is implied.
- Search is unified across threads, message text, attachment names/content, projects, project files, assistants, models, and the current Canvas draft.
- Message and file names are rendered with safe DOM/text handling.
- Complete thread and message histories remain accessible and are included in model context within the request-history limit.
- Multiple tabs refresh from local-storage changes; a live provider run keeps its run record and saves its eventual response to the originating thread even if another tab changes the active thread.

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
4. Tool policies are configured per assistant and per tool. Ask-per-action is the default. Only server-declared read-only tools may be configured for approval once per run or automatic read-only access. Write-capable, destructive, and unclassified tools always require approval.


### Agent tasks and execution

The composer offers **Chat** and **Agent task** as separate, intentional choices; Agent Tasks appear inline in the same conversation rather than taking over ordinary chat. Linked tasks inherit that thread's recent history, attachments, global instructions, and only its explicitly selected project. The **Review plan first** option stores generated steps as `needs_review`; background recovery will not start those steps until the user clicks **Run / resume**. The Agents workspace remains available for wider oversight.

Forge's **Agents** workspace supports model-planned task decomposition when a live provider is enabled, with a deterministic local plan as a fallback. Plans use explicit prerequisite edges: independent steps can run concurrently, while synthesis and review wait for their prerequisites. Forge caps concurrency at **3 tasks globally and 3 steps per task** to bound provider load and prevent unbounded fan-out. Each step receives the task objective, selected thread context when linked, and completed-step results; the final review checks evidence, missing requirements, and unresolved gaps. Tool access still follows the active assistant's MCP allowlist, permissions, confirmation policy, and per-turn execution limits.

**Adaptive test-time compute** starts with a bounded inference-token budget selected from task complexity and risk signals. For steps that merit extra scrutiny, a separate evaluator pass estimates confidence and flags material gaps; Forge performs at most two additional refinement passes, increases the token budget within a hard cap, and records the selected budget, pass count, confidence, and reason. This is a heuristic inference-time refinement loop, not a calibrated probability of correctness; evaluation calls add latency and provider cost, the evaluator uses the configured model and is not an independent-model guarantee.

Task state, step outcomes, the latest result, run count, compute metadata, and a bounded execution log are persisted locally. Each task can be duplicated into a fresh queued copy with new step IDs and remapped dependencies; recurring schedules are disabled on copies to avoid accidental repeated runs. The task's execution report can be exported as JSON with step results, dependency metadata, adaptive-compute details, and the most recent 100 log events. Pause is a safe checkpoint: in-flight provider/tool requests finish, and unfinished steps remain resumable. Recurring tasks begin a fresh step cycle when due. Scheduling only runs while Forge is open; it is not an always-on background service. A planned or completed step is not proof that an external action succeeded—review the recorded output and evidence.

## Validation

Validation covers Vitest source checks, Playwright browser regressions for provider authentication/system prompts, Canvas autosave/provider-backed edits/code export, runtime privacy disclosure, Ollama streaming, MCP tool execution and discovery pagination, thread-scoped project context, action approval, run pause/stop/recovery, the production build, and Electron main/preload syntax checks. GitHub Actions installs Chromium and runs the browser suite on pushes and pull requests.

### Forge research demo

Run `npm run dev -- --host 0.0.0.0` and open `/?forgeDemo=all` to load a reproducible local demo pack. It seeds Canvas with an AI-assisted 450-word, source-linked Nigeria fuel-subsidy essay and an eight-slide outline, plus separate threads for a 52-message Gen Z/Gen Alpha debate and a before/after Forge deployment refactor. The demo is URL-triggered and does not alter the normal workspace unless that URL is used.


## Production foundation

Websat now has a Vite build/dev workflow, Vitest source tests, a full Playwright browser regression suite in CI, local appearance/onboarding settings, custom assistants, guarded MCP/tool connections, provider-backed Canvas writing tools, and real provider integration.

Windows packaging is configured with Electron + electron-builder:

```bash
npm install
npm run build
npm run desktop:build
```

The Windows workflow publishes tagged `vX.Y.Z` builds through GitHub Releases.

### Safety model

Tool connections are stored locally and disabled by default. A model only sees tools that are enabled, allowlisted for the active assistant, and permitted by that assistant’s Network plus Read (verified read-only) or Write (write-capable/unclassified) permission. Approval is per assistant/tool: ask-per-action is the default; only verified read-only tools may use per-run approval or auto-read. Before an action, Forge shows its server endpoint, risk, exact arguments, and where the result will go. The run log is bounded and local. Pause takes effect at the next safe checkpoint after the current operation; Stop cancels in-flight provider/MCP requests where supported and prevents later actions, but cannot undo external side effects already completed. Interrupted runs are never replayed automatically. A retry starts a new run only after explicit confirmation. Remote endpoints must use HTTPS; plain HTTP is limited to loopback.

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


## Forge reliability and release checks

The Forge runtime bounds each task to three parallel steps and the application to three concurrent tasks. Provider inference is the dominant variable cost: adaptive evaluation can add up to two evaluation/refinement passes per step and therefore adds latency and provider usage. The evaluator uses the configured model, so its confidence score is a heuristic and not an independently calibrated probability. Browser/research steps require an enabled, allowlisted browser/search MCP tool; the app does not silently substitute a live browser when none is connected.

Provider requests default to a 120-second timeout. The internal `settings.provider.requestTimeoutMs` value is normalized to 250–120,000 ms and is intended for controlled local configurations and tests; it is not exposed as a separate settings control. Streaming aborts are surfaced as timeout errors. Pause and cancel both wait for current in-flight requests to reach a safe checkpoint; they do not forcibly interrupt model or MCP work. Cancelled tasks preserve unfinished steps and can be resumed manually. Failed/blocked steps can be retried after correcting the underlying issue. Saved work resumes only while the app is open, and closing the app/browser is not a guarantee of background execution.

### Reliability verification

CI runs source tests, Playwright browser tests, the production build, and Electron main/preload syntax checks. The Forge Playwright suite uses a mocked OpenAI-compatible endpoint to test independent-step concurrency and dependency ordering, pause/resume/cancel checkpoints, restart recovery, failed-step retry, adaptive-compute limits, dependency-cycle handling, provider timeout errors, task duplication, and JSON report export.

Run the checks locally:

```bash
npm ci
npx playwright install chromium
npm test
npm run test:a11y
npm run build
node --check electron/main.cjs
node --check electron/preload.cjs
```

### Manual release-candidate smoke test

Automated tests do not replace a packaged-app check. Before publishing a Windows release candidate:

1. Build the installer with `npm run desktop:build` on a supported Windows runner.
2. Install and launch the packaged app; create a task with a configured test provider and confirm the task queue updates during execution.
3. Verify pause reaches a safe checkpoint, resume continues queued work, and a failed step can be retried.
4. Confirm duplicate tasks have new step IDs and disabled recurring schedules; export a JSON report and validate its contents.
5. Verify a stalled provider produces a timeout message, restart the app and check persisted task state, then inspect memory/CPU while three tasks are active.
6. Confirm provider keys remain hidden in the renderer and no unexpected external action runs without an enabled/allowlisted tool and any required confirmation.
7. Record OS, build commit, provider type, test results, and any limitations before tagging a release.

Do not call the application production-ready until the packaged-app smoke test is completed on the target OS. The automated suite validates mocked provider behavior; real-provider, real-MCP, and operating-system packaging behavior still require environment-specific verification.
