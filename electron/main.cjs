const { app, BrowserWindow, shell, ipcMain, dialog, Menu, safeStorage, Notification } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const SECRET_NAME = 'forge-provider-api-key';
const MAX_TEXT_BYTES = 1024 * 1024;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

function secretPath() {
  return path.join(app.getPath('userData'), SECRET_NAME);
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
  if (process.env.WEBSAT_DEV === '1') win.loadURL('http://localhost:5173');
  else win.loadURL(pathToFileURL(path.join(__dirname, '..', 'dist', 'index.html')).toString());

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

ipcMain.handle('forge:get-secret', () => {
  try {
    if (!safeStorage.isEncryptionAvailable()) return '';
    const encrypted = fs.readFileSync(secretPath());
    return safeStorage.decryptString(encrypted);
  } catch (_) { return ''; }
});

ipcMain.handle('forge:set-secret', (_event, value) => {
  try {
    if (!safeStorage.isEncryptionAvailable()) return { stored: false, reason: 'encryption-unavailable' };
    const text = String(value || '').slice(0, 500);
    if (!text) { try { fs.unlinkSync(secretPath()); } catch (_) {} return { stored: true }; }
    fs.mkdirSync(path.dirname(secretPath()), { recursive: true });
    fs.writeFileSync(secretPath(), safeStorage.encryptString(text), { mode: 0o600 });
    return { stored: true };
  } catch (error) { return { stored: false, reason: error.message }; }
});

ipcMain.handle('forge:open-files', async () => {
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
