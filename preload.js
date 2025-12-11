const { contextBridge, ipcRenderer } = require("electron");

// Store file data if received before listener is attached
let pendingFileData = null;
let fileOpenedListeners = [];

// Set up listener immediately on preload
ipcRenderer.on('file:opened', (event, fileData) => {
    console.log('[Preload] Received file:opened event:', fileData?.filename);
    if (fileData) {
        pendingFileData = fileData;
        // Notify all registered listeners
        fileOpenedListeners.forEach(callback => callback(fileData));
    }
});

contextBridge.exposeInMainWorld("electronAPI", {
    fullscreen: () => ipcRenderer.invoke("window:fullscreen"),
    minimize: () => ipcRenderer.invoke("window:minimize"),
    maximize: () => ipcRenderer.invoke("window:maximize"),
    close: () => ipcRenderer.invoke("window:close"),
    openFile: () => ipcRenderer.invoke("file:open"),
    saveFile: (filepath, content, encoding) => ipcRenderer.invoke("file:save", filepath, content, encoding),
    onFileOpened: (callback) => {
        console.log('[Preload] onFileOpened callback registered');
        fileOpenedListeners.push(callback);
        // If file data was already received, call the callback immediately
        if (pendingFileData) {
            console.log('[Preload] Calling callback with pending file data:', pendingFileData.filename);
            callback(pendingFileData);
            pendingFileData = null; // Clear after use
        }
    }
});
