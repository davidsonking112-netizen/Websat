# Changelog

## 0.2.1 — 2026-10-04

- Removed the arbitrary 36-message render window; full thread history now remains navigable.
- Fixed regeneration so an assistant response is replaced at its original position instead of being appended to the end.
- Hardened state normalization for assistants, permissions, models, and tool connections.
- Hardened cross-tab recovery and stale simulated responses.
- Added renderer CSP and stricter Electron navigation/external-window handling.
- Completed dark/system theme surface coverage and improved ARIA state synchronization.


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
