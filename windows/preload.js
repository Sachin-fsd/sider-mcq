const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    saveApiKey: (apiKey) => ipcRenderer.invoke('save-api-key', apiKey),
    saveApiKeys: (apiKeys) => ipcRenderer.invoke('save-api-keys', apiKeys),
    getApiKey: () => ipcRenderer.invoke('get-api-key'),
    getApiKeys: () => ipcRenderer.invoke('get-api-keys'),
    getSettings: () => ipcRenderer.invoke('get-settings'),
    saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
    onProcessingStatus: (callback) => ipcRenderer.on('processing-status', (event, data) => callback(data)),
    onAnswerResult: (callback) => ipcRenderer.on('answer-result', (event, data) => callback(data)),
    onShowSettings: (callback) => ipcRenderer.on('show-settings', () => callback()),
});