const toast = document.getElementById('toast');
const promptBox = document.getElementById('prompt');
const modelButton = document.getElementById('modelButton');
const modelMenu = document.getElementById('modelMenu');

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(window.__toastTimer);
  window.__toastTimer = window.setTimeout(() => toast.classList.remove('show'), 2200);
}

document.getElementById('newChat').addEventListener('click', () => {
  promptBox.value = '';
  promptBox.focus();
  showToast('New thread ready');
});

document.querySelectorAll('.starter-card').forEach((card) => {
  card.addEventListener('click', () => {
    promptBox.value = card.querySelector('strong').textContent + ': ';
    promptBox.focus();
  });
});

document.getElementById('sendButton').addEventListener('click', () => {
  if (!promptBox.value.trim()) {
    showToast('Write a message to begin');
    promptBox.focus();
    return;
  }
  showToast('UI preview only — no model connected');
});

modelButton.addEventListener('click', (event) => {
  event.stopPropagation();
  modelMenu.classList.toggle('open');
});

document.querySelectorAll('.model-option').forEach((option) => {
  option.addEventListener('click', () => {
    const name = option.querySelector('strong').textContent;
    modelButton.innerHTML = `<span class="status-dot"></span> ${name} <span class="chevron">⌄</span>`;
    modelMenu.classList.remove('open');
    showToast(`${name} selected`);
  });
});

document.addEventListener('click', () => modelMenu.classList.remove('open'));
document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    promptBox.focus();
  }
});
