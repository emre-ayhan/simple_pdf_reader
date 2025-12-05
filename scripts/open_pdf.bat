@echo off
setlocal enabledelayedexpansion

REM ============================================================================
REM Simple PDF Reader - File Opener Helper
REM This script URL-encodes the file path before passing to Chrome
REM ============================================================================

set "CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe"
set "USER_DATA_DIR=%LOCALAPPDATA%\SimplePDFReaderData"

REM Get the directory where this script is located
set "SCRIPT_DIR=%~dp0"

REM Determine HTML_PATH based on where the script is running
if exist "%SCRIPT_DIR%index.html" (
    set "HTML_PATH=%SCRIPT_DIR%index.html"
) else (
    set "HTML_PATH=%SCRIPT_DIR%..\index.html"
)

REM Normalize to use forward slashes
set "APP_URL=file:///%HTML_PATH:\=/%"

REM Get the file path passed as argument
set "FILE_PATH=%~1"

REM URL encode the file path using PowerShell
for /f "delims=" %%i in ('powershell -command "[uri]::EscapeDataString('%FILE_PATH%')"') do set "ENCODED_PATH=%%i"

REM Launch Chrome with the encoded file path
start "" "%CHROME_PATH%" --user-data-dir="%USER_DATA_DIR%" --allow-file-access-from-files "--app=%APP_URL%?file=!ENCODED_PATH!"
