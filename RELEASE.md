# Release Process Guide

## How to Create a New Release

### 1. Update Version
Edit `package.json` and increment the version:
```json
"version": "1.0.1"  // or 1.1.0, 2.0.0, etc.
```

### 2. Build Installers
```bash
npm run electron:build:win
npm run electron:build:mac    # macOS only
npm run electron:build:linux
```

### 3. Create GitHub Release

1. Go to: https://github.com/emre-ayhan/simple_pdf_reader/releases/new
2. Click "Create a new release"
3. Tag version: `v1.0.1` (must match package.json version with 'v' prefix)
4. Release title: `Version 1.0.1` or descriptive name
5. Description: List changes, bug fixes, new features
6. Upload installer files from `dist-electron/`:
   - **Windows:** `dist-electron/windows/Simple PDF Reader-1.0.1.exe`
   - **macOS:** `dist-electron/macos/Simple PDF Reader-1.0.1.dmg`
   - **Linux:** `dist-electron/linux/simple-pdf-reader_1.0.1_amd64.deb`
7. Click "Publish release"

### 4. Auto-Updates

Users with existing installations will automatically be notified of the update when they launch the app!

## Important Notes

- ✅ DO commit source code to git
- ✅ DO upload installers to GitHub Releases
- ❌ DON'T commit `dist-electron/` to git
- ❌ DON'T put large files in docs/ folder
- The `docs/` folder is for the web viewer (GitHub Pages)
- Installers are distributed via GitHub Releases
