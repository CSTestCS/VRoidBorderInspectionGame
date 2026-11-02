// Electron entry point. Serves the game through a privileged app:// scheme so
// that fetch(), ES modules and canvas pixel access all work like a website.
const { app, BrowserWindow, protocol, net, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

const ROOT = path.join(__dirname, '..');
const userDir = () => app.getPath('userData');
function userModelsDir() {
  const d = path.join(userDir(), 'models');
  fs.mkdirSync(d, { recursive: true });
  return d;
}
function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJSON(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
const indexFile = () => path.join(userModelsDir(), 'index.json');

function listUserModels() {
  const idx = readJSON(indexFile(), []);
  return idx.filter((m) => fs.existsSync(path.join(userModelsDir(), m.file)));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#050607',
    title: 'Haven Checkpoint',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadURL('app://bundle/src/index.html');
  if (process.env.HAVEN_DEBUG) {
    // headless smoke testing: mirror renderer console to stdout and quit after a while
    win.webContents.on('console-message', (e) => console.log('[renderer]', e.message || e));
    setTimeout(async () => {
      const r = await win.webContents.executeJavaScript('JSON.stringify({menu: !!document.querySelector(".menu"), models: window.havenApp?.models?.length, err: document.querySelector("#loading-text")?.textContent})').catch((x) => String(x));
      console.log('[smoke]', r);
      app.quit();
    }, Number(process.env.HAVEN_DEBUG) || 60000);
  }
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    if (input.type === 'keyDown' && input.key === 'F12') { win.webContents.toggleDevTools(); e.preventDefault(); }
    if (input.type === 'keyDown' && (input.control || input.meta) && !input.alt && input.key !== 'F11' && input.key !== 'F12') {
      // let the page see the key, but never let Chromium act on Ctrl shortcuts
      if (/^[a-z0-9=+\-]$/i.test(input.key) && !['c', 'v', 'x', 'a', 'z'].includes(input.key.toLowerCase())) e.preventDefault();
    }
  });
}

app.whenReady().then(() => {
  // no application menu: its hidden accelerators (Ctrl+W close, Ctrl+R reload, Ctrl+zoom...)
  // fire while the player holds Ctrl to crouch
  Menu.setApplicationMenu(null);
  protocol.handle('app', (req) => {
    const u = new URL(req.url);
    const base = u.host === 'user' ? userDir() : ROOT;
    const full = path.normalize(path.join(base, decodeURIComponent(u.pathname)));
    if (!full.startsWith(path.normalize(base))) return new Response('forbidden', { status: 403 });
    return net.fetch(pathToFileURL(full).toString());
  });

  ipcMain.handle('models:list', () => listUserModels().map((m) => ({ ...m, url: `app://user/models/${encodeURIComponent(m.file)}` })));
  ipcMain.handle('models:import', async () => {
    const r = await dialog.showOpenDialog({ title: 'Import VRoid model', filters: [{ name: 'VRM model', extensions: ['vrm'] }], properties: ['openFile', 'multiSelections'] });
    if (r.canceled) return [];
    const idx = readJSON(indexFile(), []);
    const added = [];
    for (const src of r.filePaths) {
      const base = path.basename(src, path.extname(src)).replace(/[^\w\-]+/g, '_');
      const id = `user_${base}_${Date.now().toString(36)}`;
      const file = `${id}.vrm`;
      fs.copyFileSync(src, path.join(userModelsDir(), file));
      const entry = { id, file, name: path.basename(src, path.extname(src)) };
      idx.push(entry);
      added.push({ ...entry, url: `app://user/models/${encodeURIComponent(file)}` });
    }
    writeJSON(indexFile(), idx);
    return added;
  });
  ipcMain.handle('models:delete', (e, id) => {
    const idx = readJSON(indexFile(), []);
    const m = idx.find((x) => x.id === id);
    if (m) { try { fs.unlinkSync(path.join(userModelsDir(), m.file)); } catch {} }
    writeJSON(indexFile(), idx.filter((x) => x.id !== id));
    return true;
  });
  ipcMain.handle('store:get', (e, key) => readJSON(path.join(userDir(), `${key}.json`), null));
  ipcMain.handle('store:set', (e, key, value) => { writeJSON(path.join(userDir(), `${key}.json`), value); return true; });
  ipcMain.handle('file:saveText', async (e, name, text) => {
    const w = BrowserWindow.fromWebContents(e.sender);
    const r = await dialog.showSaveDialog(w, { defaultPath: path.join(app.getPath('documents'), name), filters: [{ name: 'JSON', extensions: ['json'] }] });
    if (r.canceled || !r.filePath) return null;
    fs.writeFileSync(r.filePath, text, 'utf8');
    return r.filePath;
  });
  ipcMain.handle('app:quit', () => app.quit());
  ipcMain.handle('app:fullscreen', (e) => { const w = BrowserWindow.fromWebContents(e.sender); w.setFullScreen(!w.isFullScreen()); });

  createWindow();
});

app.on('window-all-closed', () => app.quit());
