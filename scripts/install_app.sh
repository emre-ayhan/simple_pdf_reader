#!/bin/bash

# ============================================================================
# Simple PDF Reader - Installation Script
# ============================================================================

APP_NAME="simple-pdf-reader"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Determine paths based on where the script is running
if [ -f "${SCRIPT_DIR}/index.html" ]; then
    # Running from dist folder
    SOURCE_DIR="${SCRIPT_DIR}"
else
    # Running from scripts folder
    SOURCE_DIR="$(dirname "$SCRIPT_DIR")"
fi

# Detect OS
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    OS="macos"
    INSTALL_DIR="/Applications/SimplePDFReader.app/Contents/Resources"
    USER_DATA_DIR="$HOME/Library/Application Support/SimplePDFReader"
else
    # Linux
    OS="linux"
    INSTALL_DIR="$HOME/.local/share/simple-pdf-reader"
    USER_DATA_DIR="$HOME/.config/simple-pdf-reader-profile"
fi

# Detect Browser
if command -v google-chrome &> /dev/null; then
    BROWSER="google-chrome"
elif command -v google-chrome-stable &> /dev/null; then
    BROWSER="google-chrome-stable"
elif command -v chromium-browser &> /dev/null; then
    BROWSER="chromium-browser"
elif command -v chromium &> /dev/null; then
    BROWSER="chromium"
elif command -v open &> /dev/null && [[ "$OS" == "macos" ]]; then
    BROWSER="open -a 'Google Chrome' --"
else
    echo "Error: Chrome or Chromium not found."
    echo "Please install Google Chrome or Chromium."
    exit 1
fi

echo "OS: $OS"
echo "Using browser: $BROWSER"
echo "Install directory: $INSTALL_DIR"

# Determine dist folder location
if [ -f "${SCRIPT_DIR}/index.html" ]; then\n    # Running from dist folder directly\n    DIST_DIR=\"${SCRIPT_DIR}\"\nelse\n    # Running from scripts folder or elsewhere - look for dist in parent\n    DIST_DIR=\"${SOURCE_DIR}/dist\"\nfi\n\nif [ ! -d \"$DIST_DIR\" ]; then\n    echo \"Error: dist folder not found at $DIST_DIR\"\n    echo \"Please run this script from the dist folder or ensure dist exists.\"\n    exit 1\nfi\n\n# ============================================================================\n# 1. Copy Dist Files & Create Shortcuts\n# ============================================================================\n\necho \"Installing application files from dist...\"\nmkdir -p \"$INSTALL_DIR\"\ncp -r \"$DIST_DIR\"/* \"$INSTALL_DIR\" 2>/dev/null || true

HTML_PATH="${INSTALL_DIR}/index.html"
ICON_PATH="${INSTALL_DIR}/logo.ico"

if [[ "$OS" == "macos" ]]; then
    # Create macOS app bundle
    APP_BUNDLE="/Applications/SimplePDFReader.app"
    echo "Creating macOS app bundle at $APP_BUNDLE..."
    
    mkdir -p "$APP_BUNDLE/Contents/MacOS"
    mkdir -p "$APP_BUNDLE/Contents/Resources"
    
    # Create launcher script
    cat > "$APP_BUNDLE/Contents/MacOS/launch.sh" << 'MACOS_LAUNCHER'
#!/bin/bash
exec open -a "Google Chrome" "file://%APP_PATH%" --args --user-data-dir="%USER_DATA_DIR%" --allow-file-access-from-files
MACOS_LAUNCHER
    
    # Replace placeholders with actual paths
    sed -i '' "s|%APP_PATH%|${HTML_PATH}|g" "$APP_BUNDLE/Contents/MacOS/launch.sh"
    sed -i '' "s|%USER_DATA_DIR%|${USER_DATA_DIR}|g" "$APP_BUNDLE/Contents/MacOS/launch.sh"
    chmod +x "$APP_BUNDLE/Contents/MacOS/launch.sh"
    
    # Create Info.plist
    cat > "$APP_BUNDLE/Contents/Info.plist" << 'MACOS_PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>launch.sh</string>
    <key>CFBundleIdentifier</key>
    <string>com.simple.pdfreader</string>
    <key>CFBundleName</key>
    <string>Simple PDF Reader</string>
    <key>CFBundleVersion</key>
    <string>1.0.0</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0.0</string>
</dict>
</plist>
MACOS_PLIST
    
    echo "macOS app bundle created successfully."
else
    # Linux desktop entry
    DESKTOP_FILE="$HOME/.local/share/applications/${APP_NAME}.desktop"
    mkdir -p "$HOME/.local/share/applications"
    
    cat > "$DESKTOP_FILE" << EOL
[Desktop Entry]
Type=Application
Name=Simple PDF Reader
Comment=View and annotate PDFs
Exec=$BROWSER --user-data-dir="$USER_DATA_DIR" --allow-file-access-from-files --app="file://${HTML_PATH}?file=%f"
Icon=${ICON_PATH}
Terminal=false
Categories=Office;Viewer;
MimeType=application/pdf;
EOL
    
    chmod +x "$DESKTOP_FILE"
    update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
    
    echo "Desktop entry created at $DESKTOP_FILE"
fi

# ============================================================================
# 2. Set as Default App
# ============================================================================

echo "Setting as default PDF viewer..."

if [[ "$OS" == "macos" ]]; then
    # macOS - set default using duti or via Finder
    if command -v duti &> /dev/null; then
        duti com.simple.pdfreadera com.adobe.pdf all
        echo "Set as default PDF viewer (duti)."
    else
        echo "To set as default: System Preferences > Default Apps > PDF > Simple PDF Reader"
    fi
else
    # Linux
    xdg-mime default ${APP_NAME}.desktop application/pdf 2>/dev/null || true
fi

echo.
echo "============================================================================"
echo "Installation Complete!"
echo "============================================================================"
echo.
echo "Simple PDF Reader has been installed."

if [[ "$OS" == "macos" ]]; then
    echo "App location: /Applications/SimplePDFReader.app"
    echo "You can find it in your Applications folder or Launchpad."
else
    echo "You can find it in your applications menu."
fi

echo.
echo "If it doesn't open automatically for PDFs:"
echo "Right-click a PDF -> Open With -> Simple PDF Reader"
