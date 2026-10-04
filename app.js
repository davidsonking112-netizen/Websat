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

function showToast(message){toast.textContent=message;toast.classList.add('show');clearTimeout(window.__toastTimer);window.__toastTimer=setTimeout(()=>toast.classList.remove('show'),2200)}
function resizeComposer(){promptBox.style.height='auto';promptBox.style.height=`${Math.min(promptBox.scrollHeight,140)}px`}
function toggleContext(force){contextDrawer.classList.toggle('open',force ?? !contextDrawer.classList.contains('open'))}
function addMessage(kind,content,label){const message=document.createElement('div');message.className=`message ${kind}`;message.innerHTML=kind==='user'?`<div class="message-avatar user">DK</div><div class="message-body">${content}</div>`:`<div class="message-avatar forge">✦</div><div class="message-body"><div class="message-label">${label||'Forge Local'}</div>${content}</div>`;conversation.appendChild(message);conversation.scrollIntoView({behavior:'smooth',block:'end'})}
function simulateResponse(text){const typing=document.createElement('div');typing.className='message assistant';typing.innerHTML='<div class="message-avatar forge">✦</div><div class="message-body"><div class="message-label">Forge Local</div><span class="typing-dots"><i></i><i></i><i></i></span></div>';conversation.appendChild(typing);setTimeout(()=>{typing.remove();const lower=text.toLowerCase();const response=lower.includes('canvas')||lower.includes('draft')?'I’ve opened a focused work surface for this. We can keep the conversation on the left and shape the actual draft on the right — without losing the decisions we make here.':lower.includes('idea')||lower.includes('plan')?'Let’s give that spark a shape. Start with the outcome, name the constraint, and choose one small experiment you can finish today. I’ll keep the working context attached.':'I’m ready to work through that with you. This local preview simulates the complete flow so you can evaluate the product experience before connecting a model.';addMessage('assistant',response)},750)}
function sendMessage(){const text=promptBox.value.trim();if(!text){showToast('Write a message to begin');promptBox.focus();return}if(!chatStage.classList.contains('has-messages')){chatStage.classList.add('has-messages');starterGrid.setAttribute('aria-hidden','true');threadName.textContent=text.length>28?`${text.slice(0,28)}…`:text}addMessage('user',text.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])));promptBox.value='';resizeComposer();simulateResponse(text)}
function openPalette(){commandPalette.classList.add('open');paletteInput.value='';setTimeout(()=>paletteInput.focus(),50)}
function closePalette(){commandPalette.classList.remove('open')}

document.getElementById('newChat').addEventListener('click',()=>{promptBox.value='';conversation.innerHTML='';chatStage.classList.remove('has-messages');starterGrid.removeAttribute('aria-hidden');threadName.textContent='Untitled conversation';resizeComposer();promptBox.focus();showToast('New thread ready')});
document.querySelectorAll('.starter-card').forEach(card=>card.addEventListener('click',()=>{promptBox.value=card.querySelector('strong').textContent+': ';resizeComposer();promptBox.focus()}));
document.getElementById('sendButton').addEventListener('click',sendMessage);
promptBox.addEventListener('input',resizeComposer);promptBox.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage()}});
document.getElementById('contextToggle').addEventListener('click',()=>toggleContext());document.getElementById('closeContext').addEventListener('click',()=>toggleContext(false));document.getElementById('addContext').addEventListener('click',()=>showToast('Context picker is ready for local files'));
document.getElementById('attachButton').addEventListener('click',()=>{toggleContext(true);showToast('Choose context from this thread')});
document.getElementById('canvasMode').addEventListener('click',()=>{promptBox.value='Open a canvas for ';resizeComposer();promptBox.focus();showToast('Canvas mode selected')});
document.getElementById('searchButton').addEventListener('click',openPalette);
modelButton.addEventListener('click',e=>{e.stopPropagation();modelMenu.classList.toggle('open')});document.querySelectorAll('.model-option').forEach(option=>option.addEventListener('click',()=>{const name=option.querySelector('strong').textContent;modelButton.innerHTML=`<span class="status-dot"></span> ${name} <span class="chevron">⌄</span>`;document.querySelectorAll('.model-option').forEach(item=>item.classList.remove('chosen'));option.classList.add('chosen');modelMenu.classList.remove('open');showToast(`${name} selected`)}));
document.querySelectorAll('.nav-item').forEach(item=>item.addEventListener('click',()=>{document.querySelectorAll('.nav-item').forEach(nav=>nav.classList.remove('active'));item.classList.add('active');showToast(`${item.textContent.trim()} is ready for your workspace`)}));
document.querySelectorAll('[data-action]').forEach(item=>item.addEventListener('click',()=>{const action=item.dataset.action;closePalette();if(action==='new')document.getElementById('newChat').click();if(action==='context')toggleContext(true);if(action==='canvas')document.getElementById('canvasMode').click()}));
commandPalette.addEventListener('click',e=>{if(e.target===commandPalette)closePalette()});document.addEventListener('click',()=>modelMenu.classList.remove('open'));document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();document.getElementById('newChat').click()}if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='i'){e.preventDefault();toggleContext()}if((e.metaKey||e.ctrlKey)&&e.key==='Enter'){e.preventDefault();document.getElementById('canvasMode').click()}if(e.key==='Escape'){closePalette();modelMenu.classList.remove('open');toggleContext(false)}});resizeComposer();
