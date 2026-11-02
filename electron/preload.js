const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('havenNative', {
  listModels: () => ipcRenderer.invoke('models:list'),
  importModels: () => ipcRenderer.invoke('models:import'),
  deleteModel: (id) => ipcRenderer.invoke('models:delete', id),
  storeGet: (key) => ipcRenderer.invoke('store:get', key),
  storeSet: (key, value) => ipcRenderer.invoke('store:set', key, value),
  saveText: (name, text) => ipcRenderer.invoke('file:saveText', name, text),
  quit: () => ipcRenderer.invoke('app:quit'),
  toggleFullscreen: () => ipcRenderer.invoke('app:fullscreen'),
});
