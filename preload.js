const { contextBridge, ipcRenderer } = require("electron");

let pendingFiles = [];
let fileOpenedListeners = [];
let recentFilesUpdatedListeners = [];
let appBeforeCloseListeners = [];

ipcRenderer.on('file:opened', (event, fileData) => {
    console.log('[Preload] Received file:opened:', fileData?.filename);
    if (!fileData) return;

    pendingFiles.push(fileData);

    fileOpenedListeners.forEach(cb => {
        pendingFiles.forEach(file => cb(file));
    });

    pendingFiles = [];
});

ipcRenderer.on('file:recent-updated', (_event, payload) => {
    recentFilesUpdatedListeners.forEach((callback) => {
        try {
            callback(payload);
        } catch (error) {
            console.warn('[Preload] recent files listener failed:', error);
        }
    });
});

ipcRenderer.on('app:before-close', () => {
    appBeforeCloseListeners.forEach((callback) => {
        try {
            callback();
        } catch (error) {
            console.warn('[Preload] app:before-close listener failed:', error);
        }
    });
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
    getRecentFiles: () => ipcRenderer.invoke('file:getRecent'),
    openRecentFile: (filepath) => ipcRenderer.invoke('file:openRecent', filepath),
    saveFile: (filepath, content, encoding) =>
        ipcRenderer.invoke("file:save", filepath, content, encoding),
    requestSaveChoice: (context) => ipcRenderer.invoke('dialog:save-choice', context),
    saveDraft: (payload) => ipcRenderer.invoke('draft:save', payload),
    discardDraft: (filepath) => ipcRenderer.invoke('draft:discard', filepath),
    replyBeforeClose: (proceed) => ipcRenderer.invoke('app:close-response', proceed),

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
    },

    onRecentFilesUpdated: (callback) => {
        if (typeof callback !== 'function') return () => {};
        recentFilesUpdatedListeners.push(callback);
        return () => {
            recentFilesUpdatedListeners = recentFilesUpdatedListeners.filter(cb => cb !== callback);
        };
    },

    onBeforeCloseRequest: (callback) => {
        if (typeof callback !== 'function') return () => {};
        appBeforeCloseListeners.push(callback);
        return () => {
            appBeforeCloseListeners = appBeforeCloseListeners.filter(cb => cb !== callback);
        };
    },

    onUpdateStatus: (callback) => {
        if (typeof callback !== 'function') return () => {};
        const handler = (_event, payload) => callback(payload);
        ipcRenderer.on('update:status', handler);
        return () => ipcRenderer.removeListener('update:status', handler);
    },

    onUpdateProgress: (callback) => {
        if (typeof callback !== 'function') return () => {};
        const handler = (_event, payload) => callback(payload);
        ipcRenderer.on('update:download-progress', handler);
        return () => ipcRenderer.removeListener('update:download-progress', handler);
    },

    update: {
        check: () => ipcRenderer.invoke('update:check'),
        download: () => ipcRenderer.invoke('update:download'),
        install: () => ipcRenderer.invoke('update:install'),
    }
});
