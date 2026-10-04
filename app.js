const toast = document.getElementById('toast');
const promptBox = document.getElementById('prompt');
const modelButton = document.getElementById('modelButton');
const modelMenu = document.getElementById('modelMenu');
const chatStage = document.getElementById('chatStage');
const conversation = document.getElementById('conversation');
const threadName = document.getElementById('threadName');
const starterGrid = document.getElementById('starterGrid');
const contextDrawer = document.getElementById('contextDrawer');
const commandPalette = document.getElementById('commandPalette');
const paletteInput = document.getElementById('paletteInput');
const overlay = document.getElementById('workspaceOverlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlayKicker = document.getElementById('overlayKicker');
const overlayBody = document.getElementById('overlayBody');

const storeKey = 'forge-local-state-v1';
let state = JSON.parse(localStorage.getItem(storeKey) || 'null') || {
  threads: [{ id: 'welcome', title: 'Untitled conversation', messages: [] }],
  activeId: 'welcome',
  canvas: 'Start shaping the work here.\n\nUse this space as a focused, editable surface while Forge keeps the conversation and context nearby.'
};

const currentThread = () => state.threads.find((thread) => thread.id === state.activeId) || state.threads[0];
function persist() { localStorage.setItem(storeKey, JSON.stringify(state)); renderThreadList(); }
function showToast(message) { toast.textContent = message; toast.classList.add('show'); clearTimeout(window.__toastTimer); window.__toastTimer = setTimeout(() => toast.classList.remove('show'), 2200); }
function resizeComposer() { promptBox.style.height = 'auto'; promptBox.style.height = `${Math.min(promptBox.scrollHeight, 140)}px`; }
function toggleContext(force) { contextDrawer.classList.toggle('open', force ?? !contextDrawer.classList.contains('open')); }
function escapeHtml(value) { return value.replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char])); }

function addMessage(kind, content, label, save = true) {
  const message = document.createElement('div');
  message.className = `message ${kind}`;
  message.innerHTML = kind === 'user'
    ? `<div class="message-avatar user">DK</div><div class="message-body">${content}</div>`
    : `<div class="message-avatar forge">✦</div><div class="message-body"><div class="message-label">${label || 'Forge Local'}</div>${content}</div>`;
  conversation.appendChild(message);
  if (save) { currentThread().messages.push({ kind, content, label }); persist(); }
  conversation.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

function renderThread(thread) {
  state.activeId = thread.id;
  threadName.textContent = thread.title;
  conversation.innerHTML = '';
  if (thread.messages.length) {
    chatStage.classList.add('has-messages');
    starterGrid.setAttribute('aria-hidden', 'true');
    thread.messages.forEach((message) => addMessage(message.kind, message.content, message.label, false));
  } else {
    chatStage.classList.remove('has-messages');
    starterGrid.removeAttribute('aria-hidden');
  }
  persist();
}

function renderThreadList() {
  document.querySelectorAll('.thread-item[data-thread-id]').forEach((item) => {
    const thread = state.threads.find((entry) => entry.id === item.dataset.threadId);
    if (thread) {
      item.querySelector('.thread-title').textContent = thread.title;
      item.classList.toggle('selected', thread.id === state.activeId);
    }
  });
}

function simulateResponse(text) {
  const typing = document.createElement('div');
  typing.className = 'message assistant';
  typing.innerHTML = '<div class="message-avatar forge">✦</div><div class="message-body"><div class="message-label">Forge Local</div><span class="typing-dots"><i></i><i></i><i></i></span></div>';
  conversation.appendChild(typing);
  setTimeout(() => {
    typing.remove();
    const lower = text.toLowerCase();
    const response = lower.includes('canvas') || lower.includes('draft')
      ? 'I’ve opened a focused work surface for this. We can keep the conversation on the left and shape the actual draft on the right — without losing the decisions we make here.'
      : lower.includes('idea') || lower.includes('plan')
        ? 'Let’s give that spark a shape. Start with the outcome, name the constraint, and choose one small experiment you can finish today. I’ll keep the working context attached.'
        : 'I’m ready to work through that with you. This local preview simulates the complete flow before you connect a model.';
    addMessage('assistant', response);
  }, 650);
}

function sendMessage() {
  const text = promptBox.value.trim();
  if (!text) { showToast('Write a message to begin'); promptBox.focus(); return; }
  const thread = currentThread();
  if (!thread.messages.length) {
    thread.title = text.length > 28 ? `${text.slice(0, 28)}…` : text;
    threadName.textContent = thread.title;
    chatStage.classList.add('has-messages');
    starterGrid.setAttribute('aria-hidden', 'true');
  }
  addMessage('user', escapeHtml(text));
  promptBox.value = '';
  resizeComposer();
  simulateResponse(text);
}

function openPalette() { commandPalette.classList.add('open'); paletteInput.value = ''; setTimeout(() => paletteInput.focus(), 50); }
function closePalette() { commandPalette.classList.remove('open'); }
function openOverlay(title, kicker, html) { overlayTitle.textContent = title; overlayKicker.textContent = kicker; overlayBody.innerHTML = html; overlay.classList.add('open'); overlay.setAttribute('aria-hidden', 'false'); }
function closeOverlay() { overlay.classList.remove('open'); overlay.setAttribute('aria-hidden', 'true'); }

function showWorkspace(kind) {
  if (kind === 'Projects') {
    openOverlay('Projects', 'WORKSPACE', `<div class="workspace-grid"><button class="workspace-card" data-project="Websat / Forge" type="button"><div class="workspace-card-top"><span class="workspace-card-icon">▦</span><span>↗</span></div><h3>Websat / Forge</h3><p>Design and build the Forge local AI workspace.</p><div class="workspace-card-meta"><span>3 files</span><span>·</span><span>Active now</span></div></button><button class="workspace-card" data-project="Personal lab" type="button"><div class="workspace-card-top"><span class="workspace-card-icon">✦</span><span>↗</span></div><h3>Personal lab</h3><p>Experiments, notes, and ideas kept close to the work.</p><div class="workspace-card-meta"><span>0 files</span><span>·</span><span>Empty</span></div></button><button class="workspace-card" id="newProject" type="button"><div class="workspace-card-top"><span class="workspace-card-icon">＋</span></div><h3>New project</h3><p>Create a focused home for conversations and context.</p></button></div>`);
    document.querySelectorAll('[data-project]').forEach((card) => card.addEventListener('click', () => { closeOverlay(); toggleContext(true); showToast(`${card.dataset.project} selected`); }));
    document.getElementById('newProject').addEventListener('click', () => showToast('New project flow is ready for local setup'));
    return;
  }
  if (kind === 'Assistants') {
    openOverlay('Assistants', 'WORKSPACE', `<div class="overlay-list"><button class="overlay-list-item" type="button"><span class="assistant-avatar">✦</span><span><strong>Forge Local</strong><small>Clear, careful, action-oriented</small></span><span class="status-dot"></span></button><button class="overlay-list-item" type="button"><span class="assistant-avatar">⌘</span><span><strong>Forge Writer</strong><small>Sharp edits, strong voice, clean structure</small></span><span class="overlay-action">Use</span></button><button class="overlay-list-item" type="button"><span class="assistant-avatar">⌁</span><span><strong>Forge Analyst</strong><small>Finds patterns and makes decisions legible</small></span><span class="overlay-action">Use</span></button></div>`);
    return;
  }
  openOverlay('Model hub', 'LOCAL MODELS', `<div class="overlay-list"><button class="overlay-list-item" type="button"><span class="workspace-card-icon">◉</span><span><strong>Forge Local · 7B</strong><small>Fast · 4.2 GB · Runs on this device</small></span><span class="overlay-action">Active</span></button><button class="overlay-list-item" type="button"><span class="workspace-card-icon">✦</span><span><strong>Forge Reasoning · 14B</strong><small>Deeper thinking · 8.8 GB · Downloaded</small></span><span class="overlay-action">Use</span></button><div class="empty-overlay"><strong>Your models stay yours.</strong><small>Browse, download, and switch models without leaving the workspace.</small></div></div>`);
}

function openCanvas() {
  openOverlay('Canvas', 'FOCUSED WORK SURFACE', `<div class="canvas-editor"><textarea class="canvas-textarea" id="canvasText" aria-label="Canvas editor"></textarea><div class="canvas-tools"><p>Quick tools</p><button class="canvas-tool" data-canvas-tool="shorter" type="button">Make shorter</button><button class="canvas-tool" data-canvas-tool="polish" type="button">Add final polish</button><button class="canvas-tool" data-canvas-tool="outline" type="button">Create outline</button><button class="canvas-tool" data-canvas-tool="comments" type="button">Add comments</button><button class="canvas-save" id="saveCanvas" type="button">Save locally</button></div></div>`);
  const editor = document.getElementById('canvasText');
  editor.value = state.canvas;
  document.querySelectorAll('[data-canvas-tool]').forEach((button) => button.addEventListener('click', () => {
    const action = button.dataset.canvasTool;
    editor.value = action === 'shorter' ? editor.value.split('\n').filter(Boolean).slice(0, 3).join('\n') : action === 'outline' ? `# Working outline\n\n1. Context\n2. Key idea\n3. Next step\n\n${editor.value}` : action === 'comments' ? `${editor.value}\n\n[Forge note: clarify the intended outcome here.]` : `${editor.value.trim()}\n\nPolished for clarity and flow.`;
    showToast(`${button.textContent} applied`);
  }));
  document.getElementById('saveCanvas').addEventListener('click', () => { state.canvas = editor.value; persist(); closeOverlay(); showToast('Canvas saved locally'); });
}

document.getElementById('newChat').addEventListener('click', () => { const thread = { id: `thread-${Date.now()}`, title: 'Untitled conversation', messages: [] }; state.threads.unshift(thread); renderThread(thread); promptBox.value = ''; resizeComposer(); promptBox.focus(); showToast('New thread ready'); });
document.querySelectorAll('.starter-card').forEach((card) => card.addEventListener('click', () => { promptBox.value = `${card.querySelector('strong').textContent}: `; resizeComposer(); promptBox.focus(); }));
document.getElementById('sendButton').addEventListener('click', sendMessage);
promptBox.addEventListener('input', resizeComposer);
promptBox.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); } });
document.getElementById('contextToggle').addEventListener('click', () => toggleContext());
document.getElementById('closeContext').addEventListener('click', () => toggleContext(false));
document.getElementById('addContext').addEventListener('click', () => showToast('Context picker is ready for local files'));
document.getElementById('attachButton').addEventListener('click', () => { toggleContext(true); showToast('Choose context from this thread'); });
document.getElementById('canvasMode').addEventListener('click', openCanvas);
document.getElementById('searchButton').addEventListener('click', openPalette);
document.getElementById('closeOverlay').addEventListener('click', closeOverlay);
overlay.addEventListener('click', (event) => { if (event.target === overlay) closeOverlay(); });
modelButton.addEventListener('click', (event) => { event.stopPropagation(); modelMenu.classList.toggle('open'); });
document.querySelectorAll('.model-option').forEach((option) => option.addEventListener('click', () => { const name = option.querySelector('strong').textContent; modelButton.innerHTML = `<span class="status-dot"></span> ${name} <span class="chevron">⌄</span>`; modelMenu.classList.remove('open'); showToast(`${name} selected`); }));
document.querySelectorAll('.nav-item').forEach((item) => item.addEventListener('click', () => { document.querySelectorAll('.nav-item').forEach((nav) => nav.classList.remove('active')); item.classList.add('active'); const label = item.textContent.trim().replace(/\d/g, '').trim(); if (label === 'Chat') { closeOverlay(); showToast('Chat workspace ready'); } else showWorkspace(label); }));
document.querySelectorAll('[data-action]').forEach((item) => item.addEventListener('click', () => { const action = item.dataset.action; closePalette(); if (action === 'new') document.getElementById('newChat').click(); if (action === 'context') toggleContext(true); if (action === 'canvas') openCanvas(); }));
commandPalette.addEventListener('click', (event) => { if (event.target === commandPalette) closePalette(); });
document.addEventListener('click', () => modelMenu.classList.remove('open'));
document.addEventListener('keydown', (event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); document.getElementById('newChat').click(); } if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'i') { event.preventDefault(); toggleContext(); } if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); openCanvas(); } if (event.key === 'Escape') { closePalette(); closeOverlay(); modelMenu.classList.remove('open'); toggleContext(false); } });
const recent = document.querySelector('.recent-section');
recent.addEventListener('click', (event) => { const item = event.target.closest('.thread-item[data-thread-id]'); if (item) { const thread = state.threads.find((entry) => entry.id === item.dataset.threadId); if (thread) { renderThread(thread); showToast('Thread restored locally'); } } });
state.threads.slice(0, 3).forEach((thread, index) => { const item = document.querySelectorAll('.thread-item')[index]; if (item) { item.dataset.threadId = thread.id; item.querySelector('.thread-title').textContent = thread.title; } });
renderThread(currentThread());
resizeComposer();
