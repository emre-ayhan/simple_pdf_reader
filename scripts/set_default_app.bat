@echo off
setlocal

REM Paths
set "CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe"

REM Determine APP_PATH and ICON_PATH based on where the script is running
if exist "%~dp0index.html" (
    REM Running from dist folder
    set "APP_PATH=%~dp0index.html"
    set "ICON_PATH=%~dp0logo.ico"
) else (
    REM Running from scripts folder
    set "APP_PATH=%~dp0..\index.html"
    set "ICON_PATH=%~dp0..\logo.ico"
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

REM Command to run
REM We use the --allow-file-access-from-files flag to allow loading local PDFs
REM We use a separate user-data-dir to ensure the flags are applied even if Chrome is already open
set "USER_DATA_DIR=%LOCALAPPDATA%\SimplePDFReaderData"
set "COMMAND=\"%CHROME_PATH%\" --user-data-dir=\"%USER_DATA_DIR%\" --allow-file-access-from-files --app=\"%APP_URL%?file=%%1\""

echo Registering Simple PDF Reader...

REM Create ProgID in HKCU (Current User)
reg add "HKCU\Software\Classes\SimplePDFReader.PDF" /ve /d "Simple PDF Document" /f
reg add "HKCU\Software\Classes\SimplePDFReader.PDF\DefaultIcon" /ve /d "%ICON_PATH%" /f
reg add "HKCU\Software\Classes\SimplePDFReader.PDF\shell\open\command" /ve /d "%COMMAND%" /f

REM Associate .pdf
REM Note: Windows 10/11 might prevent changing the default app programmatically.
REM This sets the preference, but the user might still need to confirm.
reg add "HKCU\Software\Classes\.pdf" /ve /d "SimplePDFReader.PDF" /f

REM Add to OpenWithProgids to ensure it appears in "Open With" list
reg add "HKCU\Software\Classes\.pdf\OpenWithProgids" /v "SimplePDFReader.PDF" /t REG_NONE /f

echo.
echo Registration complete.
echo.
echo If Windows asks, select "Simple PDF Reader" as the default app.
echo You can also Right Click a PDF -^> Open With -^> Choose another app -^> Select Simple PDF Reader -^> Always.
echo.
pause
