#!/bin/bash

# ============================================================================
# Simple PDF Reader - Installation Script
# ============================================================================

APP_NAME="simple-pdf-reader"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Determine paths based on where the script is running
if [ -f "${SCRIPT_DIR}/index.html" ]; then
    # Running from dist folder
    HTML_PATH="${SCRIPT_DIR}/index.html"
    ICON_PATH="${SCRIPT_DIR}/logo.ico"
else
    # Running from scripts folder
    PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
    HTML_PATH="${PROJECT_ROOT}/index.html"
    ICON_PATH="${PROJECT_ROOT}/logo.ico"
fi

DESKTOP_FILE="$HOME/.local/share/applications/${APP_NAME}.desktop"
USER_DATA_DIR="$HOME/.config/simple-pdf-reader-profile"

# Detect Browser
if command -v google-chrome &> /dev/null; then
    BROWSER="google-chrome"
elif command -v google-chrome-stable &> /dev/null; then
    BROWSER="google-chrome-stable"
elif command -v chromium-browser &> /dev/null; then
    BROWSER="chromium-browser"
elif command -v chromium &> /dev/null; then
    BROWSER="chromium"
else
    echo "Error: Chrome or Chromium not found."
    echo "Please install Google Chrome or Chromium."
    exit 1
fi

echo "Using browser: $BROWSER"

# ============================================================================
# 1. Create Desktop Entry (Shortcut & File Handler)
# ============================================================================

echo "Creating application shortcut..."

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

# Make executable
chmod +x "$DESKTOP_FILE"

# Update desktop database
update-desktop-database "$HOME/.local/share/applications" 2>/dev/null

echo "Shortcut created at $DESKTOP_FILE"

# ============================================================================
# 2. Set as Default App
# ============================================================================

echo "Setting as default PDF viewer..."

# Set as default
xdg-mime default ${APP_NAME}.desktop application/pdf

echo.
echo "============================================================================"
echo "Installation Complete!"
echo "============================================================================"
echo.
echo "Simple PDF Reader has been installed and registered."
echo "You can find it in your applications menu."
echo.
echo "If it doesn't open automatically for PDFs:"
echo "Right-click a PDF -> Open With -> Simple PDF Reader"
