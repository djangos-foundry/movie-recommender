@echo off
title Stop CineTrack Servers
echo Stopping CineTrack background servers on ports 8000 and 5173...

:: Find and kill process on port 8000 (Django)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000" ^| findstr "LISTENING"') do (
    echo Stopping backend process PID %%a...
    taskkill /F /T /PID %%a >nul 2>&1
)

:: Find and kill process on port 5173 (Vite)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173" ^| findstr "LISTENING"') do (
    echo Stopping frontend process PID %%a...
    taskkill /F /T /PID %%a >nul 2>&1
)

echo All CineTrack servers stopped.
timeout /t 2 >nul

