@echo off
setlocal

REM ============================================================================
REM Simple PDF Reader - Uninstallation Script
REM ============================================================================

set "SHORTCUT_NAME=Simple PDF Reader.lnk"
set "START_MENU=%APPDATA%\Microsoft\Windows\Start Menu\Programs"
set "USER_DATA_DIR=%LOCALAPPDATA%\SimplePDFReaderData"

echo Uninstalling Simple PDF Reader...

REM ============================================================================
REM 1. Remove Shortcut
REM ============================================================================

if exist "%START_MENU%\%SHORTCUT_NAME%" (
    del "%START_MENU%\%SHORTCUT_NAME%"
    echo Removed Start Menu shortcut.
) else (
    echo Shortcut not found.
)

REM ============================================================================
REM 2. Remove Registry Keys
REM ============================================================================

echo Removing registry keys...

REM Remove the ProgID
reg delete "HKCU\Software\Classes\SimplePDFReader.PDF" /f >nul 2>&1

REM Remove from OpenWith list
reg delete "HKCU\Software\Classes\.pdf\OpenWithProgids" /v "SimplePDFReader.PDF" /f >nul 2>&1

REM Check if .pdf is currently set to our app and clear it if so
REM This forces Windows to ask the user for a new default next time
for /f "tokens=3" %%a in ('reg query "HKCU\Software\Classes\.pdf" /ve 2^>nul') do (
    if "%%a"=="SimplePDFReader.PDF" (
        reg delete "HKCU\Software\Classes\.pdf" /ve /f >nul 2>&1
        echo Reset default PDF handler preference.
    )
)

REM ============================================================================
REM 3. Remove User Data Directory
REM ============================================================================

if exist "%USER_DATA_DIR%" (
    rmdir /s /q "%USER_DATA_DIR%"
    echo Removed user data directory.
)

echo.
echo ============================================================================
echo Uninstallation Complete.
echo ============================================================================
pause
