# Changelog

## Unreleased — Core polish before agentic expansion

### Added
- Canvas AI writing tools now use the explicitly configured provider and disclose that the draft and recent thread context are sent; these actions do not invoke MCP tools.
- Canvas drafts autosave locally while editing; manual saves remain version checkpoints, and provider edits retain a restore point of the prior draft.
- Runtime switching now selects the deterministic local preview or an actually configured provider, with the active endpoint shown in the UI.
- Code export extracts one fenced code block and selects a suitable extension; full and multi-block drafts remain available through Markdown export.

### Fixed
- Removed placeholder Canvas transformations that truncated drafts or appended fake “polish” text.
- Prevented model and privacy labels from claiming a remote provider is private/on-device, and removed the nonfunctional “Forge Reasoning” option.
- Rejected insecure remote HTTP provider URLs and downgraded unsafe legacy provider settings to local preview.
- PDF export now preserves whitespace in a preformatted print surface.

### Reliability
- GitHub Actions now uses `npm ci`, installs Chromium, runs Playwright browser regressions, builds production assets, and syntax-checks Electron main/preload files.

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
