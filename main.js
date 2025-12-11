import { app, BrowserWindow, ipcMain, dialog } from "electron";
import pkg from "electron-updater";
const { autoUpdater } = pkg;
import fs from "fs";
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

let win;
let pendingFilePath = null;

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
        win.loadURL("http://127.0.0.1:5173/");
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
