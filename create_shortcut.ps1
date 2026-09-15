$desktop = [Environment]::GetFolderPath('Desktop')
$wscript = New-Object -ComObject WScript.Shell
$shortcutPath = Join-Path $desktop "CineTrack Movie App.lnk"
$shortcut = $wscript.CreateShortcut($shortcutPath)
$shortcut.TargetPath = (Resolve-Path ".\start_app.bat").Path
$shortcut.WorkingDirectory = (Get-Location).Path
$shortcut.Description = "Launch CineTrack Movie Recommender & Tracker"
$shortcut.Save()
Write-Host "Desktop shortcut created successfully at: $shortcutPath"

