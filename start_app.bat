@echo off
title CineTrack Movie App
setlocal

set "ROOT_DIR=%~dp0"
cd /d "%ROOT_DIR%"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
"$rootDir = '%ROOT_DIR%'.TrimEnd('\'); " ^
"Write-Host '======================================================================' -ForegroundColor Cyan; " ^
"Write-Host '          Starting CineTrack Movie Recommender & Tracker             ' -ForegroundColor Yellow; " ^
"Write-Host '======================================================================' -ForegroundColor Cyan; " ^
"Write-Host ''; " ^
"Write-Host '[1/4] Checking and freeing ports 8000 & 5173...' -ForegroundColor Gray; " ^
"foreach ($port in @(8000, 5173)) { " ^
"    $pids = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; " ^
"    foreach ($p in $pids) { if ($p -and $p -ne $PID) { taskkill /F /T /PID $p 2>$null | Out-Null } } " ^
"} " ^
"$pyExe = \"$rootDir\.venv\py314\Scripts\python.exe\"; " ^
"if (-not (Test-Path $pyExe)) { $pyExe = 'python' }; " ^
"Write-Host '[2/4] Ensuring database migrations are applied...' -ForegroundColor Gray; " ^
"& $pyExe \"$rootDir\backend\manage.py\" migrate --noinput | Out-Null; " ^
"Write-Host '[3/4] Launching backend (port 8000) & frontend (port 5173)...' -ForegroundColor Gray; " ^
"$backend = Start-Process -FilePath $pyExe -ArgumentList \"\"\"$rootDir\backend\manage.py\"\" runserver 0.0.0.0:8000\" -WorkingDirectory $rootDir -PassThru -WindowStyle Hidden; " ^
"$frontend = Start-Process -FilePath 'npm.cmd' -ArgumentList 'run dev' -WorkingDirectory \"$rootDir\frontend\" -PassThru -WindowStyle Hidden; " ^
"Write-Host '[4/4] Opening browser at http://localhost:5173 ...' -ForegroundColor Gray; " ^
"Start-Sleep -Seconds 3; " ^
"Start-Process 'http://localhost:5173'; " ^
"Write-Host ''; " ^
"Write-Host '======================================================================' -ForegroundColor Green; " ^
"Write-Host '  CineTrack is now running!' -ForegroundColor Green; " ^
"Write-Host '  - Web UI:      http://localhost:5173' -ForegroundColor White; " ^
"Write-Host '  - Backend API: http://localhost:8000/api/' -ForegroundColor White; " ^
"Write-Host '======================================================================' -ForegroundColor Green; " ^
"Write-Host '  Servers are running in this window.' -ForegroundColor Cyan; " ^
"Write-Host '  Press [Q] or close this window to STOP all servers and exit.' -ForegroundColor Yellow; " ^
"Write-Host '======================================================================' -ForegroundColor Green; " ^
"Write-Host ''; " ^
"try { " ^
"    while ($true) { " ^
"        if ([Console]::KeyAvailable) { " ^
"            $key = [Console]::ReadKey($true); " ^
"            if ($key.Key -eq [ConsoleKey]::Q -or $key.Key -eq [ConsoleKey]::Escape) { break }; " ^
"        } " ^
"        Start-Sleep -Milliseconds 250; " ^
"        if ($backend.HasExited -or $frontend.HasExited) { break }; " ^
"    } " ^
"} finally { " ^
"    Write-Host 'Stopping CineTrack servers...' -ForegroundColor Yellow; " ^
"    if ($backend -and -not $backend.HasExited) { taskkill /F /T /PID $backend.Id 2>$null | Out-Null }; " ^
"    if ($frontend -and -not $frontend.HasExited) { taskkill /F /T /PID $frontend.Id 2>$null | Out-Null }; " ^
"    foreach ($port in @(8000, 5173)) { " ^
"        $pids = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; " ^
"        foreach ($p in $pids) { if ($p -and $p -ne $PID) { taskkill /F /T /PID $p 2>$null | Out-Null } } " ^
"    } " ^
"    Write-Host 'All servers stopped. Goodbye!' -ForegroundColor Green; " ^
"    Start-Sleep -Seconds 1; " ^
"}"
