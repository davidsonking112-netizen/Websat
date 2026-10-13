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
    ...(Array.isArray(overrides.projects) ? { projects: overrides.projects } : {}),
    ...(Array.isArray(overrides.runs) ? { runs: overrides.runs } : {}),
    ...(overrides.assistants ? { assistants: overrides.assistants } : {}),
    ...(overrides.selectedAssistant ? { selectedAssistant: overrides.selectedAssistant } : {}),
    ...(overrides.toolConnections ? { toolConnections: overrides.toolConnections } : {}),
    ...(Array.isArray(overrides.agentTasks) ? { agentTasks: overrides.agentTasks } : {})
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
      tools: ['test-connection::lookup'], toolPolicies: { 'test-connection::lookup': 'per-run' }, permissions: { network: true, read: true, write: false }
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
  await expect(page.locator('#toolApprovalOverlay')).toBeVisible();
  await expect(page.locator('#toolApprovalArguments')).toContainText('test phrase');
  await expect(page.locator('#toolApprovalServer')).toContainText('127.0.0.1:4321/mcp');
  await expect(page.locator('#toolApprovalRisk')).toContainText('Read-only');
  await expect(page.locator('#toolApprovalDataFlow')).toContainText('provider.test');
  await page.locator('#approvalAllow').click();
  await expect(page.locator('#conversation')).toContainText('The MCP lookup found the requested result.');
  expect(mcpCall.payload.method).toBe('tools/call');
  expect(mcpCall.payload.params).toEqual({ name: 'lookup', arguments: { query: 'test phrase' } });
  expect(mcpCall.protocolVersion).toBe('2025-03-26');
  expect(modelCalls).toHaveLength(2);
  expect(modelCalls[0].body.tools[0].function.name).toBe('forge_mcp_0');
  expect(modelCalls[0].headers.authorization).toBe('Bearer sk-tool-test');
  expect(modelCalls[1].body.messages.some((message) => message.role === 'tool' && message.content.includes('MCP_LOOKUP_SUCCESS'))).toBe(true);
  const savedRun = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).runs[0], storageKey);
  expect(savedRun.status).toBe('completed');
  expect(savedRun.events.some((event) => event.type === 'tool-approved')).toBe(true);
  expect(savedRun.events.some((event) => event.type === 'tool-completed' && event.result.includes('MCP_LOOKUP_SUCCESS'))).toBe(true);
  await page.locator('.nav-item[data-workspace="Runs"]').click();
  await expect(page.locator('#overlayTitle')).toHaveText('Agent run log');
  await expect(page.locator('#overlayBody')).toContainText('MCP_LOOKUP_SUCCESS');
});

test('default MCP confirmation prevents execution when the user declines', async ({ page }) => {
  const modelBodies = [];
  let mcpHits = 0;
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
  await expect(page.locator('#toolApprovalOverlay')).toBeVisible();
  await expect(page.locator('#toolApprovalArguments')).toContainText('private data');
  await expect(page.locator('#toolApprovalDataFlow')).toContainText('provider.test');
  await page.locator('#approvalDeny').click();
  await expect(page.locator('#conversation')).toContainText('The lookup was not run.');
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
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key)).agentTasks?.[0]?.status, storageKey)).toBe('completed');
  await expect(page.locator('.agent-task-result')).toContainText('Greeting result: Hello from Forge.');
  expect(calls.filter((body) => body.stream === false)).toHaveLength(1);
  expect(calls.filter((body) => body.stream === true)).toHaveLength(3);

  await page.locator('[data-agent-duplicate]').first().click();
  await expect(page.locator('.agent-task-card')).toHaveCount(2);
  const copied = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).agentTasks?.[0], storageKey);
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


test('chat composer launches a linked Agent Task and returns its result into the same conversation', async ({ page }) => {
  const taskRequests = [];
  const plannerRequests = [];
  await page.route('https://provider.test/v1/chat/completions', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    if (body.stream === false) {
      plannerRequests.push(body);
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ steps: [
        { title: 'Plan the requested work', kind: 'plan', dependsOn: [] },
        { title: 'Write the requested result', kind: 'work', dependsOn: [0] },
        { title: 'Review the result', kind: 'review', dependsOn: [1] }
      ] }) } }] }) });
    }
    taskRequests.push(body);
    return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse({ choices: [{ delta: { content: 'Result delivered through the chat-linked agent.' } }] }) });
  });
  await seedWorkspace(page, [{
    ...blankThread('chat-agent-thread'),
    projectId: 'selected-project',
    messages: [
      { kind: 'user', content: 'Earlier conversation context for this thread.', label: '' },
      { kind: 'assistant', content: 'Earlier assistant response in this thread.', label: 'Forge Local' }
    ]
  }], {
    settings: { systemPrompt: 'Global workspace instruction sentinel.', reasoningLevel: 'medium', provider: { kind: 'openai', baseUrl: 'https://provider.test/v1', apiKey: 'sk-chat-agent-test', model: 'mock-agent-model', enabled: true } },
    projects: [
      { id: 'selected-project', name: 'Selected scope', instructions: 'Selected project instruction sentinel.', memory: true, files: [] },
      { id: 'unselected-project', name: 'Other scope', instructions: 'Unselected project secret sentinel.', memory: true, files: [] }
    ]
  });

  await page.getByRole('button', { name: 'Agent task', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Agent task', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#reasoningLevel')).toHaveValue('medium');
  await expect(page.locator('#modeHint')).toContainText('results stay in this thread');
  await page.locator('#prompt').fill('Write a short greeting');
  await page.getByRole('button', { name: 'Start multi-step agent task' }).click();

  await expect(page.locator('#conversation').getByText('Write a short greeting', { exact: true })).toBeVisible();
  await expect(page.locator('.linked-agent-task')).toBeVisible();
  await expect(page.locator('.linked-agent-task')).toBeInViewport();
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key)).agentTasks?.[0]?.status, storageKey), { timeout: 15000 }).toBe('completed');
  expect(plannerRequests.length).toBeGreaterThan(0);
  const plannerSystem = plannerRequests[0].messages.find((message) => message.role === 'system')?.content || '';
  expect(plannerSystem).toContain('Global workspace instruction sentinel.');
  expect(plannerSystem).toContain('Selected project instruction sentinel.');
  expect(plannerSystem).not.toContain('Unselected project secret sentinel.');
  expect(plannerSystem).toContain('Requested reasoning level (medium) for agent task planning');
  expect(taskRequests.length).toBeGreaterThan(0);
  const agentSystem = taskRequests[0].messages.find((message) => message.role === 'system')?.content || '';
  expect(agentSystem).toContain('Global workspace instruction sentinel.');
  expect(agentSystem).toContain('Selected project instruction sentinel.');
  expect(agentSystem).not.toContain('Unselected project secret sentinel.');
  expect(agentSystem).toContain('Requested reasoning level (medium) for agent task step');
  expect(taskRequests[0].messages.some((message) => message.content === 'Earlier conversation context for this thread.')).toBe(true);
  expect(taskRequests[0].messages.some((message) => message.content === 'Earlier assistant response in this thread.')).toBe(true);
  await expect(page.locator('#conversation')).toContainText('Result delivered through the chat-linked agent.');
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
  expect(saved.agentTasks[0].threadId).toBe('chat-agent-thread');
  expect(saved.agentTasks[0].reasoningLevel).toBe('medium');
  const linked = saved.threads[0].messages.filter((message) => message.agentTaskId === saved.agentTasks[0].id);
  expect(linked).toHaveLength(1);
  expect(linked[0].content).toContain('Result delivered through the chat-linked agent.');
  expect(saved.threads[0].messages.some((message) => message.kind === 'user' && message.content === 'Write a short greeting')).toBe(true);
  await expect(page.locator('#toast')).not.toHaveClass(/show/);
  await page.screenshot({ path: 'test-results/forge-chat-agent-task-reasoning.png', fullPage: true });
  await page.locator('.linked-agent-task').getByRole('button', { name: 'Open task details' }).click();
  await expect(page.locator('#overlayTitle')).toHaveText('Agents');
});

test('ordinary Chat applies the selected reasoning guidance and audits the preference without forcing agent mode', async ({ page }) => {
  let observedBody;
  await page.route('https://provider.test/v1/chat/completions', async (route) => {
    observedBody = JSON.parse(route.request().postData() || '{}');
    return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse({ choices: [{ delta: { content: 'A concise conclusion with the key rationale.' } }] }) });
  });
  await seedWorkspace(page, [blankThread('chat-reasoning')], {
    settings: { onboardingComplete: true, provider: { kind: 'openai', baseUrl: 'https://provider.test/v1', apiKey: 'sk-reasoning-test', model: 'mock-chat-model', enabled: true } }
  });
  await expect(page.getByRole('button', { name: 'Chat', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#reasoningLevel').selectOption('high');
  await page.locator('#prompt').fill('Compare these two options carefully.');
  await page.getByRole('button', { name: 'Send message', exact: true }).click();

  await expect(page.locator('#conversation')).toContainText('A concise conclusion with the key rationale.');
  expect(observedBody.messages[0].content).toContain('Requested reasoning level (high) for chat response');
  expect(observedBody.reasoning).toBeUndefined();
  expect(observedBody.reasoning_effort).toBeUndefined();
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
  expect(saved.settings.reasoningLevel).toBe('high');
  expect(saved.runs[0].reasoningLevel).toBe('high');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'test-results/forge-chat-reasoning.png', fullPage: true });
});

test('reasoning and plan-review controls remain accessible without horizontal overflow on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedWorkspace(page, [blankThread('mobile-reasoning')]);
  await expect(page.getByLabel('Reasoning')).toBeVisible();
  await expect(page.locator('#reviewPlanControl')).toBeHidden();
  await page.getByRole('button', { name: 'Agent task', exact: true }).click();
  await expect(page.getByLabel('Review plan first')).toBeVisible();
  const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflows).toBe(false);
});

test('Agent Task can save its plan for user review before any execution request starts', async ({ page }) => {
  let streamedSteps = 0;
  await page.route('https://provider.test/v1/chat/completions', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    if (body.stream === false) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ steps: [
        { title: 'Plan the short draft', kind: 'plan', dependsOn: [] },
        { title: 'Write the draft', kind: 'work', dependsOn: [0] },
        { title: 'Review the draft', kind: 'review', dependsOn: [1] }
      ] }) } }] }) });
    }
    streamedSteps += 1;
    return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse({ choices: [{ delta: { content: 'The requested draft.' } }] }) });
  });
  await seedWorkspace(page, [blankThread('review-plan-thread')], {
    settings: { reasoningLevel: 'high', provider: { kind: 'openai', baseUrl: 'https://provider.test/v1', apiKey: 'sk-review-plan-test', model: 'mock-agent-model', enabled: true } }
  });

  await page.getByRole('button', { name: 'Agent task', exact: true }).click();
  await expect(page.locator('#reviewPlanControl')).toBeVisible();
  await page.getByLabel('Review plan first').check();
  await expect(page.locator('#modeHint')).toContainText('high may use more tokens');
  await page.locator('#prompt').fill('Draft a short welcome note');
  await page.getByRole('button', { name: 'Start multi-step agent task' }).click();

  await expect(page.locator('.linked-agent-task')).toBeInViewport();
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key)).agentTasks?.[0]?.status, storageKey)).toBe('needs_review');
  expect(streamedSteps).toBe(0);
  await expect(page.locator('.linked-agent-task')).toContainText('Plan the short draft');
  await expect(page.locator('.linked-agent-task')).toContainText('Run / resume');
  await expect(page.locator('#toast')).not.toHaveClass(/show/);
  await page.screenshot({ path: 'test-results/forge-agent-plan-review.png', fullPage: true });

  await page.locator('.linked-agent-task').getByRole('button', { name: 'Run / resume' }).click();
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key)).agentTasks?.[0]?.status, storageKey), { timeout: 15000 }).toBe('completed');
  expect(streamedSteps).toBeGreaterThan(0);
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
  expect(saved.agentTasks[0].reasoningLevel).toBe('high');
  expect(saved.agentTasks[0].steps.some((step) => step.compute?.reasoningLevel === 'high')).toBe(true);
});

test('Forge runs independent steps concurrently but waits for their dependencies', async ({ page }) => {
  let active = 0;
  let peak = 0;
  const starts = [];
  const completions = [];
  await page.route('https://provider.test/v1/chat/completions', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    const user = body.messages?.find((message) => message.role === 'user')?.content || '';
    if (body.stream === false) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ steps: [
        { title: 'Plan dependencies', kind: 'plan', dependsOn: [] },
        { title: 'Independent work A', kind: 'work', dependsOn: [0] },
        { title: 'Independent work B', kind: 'work', dependsOn: [0] },
        { title: 'Independent work C', kind: 'work', dependsOn: [0] },
        { title: 'Independent work D', kind: 'work', dependsOn: [0] },
        { title: 'Review all results', kind: 'review', dependsOn: [1, 2, 3, 4] }
      ] }) } }] }) });
    }
    const title = user.match(/Current step: ([^\n]+)/)?.[1] || 'unknown';
    active += 1; peak = Math.max(peak, active); starts.push(title);
    await new Promise((resolve) => setTimeout(resolve, 100));
    active -= 1; completions.push(title);
    return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse({ choices: [{ delta: { content: 'Completed ' + title } }] }) });
  });
  await seedWorkspace(page, [blankThread('agent-parallel')], {
    settings: { provider: { kind: 'openai', baseUrl: 'https://provider.test/v1', apiKey: 'sk-agent-test', model: 'mock-agent-model', enabled: true } }
  });
  await page.locator('.nav-item').filter({ hasText: 'Agents' }).click();
  await page.locator('#agentPrompt').fill('Test parallel dependency execution');
  await page.locator('#createAgentTask').click();
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key)).agentTasks?.[0]?.status, storageKey)).toBe('completed');
  expect(peak).toBe(3);
  expect(peak).toBeLessThanOrEqual(3);
  for (const title of ['Independent work A', 'Independent work B', 'Independent work C', 'Independent work D']) {
    expect(starts.indexOf('Review all results')).toBeGreaterThan(starts.indexOf(title));
    expect(completions.indexOf(title)).toBeLessThan(completions.indexOf('Review all results'));
  }
});

test('Forge pause is available while a provider request is in flight and the task can resume', async ({ page }) => {
  await page.route('https://provider.test/v1/chat/completions', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    if (body.stream === false) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ steps: [
        { title: 'Plan the work', kind: 'plan', dependsOn: [] },
        { title: 'Do the work', kind: 'work', dependsOn: [0] },
        { title: 'Review the work', kind: 'review', dependsOn: [1] }
      ] }) } }] }) });
    }
    await new Promise((resolve) => setTimeout(resolve, 450));
    return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse({ choices: [{ delta: { content: 'Finished the requested step.' } }] }) });
  });
  await seedWorkspace(page, [blankThread('agent-pause-resume')], {
    settings: { provider: { kind: 'openai', baseUrl: 'https://provider.test/v1', apiKey: 'sk-agent-test', model: 'mock-agent-model', enabled: true } }
  });
  await page.locator('.nav-item').filter({ hasText: 'Agents' }).click();
  await page.locator('#agentPrompt').fill('Pause and resume a task');
  await page.locator('#createAgentTask').click();
  await expect(page.locator('[data-agent-pause]')).toBeVisible();
  await page.locator('[data-agent-pause]').click();
  await expect.poll(() => page.evaluate((key) => {
    const task = JSON.parse(localStorage.getItem(key)).agentTasks?.[0];
    return task?.status === 'paused' && task.steps.every((step) => step.status !== 'running');
  }, storageKey), { timeout: 10000 }).toBe(true);
  const paused = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).agentTasks?.[0], storageKey);
  expect(paused.steps.some((step) => step.status === 'queued')).toBe(true);
  await page.locator('[data-agent-run]').click();
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key)).agentTasks?.[0]?.status, storageKey), { timeout: 15000 }).toBe('completed');
});

test('Forge retries a failed step without losing completed prerequisites', async ({ page }) => {
  let failWorkOnce = true;
  await page.route('https://provider.test/v1/chat/completions', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    const user = body.messages?.find((message) => message.role === 'user')?.content || '';
    if (body.stream === false) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ steps: [
        { title: 'Plan retry', kind: 'plan', dependsOn: [] },
        { title: 'Do retryable work', kind: 'work', dependsOn: [0] },
        { title: 'Review retry', kind: 'review', dependsOn: [1] }
      ] }) } }] }) });
    }
    if (user.includes('Current step: Do retryable work') && failWorkOnce) {
      failWorkOnce = false;
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: 'temporary provider failure' } }) });
    }
    return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse({ choices: [{ delta: { content: 'Recovered step result.' } }] }) });
  });
  await seedWorkspace(page, [blankThread('agent-retry')], {
    settings: { provider: { kind: 'openai', baseUrl: 'https://provider.test/v1', apiKey: 'sk-agent-test', model: 'mock-agent-model', enabled: true } }
  });
  await page.locator('.nav-item').filter({ hasText: 'Agents' }).click();
  await page.locator('#agentPrompt').fill('Retry temporary provider failures');
  await page.locator('#createAgentTask').click();
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key)).agentTasks?.[0]?.status, storageKey)).toBe('failed');
  const failed = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).agentTasks?.[0], storageKey);
  expect(failed.steps.find((step) => step.title === 'Plan retry').status).toBe('completed');
  expect(failed.steps.find((step) => step.title === 'Do retryable work').status).toBe('failed');
  await page.locator('[data-agent-run]').click();
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key)).agentTasks?.[0]?.status, storageKey), { timeout: 15000 }).toBe('completed');
  const recovered = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).agentTasks?.[0], storageKey);
  expect(recovered.runCount).toBe(2);
  expect(recovered.steps.find((step) => step.title === 'Plan retry').status).toBe('completed');
  expect(recovered.steps.find((step) => step.title === 'Do retryable work').status).toBe('completed');
});

test('Forge adaptive compute respects the two-pass limit and records evaluation metadata', async ({ page }) => {
  let evaluatorCalls = 0;
  let refinementCalls = 0;
  await page.route('https://provider.test/v1/chat/completions', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    const system = body.messages?.find((message) => message.role === 'system')?.content || '';
    if (body.stream === false && system.includes('strict evaluator')) {
      evaluatorCalls += 1;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ confidence: 0.2, needs_more_compute: true, issues: ['Missing verification evidence'] }) } }] }) });
    }
    if (body.stream === false) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ steps: [
        { title: 'Plan security verification', kind: 'plan', dependsOn: [] },
        { title: 'Verify security behavior', kind: 'work', dependsOn: [0] },
        { title: 'Review security behavior', kind: 'review', dependsOn: [1] }
      ] }) } }] }) });
    }
    if (system.includes('adaptive refinement pass')) refinementCalls += 1;
    return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse({ choices: [{ delta: { content: 'Security verification result.' } }] }) });
  });
  await seedWorkspace(page, [blankThread('agent-adaptive')], {
    settings: { provider: { kind: 'openai', baseUrl: 'https://provider.test/v1', apiKey: 'sk-agent-test', model: 'mock-agent-model', enabled: true } }
  });
  await page.locator('.nav-item').filter({ hasText: 'Agents' }).click();
  await page.locator('#agentPrompt').fill('Security verification for production; test comprehensively');
  await page.locator('#createAgentTask').click();
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key)).agentTasks?.[0]?.status, storageKey)).toBe('completed');
  const task = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).agentTasks?.[0], storageKey);
  expect(task.steps.every((step) => step.compute && step.compute.extraPasses <= 2 && step.compute.initialTokens <= 2600)).toBe(true);
  expect(task.steps.some((step) => step.compute.extraPasses === 2)).toBe(true);
  expect(evaluatorCalls).toBeGreaterThan(0);
  expect(refinementCalls).toBeGreaterThan(0);
  expect(task.logs.filter((entry) => entry.message.includes('Adaptive compute pass')).length).toBeLessThanOrEqual(task.steps.length * 2);
});

test('Forge detects dependency cycles and leaves the task blocked with a useful error', async ({ page }) => {
  const now = new Date().toISOString();
  await seedWorkspace(page, [blankThread('agent-cycle')], {
    settings: { provider: { kind: 'openai', baseUrl: 'https://provider.test/v1', apiKey: 'sk-agent-test', model: 'mock-agent-model', enabled: true } },
    agentTasks: [{
      id: 'cycle-task', title: 'Cycle task', prompt: 'Check cycle handling', status: 'paused',
      createdAt: now, updatedAt: now, runCount: 0, result: '', lastError: '',
      schedule: { enabled: false, intervalMinutes: 60, nextRunAt: '' }, logs: [],
      steps: [
        { id: 'cycle-a', title: 'Cycle A', kind: 'work', status: 'queued', result: '', dependsOn: ['cycle-b'] },
        { id: 'cycle-b', title: 'Cycle B', kind: 'review', status: 'queued', result: '', dependsOn: ['cycle-a'] }
      ]
    }]
  });
  await page.locator('.nav-item').filter({ hasText: 'Agents' }).click();
  await page.locator('[data-agent-run="cycle-task"]').click();
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key)).agentTasks?.[0]?.status, storageKey)).toBe('blocked');
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key)).agentTasks?.[0]?.lastError, storageKey)).toContain('dependency cycle');
});
test('Forge streaming provider timeout cancels a stalled response and records a clear error', async ({ page }) => {
  await page.route('https://provider.test/v1/chat/completions', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    if (body.stream === false) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ steps: [
        { title: 'Plan timeout', kind: 'plan', dependsOn: [] },
        { title: 'Work timeout', kind: 'work', dependsOn: [0] },
        { title: 'Review timeout', kind: 'review', dependsOn: [1] }
      ] }) } }] }) });
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
    if (route.request().isNavigationRequest()) return;
    try { await route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse({ choices: [{ delta: { content: 'Too late.' } }] }) }); } catch (_) {}
  });
  await seedWorkspace(page, [blankThread('agent-timeout')], {
    settings: { provider: { kind: 'openai', baseUrl: 'https://provider.test/v1', apiKey: 'sk-agent-test', model: 'mock-agent-model', enabled: true, requestTimeoutMs: 300 } }
  });
  await page.locator('.nav-item').filter({ hasText: 'Agents' }).click();
  await page.locator('#agentPrompt').fill('Timeout stalled provider response');
  await page.locator('#createAgentTask').click();
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key)).agentTasks?.[0]?.status, storageKey), { timeout: 10000 }).toBe('failed');
  const task = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).agentTasks?.[0], storageKey);
  expect(task).toBeTruthy();
  expect(task.lastError).toContain('Provider request timed out');
  expect(task.steps.some((step) => step.status === 'failed')).toBe(true);
});


test('Forge cancellation stops at a safe checkpoint and leaves unfinished work resumable', async ({ page }) => {
  await page.route('https://provider.test/v1/chat/completions', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    if (body.stream === false) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ steps: [
        { title: 'Plan cancel flow', kind: 'plan', dependsOn: [] },
        { title: 'Execute cancellable work', kind: 'work', dependsOn: [0] },
        { title: 'Review resumed work', kind: 'review', dependsOn: [1] }
      ] }) } }] }) });
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
    try {
      return await route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse({ choices: [{ delta: { content: 'Cancellable work result.' } }] }) });
    } catch (_) {}
  });
  await seedWorkspace(page, [blankThread('agent-cancel')], {
    settings: { provider: { kind: 'openai', baseUrl: 'https://provider.test/v1', apiKey: 'sk-agent-test', model: 'mock-agent-model', enabled: true } }
  });
  await page.locator('.nav-item').filter({ hasText: 'Agents' }).click();
  await page.locator('#agentPrompt').fill('Cancel then resume safely');
  await page.locator('#createAgentTask').click();
  await expect(page.locator('[data-agent-cancel]')).toBeVisible();
  await page.locator('[data-agent-cancel]').click();
  await expect.poll(() => page.evaluate((key) => {
    const task = JSON.parse(localStorage.getItem(key)).agentTasks?.[0];
    return task?.status === 'cancelled' && task.steps.every((step) => step.status !== 'running');
  }, storageKey), { timeout: 10000 }).toBe(true);
  const cancelled = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).agentTasks?.[0], storageKey);
  expect(cancelled.steps.some((step) => step.status === 'queued')).toBe(true);
  expect(cancelled.logs.some((entry) => entry.message.includes('Cancellation reached'))).toBe(true);
  await page.locator('[data-agent-run]').click();
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key)).agentTasks?.[0]?.status, storageKey), { timeout: 15000 }).toBe('completed');
  const resumed = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).agentTasks?.[0], storageKey);
  expect(resumed.runCount).toBe(2);
});

test('Forge recovers an interrupted running task from persisted state on startup', async ({ page }) => {
  await page.route('https://provider.test/v1/chat/completions', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    expect(body.stream).toBe(true);
    return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse({ choices: [{ delta: { content: 'Recovered after restart.' } }] }) });
  });
  const now = new Date().toISOString();
  await seedWorkspace(page, [blankThread('agent-restart')], {
    settings: { provider: { kind: 'openai', baseUrl: 'https://provider.test/v1', apiKey: 'sk-agent-test', model: 'mock-agent-model', enabled: true } },
    agentTasks: [{
      id: 'restart-task', title: 'Restart recovery', prompt: 'Recover after app restart', status: 'running',
      createdAt: now, updatedAt: now, runCount: 4, result: '', lastError: '',
      schedule: { enabled: false, intervalMinutes: 60, nextRunAt: '' }, logs: [],
      steps: [
        { id: 'restart-plan', title: 'Recover the plan', kind: 'plan', status: 'running', result: '', dependsOn: [] },
        { id: 'restart-work', title: 'Recover the work', kind: 'work', status: 'queued', result: '', dependsOn: ['restart-plan'] },
        { id: 'restart-review', title: 'Review recovered work', kind: 'review', status: 'queued', result: '', dependsOn: ['restart-work'] }
      ]
    }]
  });
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key)).agentTasks?.[0]?.status, storageKey), { timeout: 15000 }).toBe('completed');
  const recovered = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).agentTasks?.[0], storageKey);
  expect(recovered.runCount).toBe(5);
  expect(recovered.steps.every((step) => step.status === 'completed')).toBe(true);
  expect(recovered.logs.some((entry) => entry.message.includes('Run 5 started'))).toBe(true);
});

test('project instructions and files are sent only for the project explicitly selected on that thread', async ({ page }) => {
  const providerBodies = [];
  await page.route('https://provider.test/v1/chat/completions', async (route) => {
    providerBodies.push(JSON.parse(route.request().postData() || '{}'));
    return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse({ choices: [{ delta: { content: 'Scoped response.' } }] }) });
  });
  const projects = [
    { id: 'project-alpha', name: 'Project Alpha', description: '', instructions: 'ALPHA_ONLY_INSTRUCTIONS', memory: true, files: [{ name: 'alpha.txt', type: 'text/plain', content: 'ALPHA_ONLY_FILE', size: 15 }], folders: [] },
    { id: 'project-beta', name: 'Project Beta', description: '', instructions: 'BETA_ONLY_INSTRUCTIONS', memory: true, files: [{ name: 'beta.txt', type: 'text/plain', content: 'BETA_ONLY_FILE', size: 14 }], folders: [] }
  ];
  await seedWorkspace(page, [blankThread('alpha-thread'), blankThread('beta-thread'), blankThread('unscoped-thread')], {
    projects,
    settings: { provider: { kind: 'openai', baseUrl: 'https://provider.test/v1', apiKey: '', model: 'scope-test', enabled: true } }
  });
  await page.locator('#contextToggle').click();
  await page.locator('#threadProjectSelect').selectOption('project-alpha');
  await page.keyboard.press('Escape');
  await page.locator('#prompt').fill('Question for Alpha.');
  await page.locator('#sendButton').click();
  await expect(page.locator('#conversation')).toContainText('Scoped response.');
  const alphaSystem = providerBodies[0].messages[0].content;
  expect(alphaSystem).toContain('ALPHA_ONLY_INSTRUCTIONS');
  expect(alphaSystem).toContain('ALPHA_ONLY_FILE');
  expect(alphaSystem).not.toContain('BETA_ONLY_INSTRUCTIONS');
  expect(alphaSystem).not.toContain('BETA_ONLY_FILE');

  await page.locator('.thread-item[data-thread-id="beta-thread"]').click();
  await page.locator('#threadProjectSelect').selectOption('project-beta');
  await page.keyboard.press('Escape');
  await page.locator('#prompt').fill('Question for Beta.');
  await page.locator('#sendButton').click();
  await expect(page.locator('#conversation')).toContainText('Scoped response.');
  const betaSystem = providerBodies[1].messages[0].content;
  expect(betaSystem).toContain('BETA_ONLY_INSTRUCTIONS');
  expect(betaSystem).toContain('BETA_ONLY_FILE');
  expect(betaSystem).not.toContain('ALPHA_ONLY_INSTRUCTIONS');
  expect(betaSystem).not.toContain('ALPHA_ONLY_FILE');

  await page.locator('.thread-item[data-thread-id="unscoped-thread"]').click();
  await page.locator('#prompt').fill('Question with no project.');
  await page.locator('#sendButton').click();
  await expect(page.locator('#conversation')).toContainText('Scoped response.');
  expect(providerBodies[2].messages[0].content).not.toContain('ALPHA_ONLY_');
  expect(providerBodies[2].messages[0].content).not.toContain('BETA_ONLY_');
});

test('pause takes effect between operations and resumes without repeating the completed tool call', async ({ page }) => {
  const modelBodies = [];
  let mcpHits = 0;
  await page.route('https://provider.test/v1/chat/completions', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}'); modelBodies.push(body);
    if (modelBodies.length === 1) return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'pause-call', type: 'function', function: { name: 'forge_mcp_0', arguments: '{"query":"pause-check"}' } }] } }] }) });
    return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse({ choices: [{ delta: { content: 'Resumed after the safe checkpoint.' } }] }) });
  });
  await page.route('http://127.0.0.1:4341/mcp', async (route) => {
    const cors = { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type,accept,mcp-protocol-version', 'access-control-expose-headers': 'Mcp-Session-Id' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    mcpHits += 1; const payload = JSON.parse(route.request().postData() || '{}');
    await new Promise((resolve) => setTimeout(resolve, 350));
    return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: payload.id, result: { content: [{ type: 'text', text: 'PAUSE_TOOL_DONE' }] } }) });
  });
  await seedWorkspace(page, [blankThread('pause-thread')], {
    settings: { provider: { kind: 'openai', baseUrl: 'https://provider.test/v1', apiKey: '', model: 'pause-test', enabled: true } },
    assistants: [{ id: 'pause-assistant', name: 'Pause assistant', description: '', instructions: '', tools: ['pause-mcp::lookup'], toolPolicies: { 'pause-mcp::lookup': 'auto-read' }, permissions: { network: true, read: true, write: false } }],
    selectedAssistant: 'pause-assistant',
    toolConnections: [{ id: 'pause-mcp', name: 'Pause MCP', type: 'MCP', endpoint: 'http://127.0.0.1:4341/mcp', enabled: true, protocolVersion: '2025-03-26', tools: [{ name: 'lookup', description: 'Search', inputSchema: { type: 'object', properties: { query: { type: 'string' } } }, annotations: { readOnlyHint: true } }] }]
  });
  await page.locator('#prompt').fill('Run one read-only lookup.'); await page.locator('#sendButton').click();
  await expect.poll(() => mcpHits).toBe(1);
  await page.locator('#agentPauseButton').click();
  await expect(page.locator('#agentRunStatus')).toContainText('Paused');
  expect(modelBodies).toHaveLength(1); expect(mcpHits).toBe(1);
  await page.locator('#agentPauseButton').click();
  await expect(page.locator('#conversation')).toContainText('Resumed after the safe checkpoint.');
  expect(modelBodies).toHaveLength(2); expect(mcpHits).toBe(1);
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key)).runs[0].status, storageKey)).toBe('completed');
});

test('Stop cancels an in-flight provider request and leaves a cancelled run for inspection', async ({ page }) => {
  let providerHits = 0; let releaseProvider;
  await page.route('https://provider.test/v1/chat/completions', async (route) => {
    providerHits += 1; await new Promise((resolve) => { releaseProvider = resolve; });
    try { await route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse({ choices: [{ delta: { content: 'This should not be saved.' } }] }) }); } catch (_) {}
  });
  await seedWorkspace(page, [blankThread('stop-thread')], { settings: { provider: { kind: 'openai', baseUrl: 'https://provider.test/v1', apiKey: '', model: 'stop-test', enabled: true } } });
  await page.locator('#prompt').fill('Start a request that will be stopped.'); await page.locator('#sendButton').click();
  await expect.poll(() => providerHits).toBe(1);
  await page.locator('#agentStopButton').click(); releaseProvider?.();
  await expect(page.locator('#agentRunBanner')).toBeHidden();
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key)).runs[0].status, storageKey)).toBe('cancelled');
  await expect(page.locator('#conversation')).not.toContainText('This should not be saved.');
  await page.locator('.nav-item[data-workspace="Runs"]').click();
  await expect(page.locator('#overlayBody')).toContainText('Run stopped');
});

test('restart marks an active run interrupted and retry requires explicit confirmation', async ({ page }) => {
  let providerHits = 0;
  await page.route('https://provider.test/v1/chat/completions', async (route) => { providerHits += 1; return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse({ choices: [{ delta: { content: 'Confirmed retry completed.' } }] }) }); });
  const thread = { ...blankThread('recovery-thread'), messages: [{ kind: 'user', content: 'Repeat this exact turn.', label: '' }] };
  await seedWorkspace(page, [thread], {
    settings: { provider: { kind: 'openai', baseUrl: 'https://provider.test/v1', apiKey: '', model: 'recovery-test', enabled: true } },
    runs: [{ id: 'stale-run', threadId: 'recovery-thread', prompt: 'Repeat this exact turn.', assistantId: 'default', assistantName: 'Forge', projectId: '', provider: 'recovery-test · provider.test', status: 'running', startedAt: new Date().toISOString(), endedAt: '', events: [{ type: 'tool-completed', message: 'A previous action may have completed.' }] }]
  });
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key)).runs[0].status, storageKey)).toBe('interrupted');
  await page.locator('.nav-item[data-workspace="Runs"]').click();
  await expect(page.locator('#overlayBody')).toContainText('Interrupted');
  await expect(page.locator('#overlayBody')).toContainText('Some approved actions may already have completed');
  await expect(page.locator('[data-retry-run="stale-run"]')).toBeVisible(); expect(providerHits).toBe(0);
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('[data-retry-run="stale-run"]').click();
  await expect(page.locator('#conversation')).toContainText('Confirmed retry completed.'); expect(providerHits).toBe(1);
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key)).runs[0].status, storageKey)).toBe('completed');
  const runs = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).runs, storageKey);
  expect(runs[0].retryOf).toBe('stale-run'); expect(runs.find((run) => run.id === 'stale-run').status).toBe('interrupted');
});

test('cross-tab storage updates preserve the live run and its eventual result', async ({ page, context }) => {
  let providerHits = 0; let releaseProvider;
  await page.route('https://provider.test/v1/chat/completions', async (route) => {
    providerHits += 1; await new Promise((resolve) => { releaseProvider = resolve; });
    try { await route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse({ choices: [{ delta: { content: 'Live run survived the other tab.' } }] }) }); } catch (_) {}
  });
  await seedWorkspace(page, [blankThread('cross-tab-run')], { settings: { provider: { kind: 'openai', baseUrl: 'https://provider.test/v1', apiKey: '', model: 'cross-tab-test', enabled: true } } });
  await page.locator('#prompt').fill('Keep this live run while another tab updates state.'); await page.locator('#sendButton').click();
  await expect.poll(() => providerHits).toBe(1);
  const other = await context.newPage(); await other.goto('/?forgeDemo=all');
  await other.evaluate((key) => { const saved = JSON.parse(localStorage.getItem(key)); saved.threads.unshift({ id: 'other-tab-thread', title: 'Other tab thread', messages: [], attachments: [] }); saved.activeId = 'other-tab-thread'; localStorage.setItem(key, JSON.stringify(saved)); }, storageKey);
  await expect(page.locator('.thread-item[data-thread-id="other-tab-thread"]')).toBeVisible(); releaseProvider?.();
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key)).runs.find((run) => run.prompt.includes('Keep this live run')).status, storageKey)).toBe('completed');
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).threads.find((thread) => thread.id === 'cross-tab-run').messages.some((message) => message.content.includes('Live run survived the other tab.')), storageKey)).toBe(true);
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).threads.some((thread) => thread.id === 'other-tab-thread'), storageKey)).toBe(true); await other.close();
});

test('oversized browser text imports read only the configured preview limit', async ({ page }) => {
  await seedWorkspace(page, [blankThread('bounded-file')]); await page.locator('#attachButton').click();
  await page.locator('#fileInput').setInputFiles({ name: 'large.txt', mimeType: 'text/plain', buffer: Buffer.alloc(1024 * 1024 + 4096, 97) });
  await expect.poll(() => page.evaluate((key) => { const attachment = JSON.parse(localStorage.getItem(key)).threads[0].attachments[0]; return [attachment?.content?.length, attachment?.truncated]; }, storageKey)).toEqual([1024 * 1024, true]);
});

test('provider regeneration uses only context before the target user turn', async ({ page }) => {
  let observedBody;
  await page.route('https://provider.test/v1/chat/completions', async (route) => { observedBody = JSON.parse(route.request().postData() || '{}'); return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse({ choices: [{ delta: { content: 'Regenerated first answer.' } }] }) }); });
  const thread = { id: 'provider-regenerate', title: 'Provider regeneration', attachments: [], messages: [
    { kind: 'user', content: 'First-turn question only.', label: '' }, { kind: 'assistant', content: 'Original first answer.', label: 'Forge Local' },
    { kind: 'user', content: 'Later private question.', label: '' }, { kind: 'assistant', content: 'Later answer remains.', label: 'Forge Local' }
  ] };
  await seedWorkspace(page, [thread], { settings: { provider: { kind: 'openai', baseUrl: 'https://provider.test/v1', apiKey: '', model: 'regenerate-test', enabled: true } } });
  await page.locator('#conversation .message[data-index="1"] [data-message-action="regenerate"]').click();
  await expect(page.locator('#conversation')).toContainText('Regenerated first answer.');
  expect(observedBody.messages.filter((message) => message.role === 'user').map((message) => message.content)).toEqual(['First-turn question only.']);
  expect(JSON.stringify(observedBody.messages)).not.toContain('Later private question.'); expect(JSON.stringify(observedBody.messages)).not.toContain('Later answer remains.');
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).threads[0].messages.map((message) => message.content), storageKey)).toEqual(['First-turn question only.', 'Regenerated first answer.', 'Later private question.', 'Later answer remains.']);
});

test('local preview uses project instructions only when this thread explicitly selects that project', async ({ page }) => {
  const project = { id: 'private-project', name: 'Private project', description: '', instructions: 'PROJECT_SCOPE_SENTINEL', memory: true, files: [], folders: [] };
  await seedWorkspace(page, [blankThread('unscoped-local')], { projects: [project], assistants: [{ id: 'empty-assistant', name: 'Empty assistant', description: '', instructions: '', tools: [], permissions: {} }], selectedAssistant: 'empty-assistant' });
  await page.locator('#prompt').fill('Explain a plain local preview.'); await page.locator('#sendButton').click();
  await expect(page.locator('#conversation')).toContainText('local preview simulates the complete flow');
  await expect(page.locator('#conversation')).not.toContainText('PROJECT_SCOPE_SENTINEL');
});


test('local preview serializes fast sends instead of losing the first response', async ({ page }) => {
  await seedWorkspace(page, [blankThread('local-serialized')], {
    assistants: [{ id: 'empty-local', name: 'Empty local', description: '', instructions: '', tools: [], permissions: {} }],
    selectedAssistant: 'empty-local'
  });
  await page.locator('#prompt').fill('First local turn.');
  await page.locator('#sendButton').click();
  await page.locator('#prompt').fill('Second local turn while the first is pending.');
  await page.locator('#sendButton').click();
  await expect(page.locator('#toast')).toContainText('A response is active or starting');
  await expect(page.locator('#conversation')).toContainText('local preview simulates the complete flow');
  const messages = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).threads[0].messages, storageKey);
  expect(messages.map((message) => message.kind)).toEqual(['user', 'assistant']);
  expect(messages[0].content).toBe('First local turn.');
});


test('provider streams larger than 10 MiB are rejected without completing the turn', async ({ page }) => {
  await page.route('https://provider.test/v1/chat/completions', async (route) => {
    return route.fulfill({ status: 200, contentType: 'text/event-stream', body: 'x'.repeat(10 * 1024 * 1024 + 128) });
  });
  await seedWorkspace(page, [blankThread('response-cap')], {
    settings: { provider: { kind: 'openai', baseUrl: 'https://provider.test/v1', apiKey: '', model: 'response-cap-test', enabled: true } }
  });
  await page.locator('#prompt').fill('Request a response that exceeds the configured safety limit.');
  await page.locator('#sendButton').click();
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key)).runs[0].status, storageKey)).toBe('failed');
  await page.locator('.nav-item[data-workspace="Runs"]').click();
  await expect(page.locator('#overlayBody')).toContainText('Provider response exceeded the 10 MB safety limit');
});
