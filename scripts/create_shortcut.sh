#!/bin/bash

# Script to create a macOS application bundle for Simple PDF Reader

APP_NAME="Simple PDF Reader"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$HOME/Applications/${APP_NAME}.app"
HTML_PATH="${SCRIPT_DIR}/index.html"
ICON_PATH="${SCRIPT_DIR}/logo.ico"

# Find Chrome or other browsers
if [ -d "/Applications/Google Chrome.app" ]; then
    BROWSER_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
elif [ -d "/Applications/Chromium.app" ]; then
    BROWSER_PATH="/Applications/Chromium.app/Contents/MacOS/Chromium"
elif [ -d "/Applications/Microsoft Edge.app" ]; then
    BROWSER_PATH="/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
else
    echo "Error: Chrome, Chromium, or Edge not found in /Applications"
    echo "Please install one of these browsers first."
    exit 1
fi

echo "Creating application bundle: ${APP_DIR}"

# Create application bundle structure
mkdir -p "${APP_DIR}/Contents/MacOS"
mkdir -p "${APP_DIR}/Contents/Resources"

# Create Info.plist
cat > "${APP_DIR}/Contents/Info.plist" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>launch.sh</string>
    <key>CFBundleIdentifier</key>
    <string>com.simplepdf.reader</string>
    <key>CFBundleName</key>
    <string>${APP_NAME}</string>
    <key>CFBundleVersion</key>
    <string>1.0</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleIconFile</key>
    <string>AppIcon</string>
</dict>
</plist>
EOF

# Create launcher script
cat > "${APP_DIR}/Contents/MacOS/launch.sh" << EOF
#!/bin/bash
"${BROWSER_PATH}" --app="file://${HTML_PATH}" --start-maximized &
EOF

chmod +x "${APP_DIR}/Contents/MacOS/launch.sh"

# Copy icon if it exists (convert .ico to .icns if needed)
if [ -f "${ICON_PATH}" ]; then
    # For simplicity, copy the ico file
    # In production, you'd want to convert .ico to .icns format
    cp "${ICON_PATH}" "${APP_DIR}/Contents/Resources/AppIcon.ico"
fi

echo "✓ Application created successfully!"
echo "Location: ${APP_DIR}"
echo ""
echo "You can now:"
echo "1. Open it from ~/Applications/${APP_NAME}.app"
echo "2. Drag it to your Dock for quick access"
echo "3. Move it to /Applications if you want system-wide access"
