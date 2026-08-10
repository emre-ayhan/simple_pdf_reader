import { app, BrowserWindow, ipcMain, dialog } from "electron";
import pkg from "electron-updater";
const { autoUpdater } = pkg;
import Store from "electron-store";
import fs from "fs";
import { randomUUID, createHash } from 'crypto';
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const READER_ID_KEY = 'simple_pdf_reader_id';
const RECENT_FILES_BY_ID_KEY = 'recentFilesByReaderId';
const DRAFTS_BY_READER_KEY = 'draftsByReaderId';
const DRAFTS_DIR_NAME = 'drafts';
const MAX_RECENT_FILES = 5;

if (!app.isPackaged) {
    const devUserDataPath = join(app.getPath('appData'), 'simple_pdf_reader_dev');
    const devSessionPath = join(devUserDataPath, 'session');
    const devCachePath = join(devUserDataPath, 'cache');

    if (!fs.existsSync(devSessionPath)) {
        fs.mkdirSync(devSessionPath, { recursive: true });
    }

    if (!fs.existsSync(devCachePath)) {
        fs.mkdirSync(devCachePath, { recursive: true });
    }

    app.setPath('userData', devUserDataPath);
    app.setPath('sessionData', devSessionPath);
    app.commandLine.appendSwitch('disk-cache-dir', devCachePath);
    app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
}

// Initialize electron-store with schema
const store = new Store({
    schema: {
        pageIndex: { type: 'number', default: 0 },
        enableTouchDrawing: { type: 'boolean', default: false },
        zoom: { type: 'number', default: 100 },
        zoomMode: { type: 'string', default: 'fit-width' },
        lastFilePath: { type: 'string', default: '' },
        lastFileName: { type: 'string', default: '' },
        fileStates: { type: 'object', default: {} },
        [READER_ID_KEY]: { type: 'string', default: '' },
        [RECENT_FILES_BY_ID_KEY]: { type: 'object', default: {} },
        [DRAFTS_BY_READER_KEY]: { type: 'object', default: {} }
    },
    clearInvalidConfig: true
});

function getOrCreateReaderId() {
    const existingId = store.get(READER_ID_KEY);
    if (typeof existingId === 'string' && existingId.trim().length > 0) {
        return existingId;
    }

    const newId = randomUUID();
    store.set(READER_ID_KEY, newId);
    return newId;
}

function getRecentFiles(readerId = getOrCreateReaderId()) {
    const byId = store.get(RECENT_FILES_BY_ID_KEY) || {};
    const recentFiles = byId?.[readerId];
    return Array.isArray(recentFiles) ? recentFiles : [];
}

function getDraftDirPath() {
    const dir = join(app.getPath('userData'), DRAFTS_DIR_NAME);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
}

function getDraftFileKey(filepath) {
    return createHash('sha256').update(String(filepath || '').toLowerCase()).digest('hex');
}

function getDraftsByReader(readerId = getOrCreateReaderId()) {
    const byReader = store.get(DRAFTS_BY_READER_KEY) || {};
    const drafts = byReader?.[readerId];
    return drafts && typeof drafts === 'object' ? drafts : {};
}

function setDraftsByReader(drafts, readerId = getOrCreateReaderId()) {
    const byReader = store.get(DRAFTS_BY_READER_KEY) || {};
    store.set(DRAFTS_BY_READER_KEY, {
        ...byReader,
        [readerId]: drafts,
    });
}

function getDraftRecord(filepath, readerId = getOrCreateReaderId()) {
    if (!filepath) return null;
    const drafts = getDraftsByReader(readerId);
    return drafts[getDraftFileKey(filepath)] || null;
}

function saveDraftForFile(filepath, draftPatch) {
    const resolvedFilepath = filepath || draftPatch?.filepath;
    if (!resolvedFilepath || typeof resolvedFilepath !== 'string') {
        throw new Error('Invalid draft save payload: missing filepath');
    }

    if (!draftPatch || typeof draftPatch !== 'object') {
        throw new Error('Invalid draft save payload: missing draftPatch object');
    }

    const readerId = getOrCreateReaderId();
    const fileKey = getDraftFileKey(resolvedFilepath);
    const draftPath = join(getDraftDirPath(), `${readerId}-${fileKey}.json`);
    const updatedAt = Date.now();

    const payload = {
        version: 2,
        updatedAt,
        source: {
            filepath: resolvedFilepath,
            filename: draftPatch.filename || resolvedFilepath.split(/[/\\]/).pop() || 'document.pdf',
        },
        draftPatch,
    };

    fs.writeFileSync(draftPath, JSON.stringify(payload), 'utf-8');

    const drafts = getDraftsByReader(readerId);
    drafts[fileKey] = {
        filepath: resolvedFilepath,
        filename: payload.source.filename,
        draftPath,
        updatedAt,
    };
    setDraftsByReader(drafts, readerId);

    return drafts[fileKey];
}

function discardDraftForFile(filepath) {
    if (!filepath) return false;

    const readerId = getOrCreateReaderId();
    const drafts = getDraftsByReader(readerId);
    const fileKey = getDraftFileKey(filepath);
    const record = drafts[fileKey];

    if (record?.draftPath && fs.existsSync(record.draftPath)) {
        try {
            fs.unlinkSync(record.draftPath);
        } catch (error) {
            console.warn('[Main] Failed to delete draft file:', error);
        }
    }

    if (drafts[fileKey]) {
        delete drafts[fileKey];
        setDraftsByReader(drafts, readerId);
        return true;
    }

    return false;
}

function loadDraftForFile(filepath) {
    const record = getDraftRecord(filepath);
    if (!record?.draftPath) return null;

    if (!fs.existsSync(record.draftPath)) {
        discardDraftForFile(filepath);
        return null;
    }

    try {
        const raw = fs.readFileSync(record.draftPath, 'utf-8');
        const parsed = JSON.parse(raw);

        // New format: delta-only patch payload.
        if (parsed?.draftPatch && typeof parsed.draftPatch === 'object') {
            return {
                kind: 'patch',
                patch: parsed.draftPatch,
                filepath,
                filename: parsed?.source?.filename || filepath.split(/[/\\]/).pop() || 'document.pdf',
            };
        }

        // Legacy format: full serialized file payload.
        const data = parsed?.fileData;
        if (data && typeof data === 'object') {
            return {
                kind: 'legacy-file',
                fileData: {
                    ...data,
                    filepath,
                    filename: data.filename || filepath.split(/[/\\]/).pop() || 'document.pdf',
                },
                filepath,
                filename: data.filename || filepath.split(/[/\\]/).pop() || 'document.pdf',
            };
        }

        discardDraftForFile(filepath);
        return null;
    } catch (error) {
        console.warn('[Main] Failed to load draft file:', error);
        discardDraftForFile(filepath);
        return null;
    }
}

function resolveOpenFileData(filepath) {
    const filename = filepath.split(/[/\\]/).pop();
    const ext = filename.toLowerCase().split('.').pop();

    if (ext === 'pdf') {
        const buffer = fs.readFileSync(filepath);
        return {
            filepath,
            filename,
            content: buffer.toString('base64'),
            type: 'pdf',
            encoding: 'base64'
        };
    }

    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) {
        const buffer = fs.readFileSync(filepath);
        const mimeTypes = {
            'png': 'image/png',
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'gif': 'image/gif',
            'webp': 'image/webp',
            'bmp': 'image/bmp',
            'svg': 'image/svg+xml'
        };
        return {
            filepath,
            filename,
            content: buffer.toString('base64'),
            type: 'image',
            mimeType: mimeTypes[ext] || 'image/png',
            encoding: 'base64'
        };
    }

    return {
        filepath,
        filename,
        content: fs.readFileSync(filepath, 'utf-8'),
        type: 'text'
    };
}

function maybeResolveDraftForOpen(filepath) {
    const draft = loadDraftForFile(filepath);
    if (!draft) return null;

    if (draft.kind === 'legacy-file') {
        return draft.fileData;
    }

    if (draft.kind === 'patch') {
        const baseFileData = resolveOpenFileData(filepath);
        if (baseFileData?.type === 'pdf') {
            return {
                ...baseFileData,
                draftPatch: draft.patch,
                draftMeta: {
                    source: 'delta-patch',
                },
            };
        }

        return baseFileData;
    }

    return null;
}

function rememberRecentFile(filepath) {
    if (!filepath || typeof filepath !== 'string') return;

    const readerId = getOrCreateReaderId();
    const filename = filepath.split(/[/\\]/).pop();
    const byId = store.get(RECENT_FILES_BY_ID_KEY) || {};
    const currentRecentFiles = Array.isArray(byId?.[readerId]) ? byId[readerId] : [];

    const nextRecentFiles = [
        {
            id: readerId,
            filename,
            filepath,
            openedAt: Date.now(),
        },
        ...currentRecentFiles.filter((item) => item && item.filepath !== filepath),
    ].slice(0, MAX_RECENT_FILES);

    store.set(RECENT_FILES_BY_ID_KEY, {
        ...byId,
        [readerId]: nextRecentFiles,
    });

    try {
        if (win && !win.isDestroyed()) {
            win.webContents.send('file:recent-updated', {
                id: readerId,
                recentFiles: nextRecentFiles,
            });
        }
    } catch (error) {
        console.warn('[Main] Failed to send file:recent-updated:', error);
    }
}

getOrCreateReaderId();

let win;
let pendingFilePath = null;

let autoUpdaterInitialized = false;
let lastUpdateInfo = null;
let updateDownloaded = false;
let updateDownloadInProgress = false;
let closeRequestPending = false;
let forceClosingWindow = false;

function sendUpdateStatus(payload) {
    try {
        if (win && !win.isDestroyed()) {
            win.webContents.send('update:status', payload);
        }
    } catch (error) {
        console.warn('[Main] Failed to send update:status:', error);
    }
}

function sendUpdateProgress(payload) {
    try {
        if (win && !win.isDestroyed()) {
            win.webContents.send('update:download-progress', payload);
        }
    } catch (error) {
        console.warn('[Main] Failed to send update:download-progress:', error);
    }
}

function setTaskbarProgress(percent) {
    if (!win || win.isDestroyed()) return;
    const value = typeof percent === 'number' && Number.isFinite(percent) ? percent : -1;
    if (value < 0) {
        win.setProgressBar(-1);
        return;
    }
    win.setProgressBar(Math.max(0, Math.min(1, value / 100)));
}

function setupAutoUpdater() {
    if (!app.isPackaged) return;
    if (autoUpdaterInitialized) return;
    autoUpdaterInitialized = true;

    autoUpdater.autoDownload = false;

    autoUpdater.on('checking-for-update', () => {
        sendUpdateStatus({ state: 'checking' });
    });

    autoUpdater.on('update-available', async (info) => {
        lastUpdateInfo = info || null;
        updateDownloaded = false;
        sendUpdateStatus({ state: 'available', info });

        const result = await dialog.showMessageBox(win, {
            type: 'info',
            buttons: ['Download', 'Later'],
            defaultId: 0,
            cancelId: 1,
            title: 'Update available',
            message: 'A new version of Simple PDF Reader is available.',
            detail: info?.version ? `Version ${info.version} is available. Do you want to download it now?` : 'Do you want to download it now?',
        });

        if (result.response !== 0) {
            sendUpdateStatus({ state: 'deferred', info });
            return;
        }

        try {
            updateDownloadInProgress = true;
            sendUpdateStatus({ state: 'downloading', info });
            setTaskbarProgress(0);
            await autoUpdater.downloadUpdate();
        } catch (error) {
            console.error('[Main] downloadUpdate failed:', error);
            sendUpdateStatus({ state: 'error', error: String(error?.message || error) });
            setTaskbarProgress(-1);
        } finally {
            updateDownloadInProgress = false;
        }
    });

    autoUpdater.on('update-not-available', (info) => {
        lastUpdateInfo = info || null;
        updateDownloaded = false;
        sendUpdateStatus({ state: 'not-available', info });
    });

    autoUpdater.on('download-progress', (progressObj) => {
        // progressObj: { percent, bytesPerSecond, transferred, total }
        sendUpdateProgress(progressObj);
        if (typeof progressObj?.percent === 'number') {
            setTaskbarProgress(progressObj.percent);
        }
    });

    autoUpdater.on('update-downloaded', async (info) => {
        lastUpdateInfo = info || lastUpdateInfo;
        updateDownloaded = true;
        updateDownloadInProgress = false;
        sendUpdateStatus({ state: 'downloaded', info });
        setTaskbarProgress(-1);

        const result = await dialog.showMessageBox(win, {
            type: 'question',
            buttons: ['Install and Restart', 'Later'],
            defaultId: 0,
            cancelId: 1,
            title: 'Update ready',
            message: 'Update downloaded.',
            detail: 'The update has been downloaded. Install now to restart and apply it?',
        });

        if (result.response === 0) {
            autoUpdater.quitAndInstall();
        }
    });

    autoUpdater.on('error', (err) => {
        console.error('[Main] autoUpdater error:', err);
        updateDownloadInProgress = false;
        sendUpdateStatus({ state: 'error', error: String(err?.message || err) });
        setTaskbarProgress(-1);
    });
}

// Check for file argument passed on command line (Linux)
function getFileFromArgs() {
    console.log('[Main] process.argv:', process.argv);
    
    // Skip the first two arguments (node executable and script path)
    for (let i = 1; i < process.argv.length; i++) {
        const arg = process.argv[i];
        
        // Skip Electron-specific arguments
        if (arg.startsWith('--') || arg === '.' || arg === process.execPath) {
            continue;
        }
        
        // Check if this looks like a file path
        if ((arg.endsWith('.pdf') || arg.match(/\.(png|jpg|jpeg|gif|webp|bmp|svg)$/i)) && fs.existsSync(arg)) {
            console.log('[Main] Found file in args:', arg);
            return arg;
        }
    }
    
    return null;
}

// Check for file at startup
const fileFromArgs = getFileFromArgs();
if (fileFromArgs) {
    console.log('[Main] Setting pendingFilePath from command args:', fileFromArgs);
    pendingFilePath = fileFromArgs;
}

// Prevent multiple instances in packaged builds; allow parallel dev runs.
// This avoids blocking `electron .` when the installed app is already open.
const gotTheLock = app.isPackaged ? app.requestSingleInstanceLock() : true;
if (!gotTheLock) {
    console.log('[Main] Another instance is already running, exiting');
    app.quit();
}

function createWindow() {
    win = new BrowserWindow({
        width: 1200,
        height: 800,
        frame: false, // frameless
        fullscreenable: true,
        webPreferences: {
            preload: join(__dirname, "preload.js"),
        },
    });

    win.on('close', (event) => {
        if (forceClosingWindow) return;
        if (!win || win.isDestroyed()) return;

        event.preventDefault();
        if (closeRequestPending) return;
        closeRequestPending = true;

        try {
            win.webContents.send('app:before-close');
        } catch (error) {
            console.warn('[Main] Failed to send app:before-close:', error);
            closeRequestPending = false;
            forceClosingWindow = true;
            win.close();
            return;
        }

        setTimeout(() => {
            if (!closeRequestPending || !win || win.isDestroyed()) return;
            closeRequestPending = false;
            forceClosingWindow = true;
            win.close();
        }, 12000);
    });

    // Load from Vite dev server in development, built files in production
    const isDev = !app.isPackaged;
    if (isDev) {
        win.loadURL("http://127.0.0.1:3000/");
        win.webContents.openDevTools({ mode: "undocked" });
    } else {
        win.loadFile(join(__dirname, "dist", "index.html"));
        setupAutoUpdater();
    }

    // Handle pending file after window loads
    win.webContents.on('did-finish-load', () => {
        if (pendingFilePath) {
            console.log('[Main] Processing pendingFilePath:', pendingFilePath);
            openFileInApp(pendingFilePath);
            pendingFilePath = null;
        }

        if (app.isPackaged) {
            // Delay slightly so the renderer can mount and subscribe to IPC events.
            setTimeout(() => {
                try {
                    autoUpdater.checkForUpdates();
                } catch (error) {
                    console.error('[Main] checkForUpdates failed:', error);
                }
            }, 1500);
        }
    });
}

app.whenReady().then(createWindow);

// Handle file opened with the app (when set as default app on macOS)
app.on('open-file', (event, filePath) => {
    console.log('[Main] open-file event received:', filePath);
    event.preventDefault();
    if (win) {
        openFileInApp(filePath);
    } else {
        console.log('[Main] Window not ready, storing pendingFilePath:', filePath);
        pendingFilePath = filePath;
    }
});

// Handle second instance (Linux/Windows behavior when set as default app)
app.on('second-instance', (event, argv, workingDirectory) => {
    console.log('[Main] second-instance event received');
    console.log('[Main] argv:', argv);
    console.log('[Main] workingDirectory:', workingDirectory);
    
    // argv[0] is the executable path
    // On Linux/Windows, the file path is passed as the last argument
    if (argv.length > 1) {
        // Try to find the file path - could be at index 1 or last index
        let filePath = argv[argv.length - 1];
        
        // If it looks like an executable path, try the next argument
        if (filePath.includes('simple_pdf_reader') && argv.length > 2) {
            filePath = argv[argv.length - 1];
        }
        
        console.log('[Main] Extracted filePath:', filePath);
        
        if (fs.existsSync(filePath)) {
            console.log('[Main] File exists, opening:', filePath);
            if (win) {
                openFileInApp(filePath);
            } else {
                console.log('[Main] Window not ready, storing pendingFilePath:', filePath);
                pendingFilePath = filePath;
            }
        } else {
            console.warn('[Main] File does not exist:', filePath);
        }
    } else {
        console.log('[Main] No file path in argv');
    }
});

// Window control handlers
ipcMain.handle("window:minimize", () => {
    win.minimize();
});

ipcMain.handle("window:maximize", () => {
    if (win.isMaximized()) win.restore();
    else win.maximize();
});

ipcMain.handle("window:fullscreen", () => {
    if (win.isFullScreen()) win.setFullScreen(false);
    else win.setFullScreen(true);
});

ipcMain.handle("window:close", () => {
    win.close();
});

// Update handlers (used by in-app update banner)
ipcMain.handle('update:download', async () => {
    if (!app.isPackaged) return { ok: false, error: 'Updates are disabled in development.' };
    setupAutoUpdater();

    if (updateDownloaded) return { ok: true, state: 'downloaded' };
    if (updateDownloadInProgress) return { ok: true, state: 'downloading' };

    try {
        updateDownloadInProgress = true;
        sendUpdateStatus({ state: 'downloading', info: lastUpdateInfo });
        setTaskbarProgress(0);
        await autoUpdater.downloadUpdate();
        return { ok: true, state: 'downloading' };
    } catch (error) {
        console.error('[Main] update:download failed:', error);
        sendUpdateStatus({ state: 'error', error: String(error?.message || error) });
        setTaskbarProgress(-1);
        return { ok: false, error: String(error?.message || error) };
    } finally {
        updateDownloadInProgress = false;
    }
});

ipcMain.handle('update:install', async () => {
    if (!app.isPackaged) return { ok: false, error: 'Updates are disabled in development.' };
    setupAutoUpdater();

    if (!updateDownloaded) {
        return { ok: false, error: 'Update is not downloaded yet.' };
    }

    try {
        autoUpdater.quitAndInstall();
        return { ok: true };
    } catch (error) {
        console.error('[Main] update:install failed:', error);
        return { ok: false, error: String(error?.message || error) };
    }
});

ipcMain.handle('update:check', async () => {
    if (!app.isPackaged) return { ok: false, error: 'Updates are disabled in development.' };
    setupAutoUpdater();
    try {
        await autoUpdater.checkForUpdates();
        return { ok: true };
    } catch (error) {
        console.error('[Main] update:check failed:', error);
        sendUpdateStatus({ state: 'error', error: String(error?.message || error) });
        return { ok: false, error: String(error?.message || error) };
    }
});

// Print current window contents
ipcMain.handle("window:print", async (event, options = {}) => {
    if (!win) {
        return {
            success: false,
            error: 'Window not available'
        };
    }

    return new Promise((resolve) => {
        try {
            win.webContents.print({ printBackground: true, ...options }, (success, failureReason) => {
                resolve({ success, failureReason });
            });
        } catch (error) {
            console.error('[Main] Print failed:', error);
            resolve({ success: false, error: error.message });
        }
    });
});

// List printers for custom in-app print modal
ipcMain.handle('print:getPrinters', async () => {
    if (!win) return [];
    try {
        const printers = await win.webContents.getPrintersAsync();
        return printers.map(p => ({
            name: p.name,
            displayName: p.displayName || p.name,
            isDefault: !!p.isDefault,
            status: p.status,
        }));
    } catch (error) {
        console.error('[Main] getPrintersAsync failed:', error);
        return [];
    }
});

// Silently print a set of page images (PNG data URLs) without showing the OS print dialog.
ipcMain.handle('print:printImages', async (event, payload = {}) => {
    if (!win) {
        return { success: false, error: 'Window not available' };
    }

    const images = Array.isArray(payload.images) ? payload.images : [];
    const options = payload.options || {};
    const deviceName = options.deviceName || '';
    const copies = Number.isFinite(options.copies) ? options.copies : parseInt(options.copies || '1', 10);
    const landscape = options.landscape === true;
    const color = options.color !== false;
    const duplexMode = typeof options.duplexMode === 'string' ? options.duplexMode : undefined;

    const dpiRaw = options.dpi || {};
    const dpiHorizontal = Number.isFinite(dpiRaw.horizontal) ? Math.max(72, Math.min(1200, dpiRaw.horizontal)) : undefined;
    const dpiVertical = Number.isFinite(dpiRaw.vertical) ? Math.max(72, Math.min(1200, dpiRaw.vertical)) : undefined;

    const scalePercentInput = Number.isFinite(options.scalePercent)
        ? options.scalePercent
        : parseInt(options.scalePercent || '100', 10);
    const scalePercent = Number.isFinite(scalePercentInput) ? Math.max(10, Math.min(200, scalePercentInput)) : 100;

    const pageSizeMap = {
        A4: '210mm 297mm',
        Letter: '8.5in 11in',
        Legal: '8.5in 14in',
    };

    const pageSizeRaw = typeof options.pageSize === 'string' ? options.pageSize : 'auto';
    const pageSizeKey = pageSizeRaw === 'A4' || pageSizeRaw === 'Letter' || pageSizeRaw === 'Legal' ? pageSizeRaw : 'auto';
    const pageSizeCss = pageSizeMap[pageSizeKey] || '';

    const toMm = (value, fallback = 10) => {
        const n = Number(value);
        if (!Number.isFinite(n)) return fallback;
        return Math.max(0, Math.min(50, n));
    };

    const marginPresetRaw = typeof options.marginPreset === 'string' ? options.marginPreset : 'default';
    const marginPreset = ['default', 'none', 'minimum', 'custom'].includes(marginPresetRaw)
        ? marginPresetRaw
        : 'default';

    const customMargins = options.marginsMm || {};
    const marginByPresetMm = {
        none: { top: 0, right: 0, bottom: 0, left: 0 },
        minimum: { top: 6, right: 6, bottom: 6, left: 6 },
        default: { top: 12, right: 12, bottom: 12, left: 12 },
    };

    const marginsMm = marginPreset === 'custom'
        ? {
            top: toMm(customMargins.top),
            right: toMm(customMargins.right),
            bottom: toMm(customMargins.bottom),
            left: toMm(customMargins.left),
        }
        : marginByPresetMm[marginPreset];

    if (!images.length) {
        return { success: false, error: 'No pages to print' };
    }

    const jobId = Date.now();
    const jobDir = join(app.getPath('temp'), `simple-pdf-reader-print-${jobId}`);

    let printWin = null;

    try {
        await fs.promises.mkdir(jobDir, { recursive: true });

        const imageFiles = [];
        for (let i = 0; i < images.length; i++) {
            const dataUrl = images[i];
            const match = typeof dataUrl === 'string' ? dataUrl.match(/^data:image\/(png|jpeg);base64,(.+)$/) : null;
            if (!match) continue;
            const ext = match[1] === 'jpeg' ? 'jpg' : 'png';
            const base64 = match[2];
            const buffer = Buffer.from(base64, 'base64');
            const filePath = join(jobDir, `page-${String(i + 1).padStart(4, '0')}.${ext}`);
            await fs.promises.writeFile(filePath, buffer);
            imageFiles.push(filePath);
        }

        if (!imageFiles.length) {
            return { success: false, error: 'No valid images to print' };
        }

                const pageSizeRule = pageSizeCss ? `size: ${pageSizeCss};` : '';
                const marginRule = `margin: ${marginsMm.top}mm ${marginsMm.right}mm ${marginsMm.bottom}mm ${marginsMm.left}mm;`;

                const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Print</title>
    <style>
            @page { ${pageSizeRule} ${marginRule} }
      html, body { margin: 0; padding: 0; background: white; }
      .page { page-break-after: always; break-after: page; }
      .page:last-child { page-break-after: auto; break-after: auto; }
            .page-content { width: 100%; }
            img { width: ${scalePercent}%; height: auto; display: block; margin: 0 auto; }
    </style>
  </head>
  <body>
        ${imageFiles.map((p) => `<div class="page"><div class="page-content"><img src="file:///${p.replace(/\\/g, '/')}" /></div></div>`).join('')}
  </body>
</html>`;

        const htmlPath = join(jobDir, 'index.html');
        await fs.promises.writeFile(htmlPath, html, 'utf-8');

        printWin = new BrowserWindow({
            show: false,
            webPreferences: {
                sandbox: true,
                contextIsolation: true,
            },
        });

        await printWin.loadFile(htmlPath);

        // Wait a tick for images to decode
        await new Promise((resolve) => setTimeout(resolve, 250));

        const printResult = await new Promise((resolve) => {
            try {
                printWin.webContents.print(
                    {
                        silent: true,
                        printBackground: true,
                        deviceName: deviceName || undefined,
                        copies: Number.isFinite(copies) && copies > 0 ? copies : 1,
                        landscape,
                        color,
                        pageSize: pageSizeKey === 'auto' ? undefined : pageSizeKey,
                        scaleFactor: scalePercent,
                        duplexMode,
                        dpi: (dpiHorizontal && dpiVertical) ? { horizontal: dpiHorizontal, vertical: dpiVertical } : undefined,
                    },
                    (success, failureReason) => resolve({ success, failureReason })
                );
            } catch (error) {
                resolve({ success: false, error: error.message });
            }
        });

        return printResult;
    } catch (error) {
        console.error('[Main] printImages failed:', error);
        return { success: false, error: error.message };
    } finally {
        try {
            if (printWin && !printWin.isDestroyed()) {
                printWin.close();
            }
        } catch {}

        // Best-effort cleanup
        try {
            await fs.promises.rm(jobDir, { recursive: true, force: true });
        } catch {}
    }
});

// Function to open a file in the app
function openFileInApp(filepath) {
    if (!win) {
        console.error('openFileInApp: Window not available');
        return;
    }
    
    console.log('[Main] Opening file:', filepath);
    rememberRecentFile(filepath);

    const draftData = maybeResolveDraftForOpen(filepath);
    if (draftData) {
        console.log('[Main] Sending file:opened event for draft:', draftData.filename);
        win.webContents.send('file:opened', draftData);
        return;
    }
    
    try {
        const fileData = resolveOpenFileData(filepath);
        console.log('[Main] Sending file:opened event:', fileData?.filename);
        win.webContents.send('file:opened', fileData);
    } catch (error) {
        console.error('[Main] Error reading file:', error);
        win.webContents.send('file:opened', null);
    }
}

// File open dialog + read file
ipcMain.handle("file:open", async () => {
    const result = await dialog.showOpenDialog(win, {
        properties: ["openFile"],
        filters: [
            { name: "PDF Files", extensions: ["pdf"] },
            { name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"] },
            { name: "All Files", extensions: ["*"] }
        ],
    });

    if (result.canceled) return null;

    const filepath = result.filePaths[0];
    rememberRecentFile(filepath);

    const draftData = maybeResolveDraftForOpen(filepath);
    if (draftData) return draftData;

    return resolveOpenFileData(filepath);
});

ipcMain.handle('dialog:save-choice', async (_event, context = 'save') => {
    const isCloseRequest = context === 'close';
    const buttons = isCloseRequest
        ? ['Overwrite File', 'Save as Draft', 'Discard Changes', 'Cancel']
        : ['Overwrite File', 'Save as Draft', 'Cancel'];
    const cancelId = isCloseRequest ? 3 : 2;
    const result = await dialog.showMessageBox(win, {
        type: 'question',
        buttons,
        defaultId: 0,
        cancelId,
        title: isCloseRequest ? 'Save before closing' : 'Save options',
        message: isCloseRequest
            ? 'You have unsaved changes. How do you want to save?'
            : 'How do you want to save this file?',
        detail: isCloseRequest
            ? 'Overwrite updates the original file. Draft keeps your changes for next open. Discard closes without saving.'
            : 'Overwrite updates the original file. Draft keeps your changes for next open.',
    });

    if (result.response === 0) return { mode: 'overwrite' };
    if (result.response === 1) return { mode: 'draft' };
    if (isCloseRequest && result.response === 2) return { mode: 'discard' };
    return { mode: 'cancel' };
});

ipcMain.handle('draft:save', async (_event, payload = {}) => {
    try {
        const draftPatch =
            (payload?.draftPatch && typeof payload.draftPatch === 'object' && payload.draftPatch)
            || (payload?.fileData && typeof payload.fileData === 'object' && payload.fileData)
            || (payload && typeof payload === 'object' ? payload : null);
        const filepath = payload?.filepath || draftPatch?.filepath;
        const record = saveDraftForFile(filepath, draftPatch);
        return { success: true, record };
    } catch (error) {
        console.error('[Main] draft:save failed:', error);
        return { success: false, error: String(error?.message || error) };
    }
});

ipcMain.handle('draft:discard', async (_event, filepath) => {
    try {
        const discarded = discardDraftForFile(filepath);
        return { success: true, discarded };
    } catch (error) {
        console.error('[Main] draft:discard failed:', error);
        return { success: false, error: String(error?.message || error) };
    }
});

ipcMain.handle('app:close-response', async (_event, proceed) => {
    closeRequestPending = false;

    if (proceed) {
        forceClosingWindow = true;
        if (win && !win.isDestroyed()) {
            win.close();
        }
    }

    return true;
});

ipcMain.handle('file:getRecent', async () => {
    const readerId = getOrCreateReaderId();
    return {
        id: readerId,
        recentFiles: getRecentFiles(readerId),
    };
});

ipcMain.handle('file:openRecent', async (_event, filepath) => {
    if (!filepath || typeof filepath !== 'string') {
        return { success: false, error: 'Invalid file path' };
    }

    if (!fs.existsSync(filepath)) {
        return { success: false, error: 'File does not exist' };
    }

    openFileInApp(filepath);
    return { success: true };
});

// File save handler - overwrites existing file
ipcMain.handle("file:save", async (event, filepath, content, encoding = 'utf-8') => {
    try {
        if (!filepath) {
            throw new Error('No filepath provided');
        }

        console.log('Attempting to save file:', filepath);
        console.log('Encoding:', encoding);
        console.log('Content length:', content?.length);

        // Check if file exists and is writable
        try {
            fs.accessSync(filepath, fs.constants.W_OK);
            console.log('File is writable');
        } catch (accessError) {
            console.warn('File access check failed:', accessError.message);
            // Try to proceed anyway - file might not exist yet
        }

        // If content is base64 and it's a PDF, decode it
        if (encoding === 'base64') {
            const buffer = Buffer.from(content, 'base64');
            console.log('Buffer size:', buffer.length);
            
            // Use writeFile with error callback for better error handling
            await fs.promises.writeFile(filepath, buffer, { mode: 0o666 });
            console.log('File written successfully');
        } else {
            await fs.promises.writeFile(filepath, content, { encoding, mode: 0o666 });
            console.log('File written successfully');
        }

        return {
            success: true,
            filepath,
            message: 'File saved successfully'
        };
    } catch (error) {
        console.error('Error saving file:', error);
        console.error('Error details:', {
            code: error.code,
            message: error.message,
            path: error.path,
            syscall: error.syscall
        });
        return {
            success: false,
            error: error.message,
            errorCode: error.code
        };
    }
});

// Store handlers
ipcMain.handle("store:get", (event, key) => {
    return store.get(key);
});

ipcMain.handle("store:set", (event, key, value) => {
    store.set(key, value);
    return true;
});

ipcMain.handle("store:getAll", () => {
    return store.store;
});

ipcMain.handle("store:delete", (event, key) => {
    store.delete(key);
    return true;
});

ipcMain.handle("store:clear", () => {
    store.clear();
    return true;
});
