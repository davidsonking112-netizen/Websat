(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const byId = (id) => document.getElementById(id);

  const toast = byId('toast');
  const promptBox = byId('prompt');
  const modelButton = byId('modelButton');
  const modelMenu = byId('modelMenu');
  const chatStage = byId('chatStage');
  const conversation = byId('conversation');
  const threadName = byId('threadName');
  const starterGrid = byId('starterGrid');
  const contextDrawer = byId('contextDrawer');
  const commandPalette = byId('commandPalette');
  const paletteInput = byId('paletteInput');
  const overlay = byId('workspaceOverlay');
  const overlayTitle = byId('overlayTitle');
  const overlayKicker = byId('overlayKicker');
  const overlayBody = byId('overlayBody');
  const fileInput = byId('fileInput');
  const attachmentTray = byId('attachmentTray');
  const recentSection = $('.recent-section');

  const storeKey = 'forge-local-state-v1';
  const stateVersion = 2;
  const defaultCanvas = 'Start shaping the work here.\n\nUse this space as a focused, editable surface while Forge keeps the conversation and context nearby.';
  const defaultProject = () => ({
    id: 'websat',
    name: 'Websat / Forge',
    description: 'Design and build the Forge local AI workspace.',
    files: [
      { name: 'index.html', type: 'text/html', size: 0 },
      { name: 'styles.css', type: 'text/css', size: 0 },
      { name: 'app.js', type: 'text/javascript', size: 0 }
    ],
    folders: ['src'],
    instructions: 'Keep the experience calm, precise, and local-first.',
    memory: true
  });

  const makeId = (prefix) => {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
      return prefix + '-' + globalThis.crypto.randomUUID();
    }
    return prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  };

  const defaultState = () => ({
    version: stateVersion,
    threads: [{ id: 'welcome', title: 'Untitled conversation', messages: [], attachments: [] }],
    activeId: 'welcome',
    canvas: defaultCanvas,
    canvasHistory: [],
    projects: [defaultProject()],
    selectedModel: 'Forge Local',
    selectedAssistant: 'Forge Local',
    assistants: [
      { id: 'forge-local', name: 'Forge Local', description: 'Clear, careful, action-oriented', instructions: 'Be clear, careful, concise, and action-oriented.', tools: [], permissions: {} },
      { id: 'forge-writer', name: 'Forge Writer', description: 'Sharp edits, strong voice, clean structure', instructions: 'Write with clarity, strong structure, and an appropriate voice.', tools: [], permissions: {} },
      { id: 'forge-analyst', name: 'Forge Analyst', description: 'Finds patterns and makes decisions legible', instructions: 'Analyze carefully, expose assumptions, and make decisions legible.', tools: [], permissions: {} }
    ],
    toolConnections: [],
    settings: { theme: 'system', onboardingComplete: false, reduceMotion: false }
  });

  const textValue = (value, fallback = '') => typeof value === 'string' ? value : fallback;
  const finiteNumber = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

  function normalizeMessage(message) {
    if (!message || (message.kind !== 'user' && message.kind !== 'assistant')) return null;
    return {
      kind: message.kind,
      content: textValue(message.content),
      label: textValue(message.label, message.kind === 'assistant' ? 'Forge Local' : '')
    };
  }

  function normalizeThread(thread) {
    if (!thread || typeof thread !== 'object') return null;
    const messages = Array.isArray(thread.messages) ? thread.messages.map(normalizeMessage).filter(Boolean) : [];
    const attachments = Array.isArray(thread.attachments)
      ? thread.attachments.map((a) => ({
          name: textValue(a?.name, 'Unnamed file').slice(0, 255),
          type: textValue(a?.type, 'application/octet-stream').slice(0, 120),
          size: Math.max(0, finiteNumber(a?.size))
        })).filter((a) => a.name)
      : [];
    return {
      id: textValue(thread.id, makeId('thread')),
      title: textValue(thread.title, 'Untitled conversation').slice(0, 120),
      messages,
      attachments
    };
  }

  function normalizeProject(project) {
    if (!project || typeof project !== 'object') return null;
    const files = Array.isArray(project.files) ? project.files.map((f) => ({
      name: textValue(f?.name, 'Unnamed file').slice(0, 255),
      type: textValue(f?.type, 'application/octet-stream').slice(0, 120),
      size: Math.max(0, finiteNumber(f?.size))
    })).filter((f) => f.name) : [];
    const folders = Array.isArray(project.folders)
      ? project.folders.map((f) => textValue(f).trim().slice(0, 120)).filter(Boolean)
      : [];
    return {
      id: textValue(project.id, makeId('project')),
      name: textValue(project.name, 'Untitled project').trim().slice(0, 120) || 'Untitled project',
      description: textValue(project.description, 'A focused local workspace.').slice(0, 300),
      files,
      folders,
      instructions: textValue(project.instructions).slice(0, 10000),
      memory: Boolean(project.memory)
    };
  }

  function normalizeState(raw) {
    const base = defaultState();
    if (!raw || typeof raw !== 'object') return base;

    const threads = Array.isArray(raw.threads) ? raw.threads.map(normalizeThread).filter(Boolean) : base.threads;
    if (!threads.length) threads.push(base.threads[0]);

    const projects = Array.isArray(raw.projects) ? raw.projects.map(normalizeProject).filter(Boolean) : base.projects;
    if (!projects.length) projects.push(defaultProject());

    const activeId = threads.some((t) => t.id === raw.activeId) ? raw.activeId : threads[0].id;
    const history = Array.isArray(raw.canvasHistory)
      ? raw.canvasHistory.map((h) => ({ content: textValue(h?.content), at: textValue(h?.at) })).filter((h) => h.content).slice(0, 50)
      : [];

    return {
      version: stateVersion,
      threads,
      activeId,
      canvas: textValue(raw.canvas, defaultCanvas),
      canvasHistory: history,
      projects,
      selectedModel: ['Forge Local', 'Forge Reasoning'].includes(raw.selectedModel) ? raw.selectedModel : 'Forge Local',
      selectedAssistant: textValue(raw.selectedAssistant, 'forge-local'),
      assistants: (() => {
        const assistants = Array.isArray(raw.assistants) ? raw.assistants.map((a) => ({
          id: textValue(a?.id, makeId('assistant')).slice(0, 100),
          name: textValue(a?.name, 'Custom assistant').trim().slice(0, 80),
          description: textValue(a?.description, 'Custom local assistant').slice(0, 200),
          instructions: textValue(a?.instructions).slice(0, 12000),
          tools: Array.isArray(a?.tools) ? a.tools.map((x) => textValue(x).trim().slice(0, 80)).filter(Boolean) : [],
          permissions: {
            read: Boolean(a?.permissions?.read),
            write: Boolean(a?.permissions?.write),
            network: Boolean(a?.permissions?.network)
          }
        })).filter((a) => a.id && a.name) : [];
        return assistants.length ? assistants : base.assistants;
      })(),
      toolConnections: Array.isArray(raw.toolConnections) ? raw.toolConnections.map((t) => ({
        id: textValue(t?.id, makeId('tool')).slice(0, 100),
        name: textValue(t?.name, 'Local tool').trim().slice(0, 100),
        type: textValue(t?.type, 'MCP').slice(0, 40),
        endpoint: textValue(t?.endpoint).trim().slice(0, 500),
        enabled: Boolean(t?.enabled),
        requiresConfirmation: t?.requiresConfirmation !== false
      })).filter((t) => t.name && t.endpoint) : [],
      settings: {
        theme: ['system', 'light', 'dark'].includes(raw.settings?.theme) ? raw.settings.theme : 'system',
        onboardingComplete: Boolean(raw.settings?.onboardingComplete),
        reduceMotion: Boolean(raw.settings?.reduceMotion)
      }
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(storeKey);
      if (!raw) return defaultState();
      try {
        return normalizeState(JSON.parse(raw));
      } catch (error) {
        try {
          localStorage.setItem(storeKey + '-recovery', raw.slice(0, 200000));
        } catch (_) {}
        showToast('Saved state was damaged; a clean workspace was restored');
        return defaultState();
      }
    } catch (error) {
      return defaultState();
    }
  }

  let state = loadState();
  let editingIndex = null;
  let responseTimer = null;
  let suppressStorageEvent = false;

  function persist() {
    try {
      state.version = stateVersion;
      const serialized = JSON.stringify(state);
      localStorage.setItem(storeKey, serialized);
      renderThreadList();
      updateStorageIndicator();
      return true;
    } catch (error) {
      showToast('Could not save locally; storage may be full or blocked');
      return false;
    }
  }

  function selectedAssistant() {
    const assistant = state.assistants.find((item) => item.id === state.selectedAssistant || item.name === state.selectedAssistant);
    return assistant || state.assistants[0] || null;
  }

  function applyTheme() {
    const theme = state.settings?.theme || 'system';
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.toggle('reduce-motion', Boolean(state.settings?.reduceMotion));
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#17161b' : '#f7f4ee');
  }

  function renderSettings() {
    openOverlay('Settings', 'WORKSPACE',
      '<div class="settings-panel"><section><h3>Appearance</h3><label class="setting-row"><span><strong>Theme</strong><small>Choose light, dark, or follow your device.</small></span><select id="themeSelect"><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label><label class="setting-row"><span><strong>Reduce motion</strong><small>Prefer less animation and transition.</small></span><input id="reduceMotion" type="checkbox" /></label></section><section><h3>Safety</h3><p class="settings-copy">Tool actions are disabled by default. Connections require explicit enablement and can require confirmation before execution.</p></section><button class="canvas-save" id="saveSettings" type="button">Save settings</button></div>'
    );
    byId('themeSelect').value = state.settings.theme;
    byId('reduceMotion').checked = state.settings.reduceMotion;
    byId('saveSettings').addEventListener('click', () => {
      state.settings.theme = byId('themeSelect').value;
      state.settings.reduceMotion = byId('reduceMotion').checked;
      applyTheme();
      persist();
      closeOverlay();
      showToast('Settings saved locally');
    });
  }

  function renderAssistants() {
    const assistants = state.assistants;
    openOverlay('Assistants & tools', 'WORKSPACE',
      '<div class="assistant-toolbar"><span>' + assistants.length + ' assistants</span><button class="overlay-action" id="createAssistant">+ New assistant</button></div>' +
      '<div class="overlay-list">' + assistants.map((assistant) =>
        '<button class="overlay-list-item" data-assistant-id="' + escapeAttribute(assistant.id) + '" type="button"><span class="assistant-avatar">✦</span><span><strong>' + escapeHtml(assistant.name) + '</strong><small>' + escapeHtml(assistant.description) + '</small></span><span class="overlay-action">' + (selectedAssistant()?.id === assistant.id ? 'Active' : 'Use') + '</span></button>'
      ).join('') + '</div>' +
      '<div class="tool-connections"><div class="assistant-toolbar"><strong>Tool / MCP connections</strong><button class="overlay-action" id="addToolConnection">+ Add</button></div>' +
      (state.toolConnections.length ? state.toolConnections.map((tool) => '<div class="tool-connection"><span><strong>' + escapeHtml(tool.name) + '</strong><small>' + escapeHtml(tool.type) + ' · ' + (tool.enabled ? 'Enabled' : 'Disabled') + (tool.requiresConfirmation ? ' · confirmation required' : '') + '</small></span><button class="overlay-action" data-tool-toggle="' + escapeAttribute(tool.id) + '" type="button">' + (tool.enabled ? 'Disable' : 'Enable') + '</button></div>').join('') : '<p class="empty-overlay">No tool connections yet. Add one when you are ready to connect an MCP server.</p>') +
      '</div>'
    );
    $('[data-assistant-id]').forEach((button) => button.addEventListener('click', () => editAssistant(button.dataset.assistantId)));
    byId('createAssistant').addEventListener('click', () => editAssistant(null));
    byId('addToolConnection').addEventListener('click', addToolConnection);
    $('[data-tool-toggle]').forEach((button) => button.addEventListener('click', () => {
      const tool = state.toolConnections.find((x) => x.id === button.dataset.toolToggle);
      if (!tool) return;
      tool.enabled = !tool.enabled;
      persist();
      renderAssistants();
    }));
  }

  function editAssistant(id) {
    const assistant = id ? state.assistants.find((x) => x.id === id) : null;
    const draft = assistant || { id: makeId('assistant'), name: '', description: '', instructions: '', tools: [], permissions: {} };
    openOverlay(assistant ? 'Edit assistant' : 'Create assistant', 'ASSISTANT',
      '<div class="assistant-editor"><label>Name<input id="assistantName" maxlength="80" value="' + escapeAttribute(draft.name) + '"></label><label>Description<input id="assistantDescription" maxlength="200" value="' + escapeAttribute(draft.description) + '"></label><label>Instructions<textarea id="assistantInstructions" maxlength="12000">' + escapeHtml(draft.instructions) + '</textarea></label><label>Tool access<textarea id="assistantTools" placeholder="One tool ID per line">' + escapeHtml(draft.tools.join(String.fromCharCode(10))) + '</textarea></label><div class="permission-grid"><label><input id="permRead" type="checkbox"> Read local files</label><label><input id="permWrite" type="checkbox"> Write local files</label><label><input id="permNetwork" type="checkbox"> Network tools</label></div><p class="settings-copy">Write and network actions require confirmation by default.</p><button class="canvas-save" id="saveAssistant" type="button">Save assistant</button></div>'
    );
    byId('permRead').checked = Boolean(draft.permissions.read);
    byId('permWrite').checked = Boolean(draft.permissions.write);
    byId('permNetwork').checked = Boolean(draft.permissions.network);
    byId('saveAssistant').addEventListener('click', () => {
      const name = byId('assistantName').value.trim();
      if (!name) { showToast('Assistant name is required'); return; }
      draft.name = name.slice(0, 80);
      draft.description = byId('assistantDescription').value.trim().slice(0, 200);
      draft.instructions = byId('assistantInstructions').value.slice(0, 12000);
      draft.tools = byId('assistantTools').value.split(String.fromCharCode(10)).map((x) => x.trim()).filter(Boolean).slice(0, 50);
      draft.permissions = { read: byId('permRead').checked, write: byId('permWrite').checked, network: byId('permNetwork').checked };
      if (!assistant) state.assistants.push(draft);
      state.selectedAssistant = draft.id;
      persist();
      closeOverlay();
      updateContextDrawer();
      showToast(draft.name + ' saved');
    });
  }

  function addToolConnection() {
    const name = window.prompt('Connection name', 'My MCP server');
    if (!name?.trim()) return;
    const endpoint = window.prompt('MCP endpoint or local command', '');
    if (!endpoint?.trim()) return;
    state.toolConnections.push({ id: makeId('tool'), name: name.trim().slice(0, 100), type: 'MCP', endpoint: endpoint.trim().slice(0, 500), enabled: false, requiresConfirmation: true });
    persist();
    renderAssistants();
    showToast('Tool connection added and disabled');
  }

  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(window.__toastTimer);
    window.__toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
  }

  function resizeComposer() {
    if (!promptBox) return;
    promptBox.style.height = 'auto';
    promptBox.style.height = Math.min(promptBox.scrollHeight, 140) + 'px';
  }

  function toggleContext(force) {
    contextDrawer.classList.toggle('open', force ?? !contextDrawer.classList.contains('open'));
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/\n|\r/g, ' ');
  }

  function highlightCode(code) {
    let safe = escapeHtml(code);
    safe = safe
      .replace(/(\/\/.*)$/gm, '<span class="tok-comment">$1</span>')
      .replace(/(&quot;.*?&quot;|&#39;.*?&#39;|\`.*?\`)/g, '<span class="tok-string">$1</span>')
      .replace(/\b(const|let|var|function|return|if|else|for|class|new|import|from|export|async|await)\b/g, '<span class="tok-keyword">$1</span>');
    return safe;
  }

  function renderContent(value) {
    let safe = escapeHtml(value);
    const blocks = [];
    safe = safe.replace(/\`\`\`([\w-]+)?\n([\s\S]*?)\`\`\`/g, (_, lang, code) => {
      const id = 'code-' + blocks.length;
      blocks.push(
        '<pre class="code-block"><div><span>' + escapeHtml(lang || 'text') +
        '</span><button class="copy-code" data-code="' + encodeURIComponent(code) +
        '" type="button">Copy</button></div><code>' + highlightCode(code) + '</code></pre>'
      );
      return '%%' + id + '%%';
    });
    safe = safe
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\`([^\`]+)\`/g, '<code class="inline-code">$1</code>')
      .replace(/\n/g, '<br>');
    blocks.forEach((block, index) => { safe = safe.replace('%%code-' + index + '%%', block); });
    return safe;
  }

  function messageActions(kind, index) {
    const copy = '<button type="button" data-message-action="copy" data-index="' + index + '">Copy</button>';
    const main = kind === 'user'
      ? '<button type="button" data-message-action="edit" data-index="' + index + '">Edit</button>'
      : '<button type="button" data-message-action="regenerate" data-index="' + index + '">Regenerate</button><button type="button" data-message-action="continue" data-index="' + index + '">Continue</button>';
    return '<div class="message-actions">' + copy + main + '<button type="button" data-message-action="delete" data-index="' + index + '">Delete</button></div>';
  }

  function addMessage(kind, content, label, save = true, index = currentThread().messages.length) {
    const message = document.createElement('div');
    message.className = 'message ' + kind;
    message.dataset.index = String(index);

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar ' + (kind === 'user' ? 'user' : 'forge');
    avatar.textContent = kind === 'user' ? 'DK' : '✦';

    const column = document.createElement('div');
    column.className = 'message-column';

    const body = document.createElement('div');
    body.className = 'message-body';

    if (kind === 'assistant') {
      const labelNode = document.createElement('div');
      labelNode.className = 'message-label';
      labelNode.textContent = label || 'Forge Local';
      body.appendChild(labelNode);
    }

    const rendered = document.createElement('div');
    rendered.innerHTML = renderContent(content);
    body.appendChild(rendered);
    column.appendChild(body);

    const actions = document.createElement('div');
    actions.innerHTML = messageActions(kind, index);
    column.appendChild(actions.firstElementChild);

    message.append(avatar, column);
    conversation.appendChild(message);

    if (save) {
      currentThread().messages.push({ kind, content: textValue(content), label: textValue(label, kind === 'assistant' ? 'Forge Local' : '') });
      persist();
    }
    conversation.scrollTop = conversation.scrollHeight;
  }

  function currentThread() {
    return state.threads.find((thread) => thread.id === state.activeId) || state.threads[0];
  }

  function updateStorageIndicator() {
    const usage = $('.usage-top span:nth-child(2)');
    const bar = $('.usage-bar i');
    if (!usage || !bar) return;
    try {
      const bytes = new Blob([JSON.stringify(state)]).size;
      const percent = Math.min(99, Math.max(1, Math.round((bytes / (5 * 1024 * 1024)) * 100)));
      usage.textContent = percent + '%';
      bar.style.width = percent + '%';
    } catch (_) {}
  }

  function renderThreadList(query = '') {
    if (!recentSection) return;
    $$('.thread-item[data-thread-id]', recentSection).forEach((item) => item.remove());

    const normalizedQuery = String(query || '').trim().toLowerCase();
    state.threads.forEach((thread, index) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'thread-item' + (thread.id === state.activeId ? ' selected' : '');
      item.dataset.threadId = thread.id;

      const dot = document.createElement('span');
      dot.className = 'thread-dot' + (thread.id === state.activeId ? '' : ' dim');
      const title = document.createElement('span');
      title.className = 'thread-title';
      title.textContent = thread.title;
      const time = document.createElement('span');
      time.className = 'thread-time';
      time.textContent = index === 0 ? 'now' : '';

      item.append(dot, title, time);
      const haystack = [thread.title, ...thread.messages.map((m) => m.content)].join(' ').toLowerCase();
      item.hidden = normalizedQuery ? !haystack.includes(normalizedQuery) : false;
      recentSection.appendChild(item);
    });
  }

  function renderAttachments() {
    attachmentTray.replaceChildren();
    (currentThread().attachments || []).forEach((attachment, index) => {
      const chip = document.createElement('span');
      chip.className = 'attachment-chip';

      const icon = document.createElement('span');
      icon.className = 'attachment-icon';
      icon.textContent = attachment.type.startsWith('image/') ? '▧' : '▤';

      const name = document.createElement('span');
      name.textContent = attachment.name;

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.dataset.removeAttachment = String(index);
      remove.setAttribute('aria-label', 'Remove ' + attachment.name);
      remove.textContent = '×';

      chip.append(icon, name, remove);
      attachmentTray.appendChild(chip);
    });
  }

  function updateContextDrawer() {
    const thread = currentThread();
    const heading = $('.drawer-header h2', contextDrawer);
    if (heading) heading.textContent = thread.title;
    const count = $('.project-card small', contextDrawer);
    if (count) count.textContent = thread.attachments.length + ' attached files · Local workspace';
    const assistant = selectedAssistant();
    const assistantName = $('.assistant-card strong', contextDrawer);
    const assistantDescription = $('.assistant-card small', contextDrawer);
    if (assistantName) assistantName.textContent = assistant?.name || 'Forge Local';
    if (assistantDescription) assistantDescription.textContent = assistant?.description || 'Clear, careful, action-oriented';
  }

  function renderThread(thread) {
    if (!thread) return;
    state.activeId = thread.id;
    threadName.textContent = thread.title;
    updateContextDrawer();
    conversation.replaceChildren();

    if (thread.messages.length) {
      chatStage.classList.add('has-messages');
      starterGrid.setAttribute('aria-hidden', 'true');
      thread.messages.forEach((message, index) => {
        addMessage(message.kind, message.content, message.label, false, index);
      });
    } else {
      chatStage.classList.remove('has-messages');
      starterGrid.removeAttribute('aria-hidden');
    }

    renderAttachments();
    renderThreadList();
    updateStorageIndicator();
  }

  function openPalette() {
    commandPalette.classList.add('open');
    paletteInput.value = '';
    renderThreadList('');
    setTimeout(() => paletteInput.focus(), 50);
  }

  function closePalette() {
    commandPalette.classList.remove('open');
    renderThreadList('');
  }

  function openOverlay(title, kicker, html, extra = '') {
    overlayTitle.textContent = title;
    overlayKicker.textContent = kicker;
    overlayBody.innerHTML = html;
    overlay.classList.add('open');
    overlay.classList.toggle('canvas-open', extra === 'canvas');
    overlay.setAttribute('aria-hidden', 'false');
  }

  function closeOverlay() {
    overlay.classList.remove('open', 'canvas-open');
    overlay.setAttribute('aria-hidden', 'true');
  }

  let responseRequestId = 0;

  function simulateResponse(input, sourceMessageIndex = null, replaceMessageIndex = null) {
    clearTimeout(responseTimer);
    const requestId = ++responseRequestId;
    const threadId = state.activeId;
    const typing = document.createElement('div');
    typing.className = 'message assistant';
    typing.innerHTML = '<div class="message-avatar forge">✦</div><div class="message-column"><div class="message-body"><div class="message-label">' + escapeHtml(state.selectedAssistant) + '</div><span class="typing-dots"><i></i><i></i><i></i></span></div></div>';
    conversation.appendChild(typing);
    conversation.scrollTop = conversation.scrollHeight;

    responseTimer = setTimeout(() => {
      if (!typing.isConnected || requestId !== responseRequestId || state.activeId !== threadId) return;
      typing.remove();
      const text = textValue(input);
      const lower = text.toLowerCase();
      const project = state.projects[0];
      const assistant = selectedAssistant();
      let response;

      if (lower.includes('code')) {
        response = "Here is a small starting point:\n\n\`\`\`js\nconst nextStep = 'make it real';\nconsole.log(nextStep);\n\`\`\`\n\nWe can iterate on this in Canvas.";
      } else if (lower.includes('canvas') || lower.includes('draft')) {
        response = 'I can shape this in Canvas while keeping the current thread and local project context nearby.';
      } else if (lower.includes('idea') || lower.includes('plan')) {
        response = 'Let’s give that spark a shape. Start with the outcome, name the constraint, and choose one small experiment you can finish today.';
      } else if (assistant?.instructions) {
        response = 'Using ' + assistant.name + ': ' + assistant.instructions.slice(0, 220);
      } else if (project?.instructions) {
        response = 'I’m working locally with the project guidance in mind: ' + project.instructions.slice(0, 220);
      } else {
        response = 'I’m ready to work through that with you. This local preview simulates the complete flow before you connect a model.';
      }

      const thread = state.threads.find((candidate) => candidate.id === threadId);
      if (!thread) return;
      const assistantMessage = { kind: 'assistant', content: textValue(response), label: assistant?.name || 'Forge Local' };
      if (Number.isInteger(replaceMessageIndex) && replaceMessageIndex >= 0 && replaceMessageIndex < thread.messages.length) {
        thread.messages[replaceMessageIndex] = assistantMessage;
        persist();
        renderThread(thread);
      } else {
        addMessage('assistant', assistantMessage.content, assistantMessage.label);
      }
    }, 650);
  }

  function sendMessage() {
    const text = promptBox.value.trim();
    if (!text) {
      showToast('Write a message to begin');
      promptBox.focus();
      return;
    }

    const thread = currentThread();
    if (editingIndex !== null && thread.messages[editingIndex]?.kind === 'user') {
      thread.messages[editingIndex].content = text;
      thread.messages.splice(editingIndex + 1);
      editingIndex = null;
      persist();
      renderThread(thread);
      promptBox.value = '';
      resizeComposer();
      simulateResponse(text, thread.messages.length - 1);
      return;
    }

    if (!thread.messages.length) {
      thread.title = text.length > 28 ? text.slice(0, 28) + '…' : text;
      threadName.textContent = thread.title;
      chatStage.classList.add('has-messages');
      starterGrid.setAttribute('aria-hidden', 'true');
    }

    addMessage('user', text);
    promptBox.value = '';
    resizeComposer();
    simulateResponse(text);
  }

  function safeClipboardWrite(value, successMessage) {
    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
      showToast('Clipboard is unavailable in this browser');
      return;
    }
    navigator.clipboard.writeText(value).then(
      () => showToast(successMessage),
      () => showToast('Clipboard permission was denied')
    );
  }

  function exportCanvasFile(content, format) {
    if (format === 'pdf') {
      const win = window.open('', '_blank', 'noopener,noreferrer');
      if (!win) {
        showToast('Allow pop-ups to export PDF');
        return;
      }
      win.document.write('<!doctype html><html><head><title>Forge Canvas</title><style>body{font:15px system-ui;max-width:760px;margin:60px auto;line-height:1.7;white-space:pre-wrap}h1{font-size:28px}</style></head><body><h1>Forge Canvas</h1><div id="content"></div></body></html>');
      win.document.close();
      const target = win.document.getElementById('content');
      if (target) target.textContent = content;
      win.focus();
      setTimeout(() => win.print(), 120);
      showToast('Print dialog opened for PDF export');
      return;
    }

    const ext = format === 'js' ? 'js' : 'md';
    const type = format === 'js' ? 'text/javascript' : 'text/markdown';
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'forge-canvas.' + ext;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    showToast('Canvas exported as ' + ext.toUpperCase());
  }

  function openCanvas() {
    const historyCount = state.canvasHistory.length;
    const thread = currentThread();
    const miniChat = thread.messages.slice(-4).map((message) =>
      '<div class="mini-message ' + escapeAttribute(message.kind) + '">' + escapeHtml(message.content).slice(0, 120) + (message.content.length > 120 ? '…' : '') + '</div>'
    ).join('') || '<div class="mini-empty">Your conversation will appear here as you work.</div>';

    openOverlay('Canvas', 'FOCUSED WORK SURFACE',
      '<div class="canvas-layout"><div class="canvas-chat-pane">' +
      '<p class="canvas-rail-kicker">LIVE THREAD</p><h3>' + escapeHtml(thread.title) + '</h3>' +
      '<p>' + thread.messages.length + ' messages · ' + thread.attachments.length + ' attached files</p>' +
      '<div class="canvas-mini-chat">' + miniChat + '</div>' +
      '<div class="canvas-context-note"><span>✦</span><span>Canvas shares this thread’s local context.</span></div></div>' +
      '<div class="canvas-editor"><div class="canvas-version-row"><span>Draft · v' + (historyCount + 1) + '</span><span>' +
      (historyCount ? historyCount + ' saved version' + (historyCount > 1 ? 's' : '') : 'Unsaved') +
      '</span></div><textarea class="canvas-textarea" id="canvasText" aria-label="Canvas editor"></textarea>' +
      '<div class="canvas-tools"><p>Quick tools</p>' +
      '<button class="canvas-tool" data-canvas-tool="shorter" type="button">Make shorter</button>' +
      '<button class="canvas-tool" data-canvas-tool="polish" type="button">Add final polish</button>' +
      '<button class="canvas-tool" data-canvas-tool="outline" type="button">Create outline</button>' +
      '<button class="canvas-tool" data-canvas-tool="comments" type="button">Add comments</button>' +
      (historyCount ? '<button class="canvas-tool" id="restoreCanvas" type="button">Restore previous</button>' : '') +
      '<button class="canvas-export" id="exportMd" type="button">Markdown</button>' +
      '<button class="canvas-export" id="exportPdf" type="button">PDF</button>' +
      '<button class="canvas-export" id="exportCode" type="button">Code</button>' +
      '<button class="canvas-save" id="saveCanvas" type="button">Save version locally</button></div></div></div>',
      'canvas'
    );

    const editor = byId('canvasText');
    editor.value = state.canvas;

    $$('.canvas-tool').forEach((button) => button.addEventListener('click', () => {
      const action = button.dataset.canvasTool;
      if (action === 'shorter') editor.value = editor.value.split('\n').filter(Boolean).slice(0, 3).join('\n');
      if (action === 'outline') editor.value = '# Working outline\n\n1. Context\n2. Key idea\n3. Next step\n\n' + editor.value;
      if (action === 'comments') editor.value = editor.value + '\n\n[Forge note: clarify the intended outcome here.]';
      if (action === 'polish') editor.value = editor.value.trim() + '\n\nPolished for clarity and flow.';
      showToast(button.textContent + ' applied');
    }));

    byId('saveCanvas').addEventListener('click', () => {
      const content = editor.value;
      state.canvasHistory.unshift({ content, at: new Date().toISOString() });
      state.canvasHistory = state.canvasHistory.slice(0, 50);
      state.canvas = content;
      persist();
      closeOverlay();
      showToast('Canvas version saved locally');
    });

    byId('exportMd').addEventListener('click', () => exportCanvasFile(editor.value, 'md'));
    byId('exportPdf').addEventListener('click', () => exportCanvasFile(editor.value, 'pdf'));
    byId('exportCode').addEventListener('click', () => exportCanvasFile(editor.value, 'js'));

    const restore = byId('restoreCanvas');
    if (restore) restore.addEventListener('click', () => {
      if (state.canvasHistory[0]) {
        editor.value = state.canvasHistory[0].content;
        showToast('Previous version restored');
      }
    });
  }

  function projectById(id) {
    return state.projects.find((project) => project.id === id);
  }

  function attachProjectFile(file) {
    if (!file) return;
    const thread = currentThread();
    thread.attachments ||= [];
    if (!thread.attachments.some((item) => item.name === file.name)) {
      thread.attachments.push({ name: file.name, type: file.type || 'file', size: file.size || 0 });
      persist();
      renderAttachments();
      updateContextDrawer();
      showToast(file.name + ' attached to this thread');
    }
  }

  function renderProjectDetail(project) {
    if (!project) return;
    const files = project.files.map((file, index) =>
      '<div class="project-file"><span class="file-icon ' + (file.type.includes('css') ? 'css' : 'html') + '">' +
      (file.type.includes('css') ? '✦' : '‹/›') + '</span><strong>' + escapeHtml(file.name) +
      '</strong><button class="attach-project-file" data-file-index="' + index + '" type="button">Attach</button></div>'
    ).join('');
    const folders = project.folders.map((folder) =>
      '<div class="project-file folder"><span>▱</span><strong>' + escapeHtml(folder) + '/</strong></div>'
    ).join('');

    openOverlay(project.name, 'PROJECT',
      '<div class="project-detail"><div class="project-detail-toolbar"><button class="overlay-action" id="projectBack">← All projects</button><span>' +
      (project.memory ? 'Memory on' : 'Memory off') + '</span></div><div class="project-detail-grid"><section><h3>Files & folders</h3>' +
      '<div class="file-list">' + folders + files + '</div><div class="project-detail-actions">' +
      '<button class="overlay-action" id="addProjectFile">+ Add file</button><button class="overlay-action" id="addProjectFolder">+ New folder</button></div></section>' +
      '<section><h3>Project instructions</h3><textarea id="projectInstructions" class="project-instructions"></textarea>' +
      '<label class="memory-toggle"><input id="projectMemory" type="checkbox" ' + (project.memory ? 'checked' : '') +
      '/> Allow Forge to remember project decisions locally</label><button class="canvas-save" id="saveProjectSettings" type="button">Save project settings</button></section></div></div>'
    );

    byId('projectInstructions').value = project.instructions || '';
    byId('projectBack').addEventListener('click', () => showWorkspace('Projects'));

    $$('.attach-project-file').forEach((button) => button.addEventListener('click', () => {
      attachProjectFile(project.files[Number(button.dataset.fileIndex)]);
    }));

    byId('addProjectFile').addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.multiple = true;
      input.addEventListener('change', () => {
        Array.from(input.files || []).forEach((file) => project.files.push({ name: file.name, type: file.type, size: file.size }));
        persist();
        renderProjectDetail(project);
        showToast('Project files added locally');
      });
      input.click();
    });

    byId('addProjectFolder').addEventListener('click', () => {
      const name = window.prompt('Folder name', 'notes');
      if (!name?.trim()) return;
      project.folders.push(name.trim().slice(0, 120));
      persist();
      renderProjectDetail(project);
    });

    byId('saveProjectSettings').addEventListener('click', () => {
      project.instructions = byId('projectInstructions').value.slice(0, 10000);
      project.memory = byId('projectMemory').checked;
      persist();
      showToast('Project settings saved locally');
    });
  }

  function showWorkspace(kind) {
    if (kind === 'Projects') {
      const cards = state.projects.map((project) =>
        '<div class="workspace-card project-card-functional"><button class="project-open" data-project-id="' + escapeAttribute(project.id) + '" type="button">' +
        '<div class="workspace-card-top"><span class="workspace-card-icon">▦</span><span>↗</span></div><h3>' + escapeHtml(project.name) +
        '</h3><p>' + escapeHtml(project.description) + '</p><div class="workspace-card-meta"><span>' + project.files.length +
        ' files</span><span>·</span><span>' + (project.memory ? 'Memory on' : 'Memory off') + '</span></div></button>' +
        '<div class="project-card-actions"><button data-project-rename="' + escapeAttribute(project.id) + '" type="button">Rename</button>' +
        '<button data-project-delete="' + escapeAttribute(project.id) + '" type="button">Delete</button></div></div>'
      ).join('');

      openOverlay('Projects', 'WORKSPACE',
        '<div class="project-toolbar"><span>' + state.projects.length + ' local projects</span><button class="overlay-action" id="createProject">+ New project</button></div>' +
        '<div class="workspace-grid">' + cards + '</div>'
      );

      $$('.project-open').forEach((button) => button.addEventListener('click', () => renderProjectDetail(projectById(button.dataset.projectId))));
      byId('createProject').addEventListener('click', () => {
        const name = window.prompt('Project name', 'New project');
        if (!name?.trim()) return;
        state.projects.push({
          id: makeId('project'),
          name: name.trim().slice(0, 120),
          description: 'A focused local workspace.',
          files: [],
          folders: [],
          instructions: '',
          memory: true
        });
        persist();
        showWorkspace('Projects');
      });

      $$('[data-project-rename]').forEach((button) => button.addEventListener('click', () => {
        const project = projectById(button.dataset.projectRename);
        if (!project) return;
        const name = window.prompt('Rename project', project.name);
        if (!name?.trim()) return;
        project.name = name.trim().slice(0, 120);
        persist();
        showWorkspace('Projects');
      }));

      $$('[data-project-delete]').forEach((button) => button.addEventListener('click', () => {
        if (state.projects.length === 1) {
          showToast('Keep at least one project');
          return;
        }
        if (!window.confirm('Delete this local project?')) return;
        state.projects = state.projects.filter((project) => project.id !== button.dataset.projectDelete);
        persist();
        showWorkspace('Projects');
      }));
      return;
    }

    if (kind === 'Assistants') {
      renderAssistants();
      return;
    }

    const models = [
      ['Forge Local', 'Fast · private · on device'],
      ['Forge Reasoning', 'Deeper thinking · local']
    ];
    openOverlay('Model hub', 'LOCAL MODELS',
      '<div class="overlay-list">' + models.map(([name, description]) =>
        '<button class="overlay-list-item" data-hub-model="' + escapeAttribute(name) + '" type="button"><span class="workspace-card-icon">✦</span>' +
        '<span><strong>' + escapeHtml(name) + '</strong><small>' + escapeHtml(description) + '</small></span>' +
        '<span class="overlay-action">' + (state.selectedModel === name ? 'Active' : 'Use') + '</span></button>'
      ).join('') + '<div class="empty-overlay"><strong>Your models stay yours.</strong><small>Browse and switch models without leaving the workspace.</small></div></div>'
    );
    $$('[data-hub-model]').forEach((button) => button.addEventListener('click', () => {
      state.selectedModel = button.dataset.hubModel;
      updateModelButton();
      persist();
      closeOverlay();
      showToast(state.selectedModel + ' selected');
    }));
  }

  function updateModelButton() {
    modelButton.replaceChildren();
    const dot = document.createElement('span');
    dot.className = 'status-dot';
    const label = document.createTextNode(' ' + state.selectedModel + ' ');
    const chevron = document.createElement('span');
    chevron.className = 'chevron';
    chevron.textContent = '⌄';
    modelButton.append(dot, label, chevron);
    $$('.model-option').forEach((option) => {
      const selected = option.querySelector('strong')?.textContent === state.selectedModel;
      option.classList.toggle('chosen', selected);
      const marker = option.lastElementChild;
      if (marker) marker.textContent = selected ? '✓' : '';
    });
  }

  function newThread() {
    const thread = { id: makeId('thread'), title: 'Untitled conversation', messages: [], attachments: [] };
    state.threads.unshift(thread);
    editingIndex = null;
    clearTimeout(responseTimer);
    renderThread(thread);
    promptBox.value = '';
    resizeComposer();
    promptBox.focus();
    showToast('New thread ready');
  }

  byId('settingsButton')?.addEventListener('click', renderSettings);
  byId('shareButton')?.addEventListener('click', () => safeClipboardWrite(window.location.href, 'Workspace link copied'));
  byId('editAssistantContext')?.addEventListener('click', () => renderAssistants());
  byId('finishOnboarding')?.addEventListener('click', () => {
    state.settings.onboardingComplete = true;
    persist();
    byId('onboardingOverlay')?.setAttribute('aria-hidden', 'true');
  });
  byId('newChat').addEventListener('click', newThread);
  $$('.starter-card').forEach((card) => card.addEventListener('click', () => {
    const label = $('strong', card)?.textContent || '';
    promptBox.value = label + ': ';
    resizeComposer();
    promptBox.focus();
  }));
  byId('sendButton').addEventListener('click', sendMessage);
  promptBox.addEventListener('input', resizeComposer);
  promptBox.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });
  byId('contextToggle').addEventListener('click', () => toggleContext());
  byId('closeContext').addEventListener('click', () => toggleContext(false));
  byId('addContext').addEventListener('click', () => fileInput.click());
  byId('attachButton').addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', () => {
    const files = Array.from(fileInput.files || []);
    if (!files.length) return;
    const thread = currentThread();
    thread.attachments ||= [];
    files.forEach((file) => {
      if (!thread.attachments.some((existing) => existing.name === file.name && existing.size === file.size)) {
        thread.attachments.push({ name: file.name, type: file.type || 'application/octet-stream', size: file.size });
      }
    });
    persist();
    renderAttachments();
    updateContextDrawer();
    toggleContext(true);
    showToast(files.length + ' file' + (files.length > 1 ? 's' : '') + ' attached locally');
    fileInput.value = '';
  });

  attachmentTray.addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove-attachment]');
    if (!button) return;
    const index = Number(button.dataset.removeAttachment);
    if (!Number.isInteger(index) || index < 0 || index >= currentThread().attachments.length) return;
    currentThread().attachments.splice(index, 1);
    persist();
    renderAttachments();
    updateContextDrawer();
  });

  byId('canvasMode').addEventListener('click', openCanvas);
  byId('searchButton').addEventListener('click', openPalette);
  byId('closeOverlay').addEventListener('click', closeOverlay);
  overlay.addEventListener('click', (event) => { if (event.target === overlay) closeOverlay(); });

  conversation.addEventListener('click', (event) => {
    const code = event.target.closest('.copy-code');
    if (code) {
      safeClipboardWrite(decodeURIComponent(code.dataset.code || ''), 'Code copied');
      return;
    }

    const button = event.target.closest('[data-message-action]');
    if (!button) return;
    const index = Number(button.dataset.index);
    const thread = currentThread();
    const message = thread.messages[index];
    if (!message) return;

    if (button.dataset.messageAction === 'copy') {
      safeClipboardWrite(message.content, 'Message copied');
    } else if (button.dataset.messageAction === 'edit') {
      editingIndex = index;
      promptBox.value = message.content;
      promptBox.focus();
      resizeComposer();
      showToast('Message loaded into composer');
    } else if (button.dataset.messageAction === 'delete') {
      thread.messages.splice(index, 1);
      editingIndex = null;
      clearTimeout(responseTimer);
      persist();
      renderThread(thread);
      showToast('Message deleted');
    } else if (button.dataset.messageAction === 'regenerate') {
      const userIndex = (() => {
        for (let i = index - 1; i >= 0; i -= 1) if (thread.messages[i].kind === 'user') return i;
        return -1;
      })();
      if (userIndex < 0) {
        showToast('No user message to regenerate');
        return;
      }
      const prompt = thread.messages[userIndex].content;
      thread.messages.splice(index, 1);
      persist();
      renderThread(thread);
      simulateResponse(prompt, userIndex, index);
    } else if (button.dataset.messageAction === 'continue') {
      promptBox.value = 'Continue from this point: ';
      promptBox.focus();
      resizeComposer();
      showToast('Continuation loaded into composer');
    }
  });

  modelButton.addEventListener('click', (event) => {
    event.stopPropagation();
    modelMenu.classList.toggle('open');
  });

  $$('.model-option').forEach((option) => option.addEventListener('click', () => {
    const name = $('strong', option)?.textContent;
    if (!name) return;
    state.selectedModel = name;
    updateModelButton();
    modelMenu.classList.remove('open');
    persist();
    showToast(name + ' selected');
  }));

  $$('.nav-item').forEach((item) => item.addEventListener('click', () => {
    $$('.nav-item').forEach((nav) => nav.classList.remove('active'));
    item.classList.add('active');
    const label = item.textContent.trim().replace(/\d/g, '').trim();
    if (label === 'Chat') {
      closeOverlay();
      showToast('Chat workspace ready');
    } else {
      showWorkspace(label);
    }
  }));

  $$('[data-action]').forEach((item) => item.addEventListener('click', () => {
    const action = item.dataset.action;
    closePalette();
    if (action === 'new') newThread();
    if (action === 'context') toggleContext(true);
    if (action === 'canvas') openCanvas();
  }));

  commandPalette.addEventListener('click', (event) => { if (event.target === commandPalette) closePalette(); });
  paletteInput.addEventListener('input', () => renderThreadList(paletteInput.value));

  document.addEventListener('click', (event) => {
    if (!event.target.closest('#modelButton') && !event.target.closest('#modelMenu')) modelMenu.classList.remove('open');
  });

  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      newThread();
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'i') {
      event.preventDefault();
      toggleContext();
    }
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      openCanvas();
    }
    if (event.key === 'Escape') {
      closePalette();
      closeOverlay();
      modelMenu.classList.remove('open');
      toggleContext(false);
    }
  });

  recentSection.addEventListener('click', (event) => {
    const item = event.target.closest('.thread-item[data-thread-id]');
    if (!item) return;
    const thread = state.threads.find((candidate) => candidate.id === item.dataset.threadId);
    if (!thread) return;
    clearTimeout(responseTimer);
    editingIndex = null;
    renderThread(thread);
    showToast('Thread restored locally');
  });

  window.addEventListener('storage', (event) => {
    if (event.key !== storeKey || suppressStorageEvent || !event.newValue) return;
    try {
      const incoming = normalizeState(JSON.parse(event.newValue));
      if (editingIndex !== null || promptBox.value.trim()) {
        showToast('Another tab changed the workspace; your current draft was kept');
        return;
      }
      clearTimeout(responseTimer);
      responseRequestId += 1;
      state = incoming;
      editingIndex = null;
      applyTheme();
      renderThread(currentThread());
      updateModelButton();
      showToast('Workspace refreshed from another tab');
    } catch (_) {
      showToast('Could not read an update from another tab');
    }
  });

  window.addEventListener('error', (event) => {
    if (event?.error) console.error('Forge runtime error:', event.error);
  });

  window.addEventListener('unhandledrejection', (event) => {
    console.error('Forge unhandled rejection:', event.reason);
  });

  applyTheme();
  if (!state.settings.onboardingComplete) byId('onboardingOverlay')?.setAttribute('aria-hidden', 'false');
  updateModelButton();
  renderThread(currentThread());
  resizeComposer();
  updateStorageIndicator();
})();
