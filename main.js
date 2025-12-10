import { app, BrowserWindow, ipcMain, dialog } from "electron";
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


    win.loadURL("http://127.0.0.1:5173/");
    // win.loadFile("./docs/index.html");
    win.webContents.openDevTools({ mode: "undocked" });
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
