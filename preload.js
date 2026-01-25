const { contextBridge, ipcRenderer } = require("electron");

let pendingFiles = [];
let fileOpenedListeners = [];

ipcRenderer.on('file:opened', (event, fileData) => {
    console.log('[Preload] Received file:opened:', fileData?.filename);
    if (!fileData) return;

    pendingFiles.push(fileData);

    fileOpenedListeners.forEach(cb => {
        pendingFiles.forEach(file => cb(file));
    });

    pendingFiles = [];
});

contextBridge.exposeInMainWorld("electronAPI", {
    fullscreen: () => ipcRenderer.invoke("window:fullscreen"),
    minimize: () => ipcRenderer.invoke("window:minimize"),
    maximize: () => ipcRenderer.invoke("window:maximize"),
    close: () => ipcRenderer.invoke("window:close"),
    print: (options) => ipcRenderer.invoke("window:print", options),
    getPrinters: () => ipcRenderer.invoke('print:getPrinters'),
    printImages: (images, options) => ipcRenderer.invoke('print:printImages', { images, options }),
    openFile: () => ipcRenderer.invoke("file:open"),
    saveFile: (filepath, content, encoding) =>
        ipcRenderer.invoke("file:save", filepath, content, encoding),

    // Store API
    store: {
        get: (key) => ipcRenderer.invoke("store:get", key),
        set: (key, value) => ipcRenderer.invoke("store:set", key, value),
        getAll: () => ipcRenderer.invoke("store:getAll"),
        delete: (key) => ipcRenderer.invoke("store:delete", key),
        clear: () => ipcRenderer.invoke("store:clear")
    },

    onFileOpened: (callback) => {
        console.log('[Preload] onFileOpened registered');
        fileOpenedListeners.push(callback);

        // Flush pending files
        pendingFiles.forEach(file => callback(file));
        pendingFiles = [];

        // Return unsubscribe
        return () => {
            fileOpenedListeners = fileOpenedListeners.filter(cb => cb !== callback);
        };
    }
});
