const toast = document.getElementById('toast');
const promptBox = document.getElementById('prompt');
const modelButton = document.getElementById('modelButton');
const modelMenu = document.getElementById('modelMenu');
const chatStage = document.getElementById('chatStage');
const conversation = document.getElementById('conversation');
const threadName = document.getElementById('threadName');
const starterGrid = document.getElementById('starterGrid');

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(window.__toastTimer);
  window.__toastTimer = window.setTimeout(() => toast.classList.remove('show'), 2200);
}

function resizeComposer() {
  promptBox.style.height = 'auto';
  promptBox.style.height = `${Math.min(promptBox.scrollHeight, 140)}px`;
}

function addMessage(kind, content, label) {
  const message = document.createElement('div');
  message.className = `message ${kind}`;
  message.innerHTML = kind === 'user'
    ? `<div class="message-avatar user">DK</div><div class="message-body">${content}</div>`
    : `<div class="message-avatar forge">✦</div><div class="message-body"><div class="message-label">${label || 'Forge Local'}</div>${content}</div>`;
  conversation.appendChild(message);
  conversation.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

function simulateResponse(text) {
  const typing = document.createElement('div');
  typing.className = 'message assistant';
  typing.innerHTML = '<div class="message-avatar forge">✦</div><div class="message-body"><div class="message-label">Forge Local</div><span class="typing-dots"><i></i><i></i><i></i></span></div>';
  conversation.appendChild(typing);
  setTimeout(() => {
    typing.remove();
    const lower = text.toLowerCase();
    const response = lower.includes('idea')
      ? 'Let’s give that spark a shape. Start with the outcome, name the constraint, and choose one small experiment you can finish today.'
      : lower.includes('write')
        ? 'A good first pass is ready. Tell me the audience and the feeling you want the piece to leave behind, and we can sharpen it together.'
        : 'I’m ready to work through that with you. This local preview simulates the conversation surface so you can evaluate the flow before connecting a model.';
    addMessage('assistant', response);
  }, 750);
}

function sendMessage() {
  const text = promptBox.value.trim();
  if (!text) {
    showToast('Write a message to begin');
    promptBox.focus();
    return;
  }
  if (!chatStage.classList.contains('has-messages')) {
    chatStage.classList.add('has-messages');
    starterGrid.setAttribute('aria-hidden', 'true');
    threadName.textContent = text.length > 28 ? `${text.slice(0, 28)}…` : text;
  }
  addMessage('user', text.replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char])));
  promptBox.value = '';
  resizeComposer();
  simulateResponse(text);
}

document.getElementById('newChat').addEventListener('click', () => {
  promptBox.value = '';
  conversation.innerHTML = '';
  chatStage.classList.remove('has-messages');
  starterGrid.removeAttribute('aria-hidden');
  threadName.textContent = 'Untitled conversation';
  resizeComposer();
  promptBox.focus();
  showToast('New thread ready');
});

document.querySelectorAll('.starter-card').forEach((card) => {
  card.addEventListener('click', () => {
    promptBox.value = `${card.querySelector('strong').textContent}: `;
    resizeComposer();
    promptBox.focus();
  });
});

document.getElementById('sendButton').addEventListener('click', sendMessage);
promptBox.addEventListener('input', resizeComposer);
promptBox.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
});

modelButton.addEventListener('click', (event) => {
  event.stopPropagation();
  modelMenu.classList.toggle('open');
});

document.querySelectorAll('.model-option').forEach((option) => {
  option.addEventListener('click', () => {
    const name = option.querySelector('strong').textContent;
    modelButton.innerHTML = `<span class="status-dot"></span> ${name} <span class="chevron">⌄</span>`;
    document.querySelectorAll('.model-option').forEach((item) => item.classList.remove('chosen'));
    option.classList.add('chosen');
    modelMenu.classList.remove('open');
    showToast(`${name} selected`);
  });
});

document.querySelectorAll('.nav-item').forEach((item) => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach((nav) => nav.classList.remove('active'));
    item.classList.add('active');
    showToast(`${item.textContent.trim()} is a UI preview`);
  });
});

document.addEventListener('click', () => modelMenu.classList.remove('open'));
document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    promptBox.focus();
  }
  if (event.key === 'Escape') modelMenu.classList.remove('open');
});
resizeComposer();
