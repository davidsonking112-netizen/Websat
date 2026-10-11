import { test, expect } from '@playwright/test';

const storageKey = 'forge-local-state-v1';
const origin = 'http://127.0.0.1:5173';

async function seedWorkspace(page, threads, overrides = {}) {
  const seededState = {
    version: 2,
    threads,
    activeId: threads[0].id,
    settings: { theme: 'light', onboardingComplete: true, ...(overrides.settings || {}) },
    ...(typeof overrides.canvas === 'string' ? { canvas: overrides.canvas } : {}),
    ...(Array.isArray(overrides.canvasHistory) ? { canvasHistory: overrides.canvasHistory } : {}),
    ...(overrides.assistants ? { assistants: overrides.assistants } : {}),
    ...(overrides.selectedAssistant ? { selectedAssistant: overrides.selectedAssistant } : {}),
    ...(overrides.toolConnections ? { toolConnections: overrides.toolConnections } : {})
  };
  await page.addInitScript(({ key, state }) => {
    localStorage.setItem(key, JSON.stringify(state));
  }, { key: storageKey, state: seededState });
  await page.goto('/');
}

function blankThread(id = 'test-thread') {
  return { id, title: 'Test thread', messages: [], attachments: [] };
}

function sse(data) {
  return `data: ${JSON.stringify(data)}\n\ndata: [DONE]\n\n`;
}

test('core page is keyboard reachable and has no obvious console errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('button', { name: /new thread/i })).toBeVisible();
  await expect(page.locator('.onboarding-card .drawer-kicker')).toHaveText('WELCOME TO FORGE');
  await expect(page.locator('.onboarding-card > p:not(.drawer-kicker)')).toContainText('Enabling a model provider or MCP tool sends selected content');
  await page.getByRole('button', { name: /new thread/i }).focus();
  await expect(page.getByRole('button', { name: /new thread/i })).toBeFocused();
  expect(errors).toEqual([]);
});

test('all threads and every message remain accessible after more than 100 threads and 36 messages', async ({ page }) => {
  const history = Array.from({ length: 40 }, (_, index) => ({
    kind: index % 2 ? 'assistant' : 'user',
    content: index === 0 ? 'oldest-history-sentinel' : `history-message-${index}`,
    label: index % 2 ? 'Forge Local' : ''
  }));
  const threads = Array.from({ length: 105 }, (_, index) => ({
    id: `thread-${index}`,
    title: `Thread ${index}`,
    messages: index === 0 ? history : [{ kind: 'user', content: `thread-body-${index}`, label: '' }],
    attachments: []
  }));

  await seedWorkspace(page, threads);
  await expect(page.locator('#conversation').getByText('oldest-history-sentinel', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Thread 104' }).click();
  await expect(page.locator('#threadName')).toHaveText('Thread 104');
  await expect(page.locator('#conversation').getByText('thread-body-104', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: /new thread/i }).click();
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key)).threads.length, storageKey)).toBe(106);
});

test('regenerating an earlier assistant response replaces it without reordering later turns', async ({ page }) => {
  const thread = {
    id: 'ordered-thread',
    title: 'Ordered thread',
    attachments: [],
    messages: [
      { kind: 'user', content: 'Please make a plan for this.', label: '' },
      { kind: 'assistant', content: 'original first answer', label: 'Forge Local' },
      { kind: 'user', content: 'A later question.', label: '' },
      { kind: 'assistant', content: 'later answer stays here', label: 'Forge Local' }
    ]
  };
  await seedWorkspace(page, [thread]);
  await page.locator('#conversation .message[data-index="1"] [data-message-action="regenerate"]').click();

  await expect.poll(() => page.evaluate((key) => {
    const saved = JSON.parse(localStorage.getItem(key));
    return saved.threads[0].messages.map((message) => message.content);
  }, storageKey)).toEqual([
    'Please make a plan for this.',
    'Let’s give that spark a shape. Start with the outcome, name the constraint, and choose one small experiment you can finish today.',
    'A later question.',
    'later answer stays here'
  ]);
});

test('settings save a global system prompt and preserve a saved provider key; OpenAI-compatible calls use the key', async ({ page }) => {
  const calls = [];
  await page.route('https://provider.test/v1/chat/completions', async (route) => {
    const request = route.request();
    calls.push({ headers: request.headers(), body: JSON.parse(request.postData() || '{}') });
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: sse({ choices: [{ delta: { content: 'Provider replied securely.' } }] })
    });
  });
  await seedWorkspace(page, [blankThread('provider-thread')], {
    settings: {
      provider: { kind: 'openai', baseUrl: 'https://provider.test/v1', apiKey: 'sk-test-key', model: 'mock-chat', enabled: true }
    }
  });

  await page.locator('#settingsButton').click();
  await page.locator('#systemPrompt').fill('Always begin by checking the user’s constraints.');
  await expect(page.locator('#providerApiKey')).toHaveValue('');
  await page.locator('#saveSettings').click();
  await expect.poll(() => page.evaluate((key) => {
    const saved = JSON.parse(localStorage.getItem(key));
    return [saved.settings.systemPrompt, saved.settings.provider.apiKey];
  }, storageKey)).toEqual(['Always begin by checking the user’s constraints.', 'sk-test-key']);

  await page.locator('#prompt').fill('Give me a short answer.');
  await page.locator('#sendButton').click();
  await expect(page.locator('#conversation')).toContainText('Provider replied securely.');
  expect(calls).toHaveLength(1);
  expect(calls[0].headers.authorization).toBe('Bearer sk-test-key');
  expect(calls[0].body.model).toBe('mock-chat');
  expect(calls[0].body.messages[0].content).toContain('Always begin by checking the user’s constraints.');

  await page.locator('#settingsButton').click();
  await page.locator('#removeProviderKey').check();
  await page.locator('#saveSettings').click();
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key)).settings.provider.apiKey, storageKey)).toBe('');
});

test('Ollama uses its chat endpoint and parses newline-delimited streaming chunks', async ({ page }) => {
  let observed;
  await page.route('http://127.0.0.1:11434/api/chat', async (route) => {
    observed = JSON.parse(route.request().postData() || '{}');
    const headers = { 'access-control-allow-origin': origin };
    await route.fulfill({
      status: 200,
      headers: { ...headers, 'content-type': 'application/x-ndjson' },
      body: [
        JSON.stringify({ message: { content: 'Ollama ' }, done: false }),
        JSON.stringify({ message: { content: 'stream works.' }, done: true })
      ].join('\n') + '\n'
    });
  });
  await seedWorkspace(page, [blankThread('ollama-thread')], {
    settings: { provider: { kind: 'ollama', baseUrl: 'http://127.0.0.1:11434', apiKey: '', model: 'llama-test', enabled: true } }
  });
  await page.locator('#prompt').fill('Test local provider.');
  await page.locator('#sendButton').click();
  await expect(page.locator('#conversation')).toContainText('Ollama stream works.');
  expect(observed.model).toBe('llama-test');
  expect(observed.stream).toBe(true);
});

test('model tool calls execute only allowlisted MCP tools and feed results back to the provider', async ({ page }) => {
  const modelCalls = [];
  let mcpCall = null;
  await page.route('https://provider.test/v1/chat/completions', async (route) => {
    const request = route.request();
    const body = JSON.parse(request.postData() || '{}');
    modelCalls.push({ headers: request.headers(), body });
    if (modelCalls.length === 1) {
      await route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse({
        choices: [{ delta: { tool_calls: [{
          index: 0,
          id: 'lookup-call-1',
          type: 'function',
          function: { name: 'forge_mcp_0', arguments: '{"query":"test phrase"}' }
        }] } }]
      }) });
    } else {
      await route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse({ choices: [{ delta: { content: 'The MCP lookup found the requested result.' } }] }) });
    }
  });
  await page.route('http://127.0.0.1:4321/mcp', async (route) => {
    const request = route.request();
    const cors = {
      'access-control-allow-origin': origin,
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type,accept,mcp-session-id,mcp-protocol-version',
      'access-control-expose-headers': 'Mcp-Session-Id'
    };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const payload = JSON.parse(request.postData() || '{}');
    mcpCall = { payload, protocolVersion: request.headers()['mcp-protocol-version'] };
    return route.fulfill({
      status: 200,
      headers: { ...cors, 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: payload.id, result: { content: [{ type: 'text', text: 'MCP_LOOKUP_SUCCESS' }] } })
    });
  });

  await seedWorkspace(page, [blankThread('tool-thread')], {
    settings: { provider: { kind: 'openai', baseUrl: 'https://provider.test/v1', apiKey: 'sk-tool-test', model: 'mock-tools', enabled: true } },
    assistants: [{
      id: 'research-assistant', name: 'Research assistant', description: '', instructions: '',
      tools: ['test-connection::lookup'], permissions: { network: true, read: true, write: false }
    }],
    selectedAssistant: 'research-assistant',
    toolConnections: [{
      id: 'test-connection', name: 'Mock search', type: 'MCP', endpoint: 'http://127.0.0.1:4321/mcp', enabled: true,
      requiresConfirmation: false, sessionId: '', protocolVersion: '2025-03-26', tools: [{
        name: 'lookup', description: 'Look up a phrase', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
        annotations: { readOnlyHint: true }
      }]
    }]
  });
  await page.locator('#prompt').fill('Look up the test phrase.');
  await page.locator('#sendButton').click();
  await expect(page.locator('#conversation')).toContainText('The MCP lookup found the requested result.');
  expect(mcpCall.payload.method).toBe('tools/call');
  expect(mcpCall.payload.params).toEqual({ name: 'lookup', arguments: { query: 'test phrase' } });
  expect(mcpCall.protocolVersion).toBe('2025-03-26');
  expect(modelCalls).toHaveLength(2);
  expect(modelCalls[0].body.tools[0].function.name).toBe('forge_mcp_0');
  expect(modelCalls[0].headers.authorization).toBe('Bearer sk-tool-test');
  expect(modelCalls[1].body.messages.some((message) => message.role === 'tool' && message.content.includes('MCP_LOOKUP_SUCCESS'))).toBe(true);
});

test('default MCP confirmation prevents execution when the user declines', async ({ page }) => {
  const modelBodies = [];
  const dialogs = [];
  let mcpHits = 0;
  page.on('dialog', async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });
  await page.route('https://provider.test/v1/chat/completions', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    modelBodies.push(body);
    if (modelBodies.length === 1) {
      return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse({
        choices: [{ delta: { tool_calls: [{ index: 0, id: 'confirm-call', type: 'function', function: { name: 'forge_mcp_0', arguments: '{"query":"private data"}' } }] } }]
      }) });
    }
    return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse({ choices: [{ delta: { content: 'The lookup was not run.' } }] }) });
  });
  await page.route('http://127.0.0.1:4331/mcp', async (route) => {
    mcpHits += 1;
    const payload = JSON.parse(route.request().postData() || '{}');
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: payload.id, result: { content: [{ type: 'text', text: 'Should not execute' }] } }) });
  });
  await seedWorkspace(page, [blankThread('confirmation-thread')], {
    settings: { provider: { kind: 'openai', baseUrl: 'https://provider.test/v1', apiKey: 'sk-confirm-test', model: 'mock-tools', enabled: true } },
    assistants: [{ id: 'confirm-assistant', name: 'Confirm assistant', description: '', instructions: '', tools: ['confirm-connection::lookup'], permissions: { network: true, read: true, write: false } }],
    selectedAssistant: 'confirm-assistant',
    toolConnections: [{ id: 'confirm-connection', name: 'Confirm MCP', type: 'MCP', endpoint: 'http://127.0.0.1:4331/mcp', enabled: true, requiresConfirmation: true, sessionId: '', protocolVersion: '2025-03-26', tools: [{ name: 'lookup', description: 'Lookup', inputSchema: { type: 'object', properties: { query: { type: 'string' } } }, annotations: { readOnlyHint: true } }] }]
  });
  await page.locator('#prompt').fill('Find private data.');
  await page.locator('#sendButton').click();
  await expect(page.locator('#conversation')).toContainText('The lookup was not run.');
  expect(dialogs).toHaveLength(1);
  expect(dialogs[0]).toContain('private data');
  expect(mcpHits).toBe(0);
  expect(modelBodies[1].messages.some((message) => message.role === 'tool' && message.content.includes('declined'))).toBe(true);
});

test('Canvas drafts autosave locally when closed without creating a version', async ({ page }) => {
  await seedWorkspace(page, [blankThread('canvas-autosave')], { canvas: 'Existing draft' });
  await page.locator('#canvasMode').click();
  await page.locator('#canvasText').fill('A draft that should survive closing the Canvas.');
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key)).canvas, storageKey)).toBe('A draft that should survive closing the Canvas.');
  await page.locator('#closeOverlay').click();
  await page.locator('#canvasMode').click();
  await expect(page.locator('#canvasText')).toHaveValue('A draft that should survive closing the Canvas.');
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key)).canvasHistory.length, storageKey)).toBe(0);
});

test('Canvas writing tools use the configured provider and autosave its real output', async ({ page }) => {
  let observed;
  await page.route('https://provider.test/v1/chat/completions', async (route) => {
    observed = { headers: route.request().headers(), body: JSON.parse(route.request().postData() || '{}') };
    return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse({ choices: [{ delta: { content: 'A clearer, polished draft.' } }] }) });
  });
  await seedWorkspace(page, [blankThread('canvas-provider')], {
    canvas: 'Original draft text.',
    settings: {
      systemPrompt: 'Preserve the writer’s factual meaning.',
      provider: { kind: 'openai', baseUrl: 'https://provider.test/v1', apiKey: 'sk-canvas-test', model: 'canvas-test-model', enabled: true }
    }
  });
  await page.locator('#canvasMode').click();
  await page.locator('[data-canvas-tool="polish"]').click();
  await expect(page.locator('#canvasText')).toHaveValue('A clearer, polished draft.');
  expect(observed.headers.authorization).toBe('Bearer sk-canvas-test');
  expect(JSON.stringify(observed.body.messages)).toContain('Original draft text.');
  expect(JSON.stringify(observed.body.messages)).toContain('Preserve the writer’s factual meaning.');
  expect(observed.body.tools).toBeUndefined();
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key)).canvas, storageKey)).toBe('A clearer, polished draft.');
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key)).canvasHistory[0].content, storageKey)).toBe('Original draft text.');
  await expect(page.locator('#restoreCanvas')).toBeEnabled();
  await page.locator('#restoreCanvas').click();
  await expect(page.locator('#canvasText')).toHaveValue('Original draft text.');
});

test('Canvas writing tools do not fake edits when no real provider is enabled', async ({ page }) => {
  await seedWorkspace(page, [blankThread('canvas-local')], { canvas: 'Keep this text unchanged.' });
  await page.locator('#canvasMode').click();
  await page.locator('[data-canvas-tool="shorter"]').click();
  await expect(page.locator('#canvasText')).toHaveValue('Keep this text unchanged.');
  await expect(page.locator('#toast')).toContainText('Enable a model provider');
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key)).canvas, storageKey)).toBe('Keep this text unchanged.');
});

test('Canvas code export extracts a single fenced block and chooses its extension', async ({ page }) => {
  await seedWorkspace(page, [blankThread('canvas-code')]);
  await page.locator('#canvasMode').click();
  await page.locator('#canvasText').fill('Example:\n\n```html\n<div>hello</div>\n```');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#exportCode').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('forge-canvas.html');
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();
  const { readFile } = await import('node:fs/promises');
  expect(await readFile(downloadPath, 'utf8')).toBe('<div>hello</div>');
});

test('Settings refuse to enable a non-HTTPS remote model endpoint', async ({ page }) => {
  await seedWorkspace(page, [blankThread('provider-url-policy')]);
  await page.locator('#settingsButton').click();
  await page.locator('#providerEnabled').check();
  await page.locator('#providerBaseUrl').fill('http://provider.test/v1');
  await page.locator('#providerModel').fill('unsafe-test-model');
  await page.locator('#saveSettings').click();
  await expect(page.locator('#toast')).toContainText('Use HTTPS for remote providers');
  await expect.poll(() => page.evaluate((key) => Boolean(JSON.parse(localStorage.getItem(key)).settings.provider?.enabled), storageKey)).toBe(false);
  await expect(page.locator('#workspaceOverlay')).toHaveClass(/open/);
});

test('legacy insecure enabled provider settings are normalized to local preview', async ({ page }) => {
  let providerHits = 0;
  page.on('request', (request) => { if (request.url().includes('provider.test')) providerHits += 1; });
  await seedWorkspace(page, [blankThread('legacy-provider-url')], {
    settings: { provider: { kind: 'openai', baseUrl: 'http://provider.test/v1', apiKey: 'sk-legacy-test', model: 'legacy-model', enabled: true } }
  });
  await expect(page.locator('#modelButton')).toContainText('Local preview');
  await page.locator('#prompt').fill('A harmless local preview request.');
  await page.locator('#sendButton').click();
  await expect(page.locator('#conversation')).toContainText('Using Forge Local: Be clear, careful, concise, and action-oriented.');
  expect(providerHits).toBe(0);
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key)).settings.provider.enabled, storageKey)).toBe(false);
});

test('runtime selector switches real state and discloses the configured provider destination', async ({ page }) => {
  await seedWorkspace(page, [blankThread('runtime-switch')], {
    settings: { provider: { kind: 'openai', baseUrl: 'https://provider.test/v1', apiKey: '', model: 'runtime-test-model', enabled: true } }
  });
  await expect(page.locator('#modelButton')).toContainText('runtime-test-model');
  await expect(page.locator('.privacy-note')).toContainText('Requests sent to provider.test');
  await expect(page.locator('#modelButton')).toHaveAttribute('aria-expanded', 'false');
  await page.locator('#modelButton').click();
  await expect(page.locator('#modelButton')).toHaveAttribute('aria-expanded', 'true');
  await page.locator('#modelMenu [data-runtime-mode="local"]').click();
  await expect(page.locator('#modelButton')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#modelButton')).toContainText('Local preview');
  await expect(page.locator('.privacy-note')).toContainText('no model request');
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key)).settings.provider.enabled, storageKey)).toBe(false);

  await page.locator('#modelButton').click();
  await expect(page.locator('#modelMenu [data-runtime-mode="provider"]')).toContainText('Prompts and context go to provider.test');
  await page.locator('#modelMenu [data-runtime-mode="provider"]').click();
  await expect(page.locator('#modelButton')).toContainText('runtime-test-model');
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key)).settings.provider.enabled, storageKey)).toBe(true);
});

test('MCP discovery initializes the connection and follows tool-list pagination', async ({ page }) => {
  const methods = [];
  const cors = {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type,accept,mcp-session-id,mcp-protocol-version',
    'access-control-expose-headers': 'Mcp-Session-Id'
  };
  await page.route('http://127.0.0.1:4310/mcp', async (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const payload = JSON.parse(request.postData() || '{}');
    methods.push({ method: payload.method, cursor: payload.params?.cursor, session: request.headers()['mcp-session-id'], protocolVersion: request.headers()['mcp-protocol-version'] });
    if (payload.method === 'notifications/initialized') return route.fulfill({ status: 202, headers: cors });
    let result = {};
    if (payload.method === 'initialize') {
      result = { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'Mock MCP', version: '1.0' } };
    } else if (payload.method === 'tools/list' && !payload.params?.cursor) {
      result = { tools: [{ name: 'first_tool', description: 'First' }], nextCursor: 'page-two' };
    } else if (payload.method === 'tools/list') {
      result = { tools: [{ name: 'second_tool', description: 'Second' }] };
    }
    return route.fulfill({
      status: 200,
      headers: { ...cors, 'content-type': 'application/json', ...(payload.method === 'initialize' ? { 'Mcp-Session-Id': 'mock-session' } : {}) },
      body: JSON.stringify({ jsonrpc: '2.0', id: payload.id, result })
    });
  });
  await seedWorkspace(page, [blankThread('discovery-thread')], {
    toolConnections: [{ id: 'discovery-connection', name: 'Paginated MCP', type: 'MCP', endpoint: 'http://127.0.0.1:4310/mcp', enabled: true, requiresConfirmation: true, sessionId: '', protocolVersion: '', tools: [] }]
  });
  await page.locator('.nav-item').filter({ hasText: 'Assistants' }).click();
  await page.locator('[data-tool-discover="discovery-connection"]').click();
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key)).toolConnections[0].tools.map((tool) => tool.name), storageKey)).toEqual(['first_tool', 'second_tool']);
  expect(methods.map((item) => item.method)).toEqual(['initialize', 'notifications/initialized', 'tools/list', 'tools/list']);
  expect(methods[2].session).toBe('mock-session');
  expect(methods[3].cursor).toBe('page-two');
  expect(methods[1].protocolVersion).toBe('2025-03-26');
  expect(methods[2].protocolVersion).toBe('2025-03-26');
});


test('Forge agent workflow completes, duplicates safely, exports a report, and has no console errors', async ({ page }) => {
  const errors = [];
  const calls = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('https://provider.test/v1/chat/completions', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    calls.push(body);
    if (body.stream === false) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ choices: [{ message: { role: 'assistant', content: JSON.stringify({ steps: [
          { title: 'Set the objective', kind: 'plan', dependsOn: [] },
          { title: 'Write a greeting', kind: 'work', dependsOn: [0] },
          { title: 'Review the greeting', kind: 'review', dependsOn: [1] }
        ] }) } }] })
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: sse({ choices: [{ delta: { content: 'Greeting result: Hello from Forge.' } }] })
    });
  });

  await seedWorkspace(page, [blankThread('agent-smoke-test')], {
    settings: {
      provider: { kind: 'openai', baseUrl: 'https://provider.test/v1', apiKey: 'sk-agent-smoke', model: 'mock-agent-model', enabled: true }
    }
  });
  await page.locator('.nav-item').filter({ hasText: 'Agents' }).click();
  await expect(page.locator('#overlayTitle')).toHaveText('Agents');
  await page.locator('#agentPrompt').fill('Write a greeting');
  await page.locator('#createAgentTask').click();

  await expect(page.locator('.agent-task-card')).toHaveCount(1);
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key)).agentTasks[0]?.status, storageKey)).toBe('completed');
  await expect(page.locator('.agent-task-result')).toContainText('Greeting result: Hello from Forge.');
  expect(calls.filter((body) => body.stream === false)).toHaveLength(1);
  expect(calls.filter((body) => body.stream === true)).toHaveLength(3);

  await page.locator('[data-agent-duplicate]').first().click();
  await expect(page.locator('.agent-task-card')).toHaveCount(2);
  const copied = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).agentTasks[0], storageKey);
  expect(copied.status).toBe('queued');
  expect(copied.runCount).toBe(0);
  expect(copied.schedule.enabled).toBe(false);
  expect(copied.steps.every((step) => step.status === 'queued' && !step.result && !step.compute)).toBe(true);
  expect(copied.steps.some((step) => step.dependsOn.length)).toBe(true);

  const downloadPromise = page.waitForEvent('download');
  await page.locator('[data-agent-export]').first().click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^websat-agent-report-.*\.json$/);
  const downloadPath = await download.path();
  const { readFile } = await import('node:fs/promises');
  const report = JSON.parse(await readFile(downloadPath, 'utf8'));
  expect(report.schemaVersion).toBe(1);
  expect(report.task.steps).toHaveLength(3);
  expect(report.task.steps[0].status).toBe('queued');

  expect(errors).toEqual([]);
});
