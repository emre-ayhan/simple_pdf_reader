#!/bin/bash

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

# Create .desktop file
mkdir -p "$HOME/.local/share/applications"

cat > "$DESKTOP_FILE" << EOL
[Desktop Entry]
Type=Application
Name=Simple PDF Reader
Comment=View and annotate PDFs
Exec=$BROWSER --user-data-dir="$HOME/.config/simple-pdf-reader-profile" --allow-file-access-from-files --app="file://${HTML_PATH}?file=%f"
Icon=${ICON_PATH}
Terminal=false
Categories=Office;Viewer;
MimeType=application/pdf;
EOL

# Make executable
chmod +x "$DESKTOP_FILE"

# Update desktop database
update-desktop-database "$HOME/.local/share/applications" 2>/dev/null

# Set as default
xdg-mime default ${APP_NAME}.desktop application/pdf

echo "Simple PDF Reader has been registered as the default PDF viewer."
echo "If it doesn't open automatically, right-click a PDF and select 'Open With' -> 'Simple PDF Reader'."
