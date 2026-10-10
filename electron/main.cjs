const { app, BrowserWindow, shell, ipcMain, dialog, Menu, safeStorage, Notification } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

app.enableSandbox();

const SECRET_NAME = 'forge-provider-api-key';
const MAX_TEXT_BYTES = 1024 * 1024;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

function secretPath() {
  return path.join(app.getPath('userData'), SECRET_NAME);
}

function readStoredSecret() {
  try {
    if (!safeStorage.isEncryptionAvailable()) return '';
    return safeStorage.decryptString(fs.readFileSync(secretPath()));
  } catch (_) { return ''; }
}

function validateRemoteUrl(value) {
  const url = new URL(String(value || ''));
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Use an HTTP(S) endpoint without embedded credentials');
  if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname)) throw new Error('Remote endpoints must use HTTPS; HTTP is allowed only on loopback');
  url.hash = '';
  return url;
}

function assertTrustedRenderer(event) {
  const senderUrl = event.senderFrame?.url;
  if (!senderUrl) throw new Error('Untrusted renderer');
  if (process.env.WEBSAT_DEV === '1') {
    const url = new URL(senderUrl);
    if (url.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(url.hostname) || url.port !== '5173') throw new Error('Untrusted renderer');
  } else {
    const appUrl = pathToFileURL(path.join(__dirname, '..', 'dist', 'index.html')).toString();
    if (senderUrl !== appUrl) throw new Error('Untrusted renderer');
  }
}

async function requestRemote(urlValue, options, timeoutMs) {
  const url = validateRemoteUrl(urlValue);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, redirect: 'error', signal: controller.signal });
    const text = await response.text();
    if (text.length > 10 * 1024 * 1024) throw new Error('Remote response exceeded the 10 MB safety limit');
    return {
      ok: response.ok,
      status: response.status,
      text,
      contentType: response.headers.get('content-type') || '',
      mcpSessionId: response.headers.get('Mcp-Session-Id') || ''
    };
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Remote request timed out');
    throw error;
  } finally { clearTimeout(timeout); }
}

function mimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ({
    '.txt': 'text/plain', '.md': 'text/markdown', '.json': 'application/json', '.csv': 'text/csv',
    '.js': 'text/javascript', '.ts': 'text/typescript', '.jsx': 'text/javascript', '.tsx': 'text/typescript',
    '.css': 'text/css', '.html': 'text/html', '.htm': 'text/html', '.xml': 'application/xml',
    '.yaml': 'application/yaml', '.yml': 'application/yaml', '.py': 'text/x-python', '.sql': 'application/sql',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp'
  }[ext] || 'application/octet-stream');
}

function isText(type, filePath) {
  return type.startsWith('text/') || /\.(txt|md|markdown|json|csv|js|ts|jsx|tsx|css|html|htm|xml|yaml|yml|py|sql)$/i.test(filePath);
}

function readNativeFile(filePath) {
  const stat = fs.statSync(filePath);
  const type = mimeType(filePath);
  const result = { name: path.basename(filePath), type, size: stat.size, content: '', preview: '', truncated: false };
  if (isText(type, filePath)) {
    const data = fs.readFileSync(filePath);
    result.content = data.subarray(0, MAX_TEXT_BYTES).toString('utf8');
    result.truncated = data.length > MAX_TEXT_BYTES;
  } else if (type.startsWith('image/') && stat.size <= MAX_IMAGE_BYTES) {
    result.preview = `data:${type};base64,${fs.readFileSync(filePath).toString('base64')}`;
  }
  return result;
}

function createMenu(win) {
  const send = (action) => win.webContents.send('forge-menu-action', action);
  const template = [
    { label: 'Forge', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'quit' }] },
    { label: 'File', submenu: [
      { label: 'New thread', accelerator: 'CmdOrCtrl+N', click: () => send('new-thread') },
      { label: 'Open files…', accelerator: 'CmdOrCtrl+O', click: () => send('open-files') },
      { type: 'separator' }, { role: 'close' }
    ] },
    { label: 'View', submenu: [
      { label: 'Toggle context', accelerator: 'CmdOrCtrl+I', click: () => send('context') },
      { label: 'Open Canvas', accelerator: 'CmdOrCtrl+Enter', click: () => send('canvas') },
      { label: 'Settings', click: () => send('settings') },
      { type: 'separator' }, { role: 'reload' }, { role: 'toggleDevTools' }
    ] },
    { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'front' }] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 980,
    minHeight: 700,
    backgroundColor: '#f7f4ee',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  createMenu(win);
  const isDev = process.env.WEBSAT_DEV === '1';
  const appUrl = isDev ? 'http://localhost:5173/' : pathToFileURL(path.join(__dirname, '..', 'dist', 'index.html')).toString();
  win.loadURL(appUrl);

  win.webContents.on('will-navigate', (event, navigationUrl) => {
    if (navigationUrl !== appUrl) event.preventDefault();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url === 'about:blank') {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
        }
      };
    }
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:') setImmediate(() => shell.openExternal(parsed.toString()));
    } catch (_) {}
    return { action: 'deny' };
  });
}

ipcMain.handle('forge:has-secret', (event) => {
  assertTrustedRenderer(event);
  return Boolean(readStoredSecret());
});

ipcMain.handle('forge:provider-request', async (event, request = {}) => {
  assertTrustedRenderer(event);
  const apiKey = String(request.apiKey || '').trim().slice(0, 500) || readStoredSecret();
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (apiKey) headers.Authorization = 'Bearer ' + apiKey;
  const body = { ...(request.body || {}), stream: false };
  const serialized = JSON.stringify(body);
  if (Buffer.byteLength(serialized) > 10 * 1024 * 1024) throw new Error('Provider request exceeded the 10 MB safety limit');
  return requestRemote(request.url, { method: 'POST', headers, body: serialized }, 120000);
});

ipcMain.handle('forge:mcp-request', async (event, request = {}) => {
  assertTrustedRenderer(event);
  const allowedHeaders = {};
  for (const [name, value] of Object.entries(request.headers || {})) {
    if (/^(content-type|accept|mcp-session-id|mcp-protocol-version)$/i.test(name)) allowedHeaders[name] = String(value).slice(0, 1000);
  }
  return requestRemote(request.url, {
    method: 'POST',
    headers: allowedHeaders,
    body: String(request.body || '').slice(0, 2 * 1024 * 1024)
  }, 30000);
});

ipcMain.handle('forge:set-secret', (event, value) => {
  assertTrustedRenderer(event);
  try {
    if (!safeStorage.isEncryptionAvailable()) return { stored: false, reason: 'encryption-unavailable' };
    const text = String(value || '').slice(0, 500);
    if (!text) { try { fs.unlinkSync(secretPath()); } catch (_) {} return { stored: true }; }
    fs.mkdirSync(path.dirname(secretPath()), { recursive: true });
    fs.writeFileSync(secretPath(), safeStorage.encryptString(text), { mode: 0o600 });
    return { stored: true };
  } catch (error) { return { stored: false, reason: error.message }; }
});

ipcMain.handle('forge:open-files', async (event) => {
  assertTrustedRenderer(event);
  const result = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'], title: 'Add files to Forge' });
  if (result.canceled) return [];
  return result.filePaths.map((filePath) => readNativeFile(filePath));
});

ipcMain.on('forge:notify', (_event, title, body) => {
  if (Notification.isSupported()) new Notification({ title: String(title || 'Forge'), body: String(body || '') }).show();
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
