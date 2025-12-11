import { app, BrowserWindow, ipcMain, dialog } from "electron";
import pkg from "electron-updater";
const { autoUpdater } = pkg;
import fs from "fs";
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

let win;
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
}

app.whenReady().then(createWindow);

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

        // If content is base64 and it's a PDF, decode it
        if (encoding === 'base64') {
            const buffer = Buffer.from(content, 'base64');
            fs.writeFileSync(filepath, buffer);
        } else {
            fs.writeFileSync(filepath, content, encoding);
        }

        return {
            success: true,
            filepath,
            message: 'File saved successfully'
        };
    } catch (error) {
        console.error('Error saving file:', error);
        return {
            success: false,
            error: error.message
        };
    }
});
