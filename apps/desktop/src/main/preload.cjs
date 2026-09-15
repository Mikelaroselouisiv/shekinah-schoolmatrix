const { contextBridge, ipcRenderer } = require('electron');

const edition = ipcRenderer.sendSync('app:get-edition-sync');
const apiBase = ipcRenderer.sendSync('app:get-api-base-sync');

contextBridge.exposeInMainWorld('schoolmatrixDesktop', {
  edition,
  apiBase,
  /** Télécharge une image (GCS / API) depuis le process principal — sans CORS. */
  fetchMedia: (url) => ipcRenderer.invoke('app:fetch-media', url),
  confirmSync: (message) => ipcRenderer.sendSync('app:confirm-sync', message),
  alertSync: (message) => ipcRenderer.sendSync('app:alert-sync', message),
  restoreKeyboardFocus: () => ipcRenderer.sendSync('app:restore-keyboard-focus'),
  updater: {
    getState: () => ipcRenderer.invoke('updater:get-state'),
    check: () => ipcRenderer.invoke('updater:check'),
    download: () => ipcRenderer.invoke('updater:download'),
    install: () => ipcRenderer.invoke('updater:install'),
    snooze: (optionKey) => ipcRenderer.invoke('updater:snooze', optionKey),
    dismiss: () => ipcRenderer.invoke('updater:dismiss'),
    getSnoozeOptions: () => ipcRenderer.invoke('updater:get-snooze-options'),
    onState: (handler) => {
      const listener = (_event, state) => handler(state);
      ipcRenderer.on('updater:state', listener);
      return () => ipcRenderer.removeListener('updater:state', listener);
    },
    onOpenPrompt: (handler) => {
      const listener = (_event, payload) => handler(payload);
      ipcRenderer.on('updater:open-prompt', listener);
      return () => ipcRenderer.removeListener('updater:open-prompt', listener);
    },
    onMenuCheck: (handler) => {
      const listener = () => handler();
      ipcRenderer.on('updater:menu-check', listener);
      return () => ipcRenderer.removeListener('updater:menu-check', listener);
    },
  },
});
