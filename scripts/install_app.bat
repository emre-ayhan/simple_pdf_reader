@echo off
setlocal

REM ============================================================================
REM Simple PDF Reader - Installation Script
REM ============================================================================

REM Paths
set "CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe"
set "USER_DATA_DIR=%LOCALAPPDATA%\SimplePDFReaderData"

REM Determine APP_PATH and ICON_PATH based on where the script is running
if exist "%~dp0index.html" (
    REM Running from dist folder
    set "APP_PATH=%~dp0index.html"
    set "ICON_PATH=%~dp0logo.ico"
    set "HELPER_SCRIPT=%~dp0open_pdf.bat"
) else (
    REM Running from scripts folder
    set "APP_PATH=%~dp0..\index.html"
    set "ICON_PATH=%~dp0..\logo.ico"
    set "HELPER_SCRIPT=%~dp0open_pdf.bat"
)

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
