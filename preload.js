const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
    fullscreen: () => ipcRenderer.invoke("window:fullscreen"),
    minimize: () => ipcRenderer.invoke("window:minimize"),
    maximize: () => ipcRenderer.invoke("window:maximize"),
    close: () => ipcRenderer.invoke("window:close"),
    openFile: () => ipcRenderer.invoke("file:open"),
});
