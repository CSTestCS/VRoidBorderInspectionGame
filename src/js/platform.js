// Abstraction over Electron (native file import + userData storage) and a
// plain browser fallback (IndexedDB + localStorage), so the game runs in both.
const native = window.havenNative || null;
export const isNative = !!native;

export const BUILTIN_MODELS = [
  { id: 'YoungFemaleCitizen', name: 'Young Female Citizen', url: '../assets/models/YoungFemaleCitizen.vrm', builtin: true },
  { id: 'YoungMaleCitizen', name: 'Young Male Citizen', url: '../assets/models/YoungMaleCitizen.vrm', builtin: true },
  { id: 'OldFemaleCitizen', name: 'Old Female Citizen', url: '../assets/models/OldFemaleCitizen.vrm', builtin: true },
  { id: 'OldMaleCitizen', name: 'Old Male Citizen', url: '../assets/models/OldMaleCitizen.vrm', builtin: true },
];

// ---- IndexedDB (browser fallback for imported models) ----------------------
function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('haven-checkpoint', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('models', { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbAll() {
  const db = await idb();
  return new Promise((res) => {
    const q = db.transaction('models').objectStore('models').getAll();
    q.onsuccess = () => res(q.result || []);
    q.onerror = () => res([]);
  });
}
async function idbPut(v) {
  const db = await idb();
  return new Promise((res) => { const t = db.transaction('models', 'readwrite'); t.objectStore('models').put(v); t.oncomplete = () => res(); });
}
async function idbDel(id) {
  const db = await idb();
  return new Promise((res) => { const t = db.transaction('models', 'readwrite'); t.objectStore('models').delete(id); t.oncomplete = () => res(); });
}

const blobUrls = new Map();
export async function listUserModels() {
  if (native) return (await native.listModels()).map((m) => ({ ...m, builtin: false }));
  try {
    return (await idbAll()).map((m) => {
      if (!blobUrls.has(m.id)) blobUrls.set(m.id, URL.createObjectURL(m.blob));
      return { id: m.id, name: m.name, url: blobUrls.get(m.id), builtin: false };
    });
  } catch { return []; }
}

export async function listAllModels() {
  return [...BUILTIN_MODELS, ...(await listUserModels())];
}

export async function importModels() {
  if (native) return native.importModels();
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.vrm';
    inp.multiple = true;
    inp.onchange = async () => {
      const added = [];
      for (const f of inp.files) {
        const id = 'user_' + f.name.replace(/\W+/g, '_') + '_' + Date.now().toString(36);
        await idbPut({ id, name: f.name.replace(/\.vrm$/i, ''), blob: f });
        added.push({ id, name: f.name });
      }
      resolve(added);
    };
    inp.click();
  });
}

export async function deleteModel(id) {
  if (native) return native.deleteModel(id);
  return idbDel(id);
}

export async function storeGet(key) {
  if (native) return native.storeGet(key);
  try { return JSON.parse(localStorage.getItem('haven:' + key)); } catch { return null; }
}
export async function storeSet(key, value) {
  if (native) return native.storeSet(key, value);
  try { localStorage.setItem('haven:' + key, JSON.stringify(value)); } catch {}
}
export function quit() { if (native) native.quit(); else window.close(); }
export function toggleFullscreen() {
  if (native) return native.toggleFullscreen();
  if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.();
}
