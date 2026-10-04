import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Script } from 'node:vm';
import { describe, expect, test } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const read = (file) => readFileSync(resolve(root, file), 'utf8');

describe('Websat production smoke checks', () => {
  test('application JavaScript parses', () => {
    expect(() => new Script(read('app.js'))).not.toThrow();
  });

  test('index exposes required interactive targets', () => {
    const html = read('index.html');
    for (const id of ['newChat', 'prompt', 'sendButton', 'settingsButton', 'onboardingOverlay', 'workspaceOverlay', 'contextDrawer']) {
      expect(html).toContain('id="' + id + '"');
    }
  });

  test('unsafe static thread placeholders are not the source of recent-thread rendering', () => {
    const html = read('index.html');
    expect(html).toContain('class="recent-section"');
    const js = read('app.js');
    expect(js).toContain('recentSection.appendChild(item)');
    expect(js).toContain('title.textContent = thread.title');
  });

  test('local persistence and cross-tab recovery are guarded', () => {
    const js = read('app.js');
    expect(js).toContain('function loadState()');
    expect(js).toContain('JSON.parse(raw)');
    expect(js).toContain("window.addEventListener('storage'");
    expect(js).toContain('localStorage.setItem(storeKey');
  });

  test('tool connections default to disabled with confirmation required', () => {
    const js = read('app.js');
    expect(js).toContain('enabled: false');
    expect(js).toContain('requiresConfirmation: true');
  });
});
