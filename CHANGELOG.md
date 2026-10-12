# Changelog

## Unreleased — Core polish and P0 agentic foundations

### Added
- Canvas AI writing tools now use the explicitly configured provider and disclose that the draft and recent thread context are sent; these actions do not invoke MCP tools.
- Canvas drafts autosave locally while editing; manual saves remain version checkpoints, and provider edits retain a restore point of the prior draft.
- Runtime switching now selects the deterministic local preview or an actually configured provider, with the active endpoint shown in the UI.
- Code export extracts one fenced code block and selects a suitable extension; full and multi-block drafts remain available through Markdown export.
- Provider-backed agent runs now have pause/stop controls, restart recovery, a bounded local audit log, originating-thread targeting, explicit retry, and per-tool action approvals.
- Threads can explicitly select one project for model context; unrelated project instructions/files are excluded, including in local-preview responses.

### Fixed
- Removed placeholder Canvas transformations that truncated drafts or appended fake “polish” text.
- Prevented model and privacy labels from claiming a remote provider is private/on-device, and removed the nonfunctional “Forge Reasoning” option.
- Rejected insecure remote HTTP provider URLs and downgraded unsafe legacy provider settings to local preview.
- PDF export now preserves whitespace in a preformatted print surface.
- Real-provider regeneration now sends only history preceding the targeted user turn, rather than accidentally including later conversation turns.
- Restarted active runs are persisted as interrupted exactly once; cross-tab updates preserve a live run and its originating thread/result.
- Rapid local-preview sends no longer cancel an earlier response or strand a typing indicator; message edits/deletes/regeneration are blocked while a response is active.
- Browser and Electron provider/MCP responses are capped at 10 MB while streaming; large text attachments are read only up to the 1 MiB context limit.
- Electron notification IPC now rejects untrusted renderer senders, and MCP permission wording accurately describes read-only tools.

### Reliability
- GitHub Actions now uses `npm ci`, installs Chromium, runs Playwright browser regressions, builds production assets, and syntax-checks Electron main/preload files.
- Validation includes mock-provider/MCP tests for scoped regeneration, approval, pause/stop/recovery, cross-tab runs, and large-file bounds; no real provider credentials are used.

## 0.2.0 — 2026-10-04

### Added
- Custom assistants with editable instructions.
- Assistant tool allowlists and read/write/network permission settings.
- Local MCP/tool connection records with disabled-by-default and confirmation-required safety defaults.
- Light, dark, and system themes.
- Reduced-motion preference and visible keyboard focus states.
- First-run onboarding.
- Settings workspace.
- Vite development and production build scripts.
- Vitest source smoke tests.
- Playwright keyboard/console smoke test.
- Windows Electron packaging configuration.
- GitHub Actions CI and Windows release workflow.

### Reliability
- Local state remains guarded and validated.
- Workspace features remain local-first and require no backend.
