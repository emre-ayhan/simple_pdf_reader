#!/bin/bash

# ============================================================================
# Simple PDF Reader - Uninstallation Script
# ============================================================================

APP_NAME="simple-pdf-reader"
DESKTOP_FILE="$HOME/.local/share/applications/${APP_NAME}.desktop"
USER_DATA_DIR="$HOME/.config/simple-pdf-reader-profile"

echo "Uninstalling Simple PDF Reader..."

# ============================================================================
# 1. Remove Desktop Entry
# ============================================================================

if [ -f "$DESKTOP_FILE" ]; then
    rm "$DESKTOP_FILE"
    echo "Removed desktop shortcut."
    
    # Update desktop database
    if command -v update-desktop-database &> /dev/null; then
        update-desktop-database "$HOME/.local/share/applications" 2>/dev/null
    fi
else
    echo "Desktop shortcut not found."
fi

# ============================================================================
# 2. Remove User Data Directory
# ============================================================================

if [ -d "$USER_DATA_DIR" ]; then
    rm -rf "$USER_DATA_DIR"
    echo "Removed user data directory."
fi

echo.
echo "============================================================================"
echo "Uninstallation Complete."
echo "============================================================================"
