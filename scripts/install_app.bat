@echo off
setlocal enabledelayedexpansion

REM ============================================================================
REM Simple PDF Reader - Installation Script
REM ============================================================================

REM Paths
set "CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe"
set "INSTALL_DIR=C:\Program Files\SimplePDFReader"
set "USER_DATA_DIR=%LOCALAPPDATA%\SimplePDFReaderData"

REM Determine source path (dist folder) based on where the script is running
if exist "%~dp0index.html" (
    REM Running from dist folder directly
    set "DIST_DIR=%~dp0"
) else (
    REM Running from scripts folder or elsewhere - expect dist in parent
    set "DIST_DIR=%~dp0..\dist"
)

REM Copy dist files to Program Files
echo Creating installation directory at %INSTALL_DIR%...
mkdir "%INSTALL_DIR%" 2>nul

if not exist "%DIST_DIR%" (
    echo Error: dist folder not found at %DIST_DIR%
    echo Please run this script from the dist folder or ensure dist exists in the parent directory.
    pause
    exit /b 1
)

echo Copying application files from dist...
xcopy "%DIST_DIR%\*" "%INSTALL_DIR%" /E /I /Y >nul

set "APP_PATH=%INSTALL_DIR%\index.html"
set "ICON_PATH=%INSTALL_DIR%\logo.ico"
set "HELPER_SCRIPT=%INSTALL_DIR%\open_pdf.bat"

REM Check if Chrome exists
if not exist "%CHROME_PATH%" (
    echo Chrome not found at %CHROME_PATH%
    echo Please edit this script to point to your browser.
    pause
    exit /b 1
)

REM Normalize APP_PATH to use forward slashes for URL
set "APP_URL=file:///%APP_PATH:\=/%"

REM ============================================================================
REM 1. Create Start Menu Shortcut
REM ============================================================================

set "SHORTCUT_NAME=Simple PDF Reader.lnk"
set "START_MENU=%APPDATA%\Microsoft\Windows\Start Menu\Programs"

echo Creating Start Menu shortcut...

REM Command arguments for the shortcut
set "ARGS=--user-data-dir=\"%USER_DATA_DIR%\" --allow-file-access-from-files --app=\"%APP_URL%\" --start-maximized"

powershell -command ^
 "$WSh = New-Object -ComObject WScript.Shell;" ^
 "$Shortcut = $WSh.CreateShortcut('%START_MENU%\%SHORTCUT_NAME%');" ^
 "$Shortcut.TargetPath = '%CHROME_PATH%';" ^
 "$Shortcut.Arguments = '%ARGS%';" ^
 "$Shortcut.IconLocation = '%ICON_PATH%';" ^
 "$Shortcut.WindowStyle = 3;" ^
 "$Shortcut.Save();"

echo Shortcut created in Start Menu.

REM ============================================================================
REM 2. Register as Default App
REM ============================================================================

echo Registering Simple PDF Reader as a PDF handler...

REM Create ProgID in HKCU (Current User)
reg add "HKCU\Software\Classes\SimplePDFReader.PDF" /ve /d "Simple PDF Document" /f
reg add "HKCU\Software\Classes\SimplePDFReader.PDF\DefaultIcon" /ve /d "%ICON_PATH%" /f

REM Command to run when opening a file - use helper script to encode file path
reg add "HKCU\Software\Classes\SimplePDFReader.PDF\shell\open\command" /ve /d "\"%HELPER_SCRIPT%\" \"%%1\"" /f

REM Associate .pdf
REM Note: Windows 10/11 might prevent changing the default app programmatically.
REM This sets the preference, but the user might still need to confirm.
reg add "HKCU\Software\Classes\.pdf" /ve /d "SimplePDFReader.PDF" /f

REM Add to OpenWithProgids to ensure it appears in "Open With" list
reg add "HKCU\Software\Classes\.pdf\OpenWithProgids" /v "SimplePDFReader.PDF" /t REG_NONE /f

echo.
echo ============================================================================
echo Installation Complete!
echo ============================================================================
echo.
echo 1. A shortcut "Simple PDF Reader" has been added to your Start Menu.
echo.
echo 2. To set as default PDF viewer:
echo    - If Windows asks, select "Simple PDF Reader".
echo    - Or Right Click a PDF -> Open With -> Choose another app -> Select Simple PDF Reader -> Always.
echo.
pause
