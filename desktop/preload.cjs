const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('teacherConnection', {
  read: () => ipcRenderer.invoke('teacher:connection'),
  connect: address => ipcRenderer.invoke('teacher:connect', address),
});
