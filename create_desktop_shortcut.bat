@echo off
set "SCRIPT_DIR=%~dp0"
set "TARGET_BAT=%SCRIPT_DIR%start_app.bat"
set "SHORTCUT_PATH=%USERPROFILE%\Desktop\CineTrack Movie App.lnk"

powershell -Command "$desk = [Environment]::GetFolderPath('Desktop'); $ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut((Join-Path $desk 'CineTrack Movie App.lnk')); $s.TargetPath = '%TARGET_BAT%'; $s.WorkingDirectory = '%SCRIPT_DIR%'; $s.Description = 'Launch CineTrack Movie Recommender & Tracker'; $s.Save(); Write-Host 'Desktop shortcut created successfully at: ' (Join-Path $desk 'CineTrack Movie App.lnk')"

pause

