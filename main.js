import { app, BrowserWindow, ipcMain, dialog } from "electron";
import pkg from "electron-updater";
const { autoUpdater } = pkg;
import Store from "electron-store";
import fs from "fs";
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Initialize electron-store with schema
const store = new Store({
    schema: {
        pageIndex: { type: 'number', default: 0 },
        enableTouchDrawing: { type: 'boolean', default: false },
        zoom: { type: 'number', default: 100 },
        zoomMode: { type: 'string', default: 'fit-width' },
        lastFilePath: { type: 'string', default: '' },
        lastFileName: { type: 'string', default: '' },
        fileStates: { type: 'object', default: {} }
    },
    clearInvalidConfig: true
});

let win;
let pendingFilePath = null;

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

// Prevent multiple instances - must be called before app.whenReady()
const gotTheLock = app.requestSingleInstanceLock();
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

    // Load from Vite dev server in development, built files in production
    const isDev = !app.isPackaged;
    if (isDev) {
        win.loadURL("http://127.0.0.1:3000/");
        win.webContents.openDevTools({ mode: "undocked" });
    } else {
        win.loadFile(join(__dirname, "dist", "index.html"));
        // Check for updates
        autoUpdater.checkForUpdatesAndNotify();
    }

    // Handle pending file after window loads
    win.webContents.on('did-finish-load', () => {
        if (pendingFilePath) {
            console.log('[Main] Processing pendingFilePath:', pendingFilePath);
            openFileInApp(pendingFilePath);
            pendingFilePath = null;
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

        const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Print</title>
    <style>
      @page { margin: 0; }
      html, body { margin: 0; padding: 0; background: white; }
      .page { page-break-after: always; break-after: page; }
      .page:last-child { page-break-after: auto; break-after: auto; }
      img { width: 100%; height: auto; display: block; }
    </style>
  </head>
  <body>
    ${imageFiles.map((p) => `<div class="page"><img src="file:///${p.replace(/\\/g, '/')}" /></div>`).join('')}
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
    
    const filename = filepath.split(/[/\\]/).pop();
    const ext = filename.toLowerCase().split('.').pop();
    
    // For PDFs, read as binary (base64)
    if (ext === 'pdf') {
        try {
            console.log('[Main] Reading PDF file...');
            const buffer = fs.readFileSync(filepath);
            const base64 = buffer.toString('base64');
            const fileData = {
                filepath,
                filename,
                content: base64,
                type: 'pdf',
                encoding: 'base64'
            };
            console.log('[Main] Sending file:opened event for PDF:', filename);
            win.webContents.send('file:opened', fileData);
        } catch (error) {
            console.error('[Main] Error reading PDF file:', error);
            win.webContents.send('file:opened', null);
        }
    }
    // For images, read as base64
    else if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) {
        try {
            console.log('[Main] Reading image file...');
            const buffer = fs.readFileSync(filepath);
            const base64 = buffer.toString('base64');
            const mimeTypes = {
                'png': 'image/png',
                'jpg': 'image/jpeg',
                'jpeg': 'image/jpeg',
                'gif': 'image/gif',
                'webp': 'image/webp',
                'bmp': 'image/bmp',
                'svg': 'image/svg+xml'
            };
            const fileData = {
                filepath,
                filename,
                content: base64,
                type: 'image',
                mimeType: mimeTypes[ext] || 'image/png',
                encoding: 'base64'
            };
            console.log('[Main] Sending file:opened event for image:', filename);
            win.webContents.send('file:opened', fileData);
        } catch (error) {
            console.error('[Main] Error reading image file:', error);
            win.webContents.send('file:opened', null);
        }
    } else {
        console.warn('[Main] Unsupported file type:', ext);
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
    const filename = filepath.split(/[/\\]/).pop();
    const ext = filename.toLowerCase().split('.').pop();
    
    // For PDFs, read as binary (base64)
    if (ext === 'pdf') {
        const buffer = fs.readFileSync(filepath);
        const base64 = buffer.toString('base64');
        return {
            filepath,
            filename,
            content: base64,
            type: 'pdf',
            encoding: 'base64'
        };
    }
    // For images, read as base64
    else if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) {
        const buffer = fs.readFileSync(filepath);
        const base64 = buffer.toString('base64');
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
            content: base64,
            type: 'image',
            mimeType: mimeTypes[ext] || 'image/png',
            encoding: 'base64'
        };
    }
    // Fallback for other files
    else {
        const content = fs.readFileSync(filepath, "utf-8");
        return {
            filepath,
            filename,
            content,
            type: 'text'
        };
    }
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
