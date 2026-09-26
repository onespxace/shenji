const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('auditdesk', {
  readWorkspace: () => ipcRenderer.invoke('workspace:read'),
  writeWorkspace: (workspace) => ipcRenderer.invoke('workspace:write', workspace),
  readSettings: () => ipcRenderer.invoke('settings:read'),
  writeSettings: (settings) => ipcRenderer.invoke('settings:write', settings),
  openDataFile: () => ipcRenderer.invoke('file:open'),
  extractDocument: (filePath) => ipcRenderer.invoke('document:extract', filePath),
  saveFile: (payload) => ipcRenderer.invoke('file:save', payload),
  listKnowledge: () => ipcRenderer.invoke('knowledge:list'),
  readKnowledge: (relative) => ipcRenderer.invoke('knowledge:read', relative),
  openExternal: (url) => ipcRenderer.invoke('external:open', url),
  openPath: (target) => ipcRenderer.invoke('shell:open-path', target),
  askApi: (payload) => ipcRenderer.invoke('api:ask', payload),
  listVendors: () => ipcRenderer.invoke('vendor:list'),
  queryDuckDb: (payload) => ipcRenderer.invoke('duckdb:query', payload),
  appInfo: () => ipcRenderer.invoke('app:info')
});
