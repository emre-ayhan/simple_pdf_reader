@echo off
setlocal

REM Paths relative to folder where the script is run
set "CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe"
set "APP_PATH=%~dp0index.html"
set "ICON_PATH=%~dp0logo.ico"
set "SHORTCUT_NAME=Simple PDF Reader.lnk"
set "START_MENU=%APPDATA%\Microsoft\Windows\Start Menu\Programs"

echo Creating Start Menu shortcut...

powershell -command ^
 "$WSh = New-Object -ComObject WScript.Shell;" ^
 "$Shortcut = $WSh.CreateShortcut('%START_MENU%\%SHORTCUT_NAME%');" ^
 "$Shortcut.TargetPath = '%CHROME_PATH%';" ^
 "$Shortcut.Arguments = '--app=\"file:///%APP_PATH:\=/%\" --start-maximized --window-size=99999,99999';" ^
 "$Shortcut.IconLocation = '%ICON_PATH%';" ^
 "$Shortcut.WindowStyle = 3;" ^
 "$Shortcut.Save();"

echo Done! Shortcut created:
echo %START_MENU%\%SHORTCUT_NAME%
pause
endlocal