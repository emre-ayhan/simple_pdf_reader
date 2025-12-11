# Release Process Guide

## Automated Release Process (Recommended)

The project uses GitHub Actions to automatically build and release installers for all platforms.

### 1. Update Version
Edit `package.json` and increment the version:
```json
"version": "1.0.1"  // or 1.1.0, 2.0.0, etc.
```

### 2. Commit and Push
```bash
git add package.json
git commit -m "Bump version to 1.0.1"
git push origin main
```

### 3. Create and Push Version Tag
```bash
git tag v1.0.1
git push origin v1.0.1
```

### 4. Automatic Build & Release

GitHub Actions will automatically:
- ✅ Build installers for Windows, macOS, and Linux (x64 & arm64)
- ✅ Create a GitHub Release with auto-generated changelog
- ✅ Upload all installers and update manifests
- ✅ Make the release available for download

Check progress at: https://github.com/emre-ayhan/simple_pdf_reader/actions

### 5. Auto-Updates

Users with existing installations will automatically be notified of the update when they launch the app!

---

## Manual Release Process (Alternative)

If you need to build and release manually:

### 1. Update Version
Edit `package.json` and increment the version.

### 2. Build Installers Locally
```bash
npm run electron:build:win     # On Windows
npm run electron:build:mac     # On macOS only
npm run electron:build:linux   # On Linux
```

### 3. Create GitHub Release Manually

1. Go to: https://github.com/emre-ayhan/simple_pdf_reader/releases/new
2. Click "Create a new release"
3. Tag version: `v1.0.1` (must match package.json version with 'v' prefix)
4. Release title: `Version 1.0.1` or descriptive name
5. Description: List changes, bug fixes, new features
6. Upload installer files from `dist-electron/`:
   - **Windows:** `dist-electron/windows/Simple PDF Reader-1.0.1.exe`
   - **macOS:** `dist-electron/macos/Simple PDF Reader-1.0.1.dmg`
   - **Linux:** `dist-electron/linux/simple-pdf-reader_1.0.1_amd64.deb` and `simple-pdf-reader_1.0.1_arm64.deb`
7. Upload update manifests: `latest-*.yml` files from each platform directory
8. Click "Publish release"

## Important Notes

- ✅ DO commit source code to git
- ✅ DO upload installers to GitHub Releases
- ❌ DON'T commit `dist-electron/` to git
- ❌ DON'T put large files in docs/ folder
- The `docs/` folder is for the web viewer (GitHub Pages)
- Installers are distributed via GitHub Releases
