@echo off
title CineTrack Movie App Launcher
setlocal EnableDelayedExpansion

set "ROOT_DIR=%~dp0"
cd /d "%ROOT_DIR%"

echo ======================================================================
echo           Starting CineTrack Movie Recommender & Tracker
echo ======================================================================
echo.

:: 1. Clear any leftover processes on ports 8000 & 5173
echo [1/4] Ensuring ports 8000 and 5173 are free...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000" ^| findstr "LISTENING"') do (
    taskkill /F /T /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173" ^| findstr "LISTENING"') do (
    taskkill /F /T /PID %%a >nul 2>&1
)

:: 2. Find Python virtual environment
if exist "%ROOT_DIR%\.venv\py314\Scripts\python.exe" (
    set "PYTHON_EXE=%ROOT_DIR%\.venv\py314\Scripts\python.exe"
) else (
    set "PYTHON_EXE=python"
)

:: 3. Run database migrations
echo [2/4] Verifying database schema...
"%PYTHON_EXE%" backend\manage.py migrate --noinput

:: 4. Start backend and frontend in background of this window
echo [3/4] Launching Django API (port 8000) and React Vite (port 5173)...
start /b "" "%PYTHON_EXE%" backend\manage.py runserver 0.0.0.0:8000
start /b "" cmd /c "cd /d "%ROOT_DIR%\frontend" && npm.cmd run dev"

:: 5. Open browser
echo [4/4] Opening browser at http://localhost:5173 ...
timeout /t 3 /nobreak >nul
start http://localhost:5173

echo.
echo ======================================================================
echo   CineTrack is now running!
echo   - Web UI:      http://localhost:5173
echo   - Backend API: http://localhost:8000/api/
echo.
echo   Both servers are running inside this single terminal.
echo   When you are done, press any key or close this window to STOP all servers.
echo ======================================================================
echo.

:: Keep window open until user presses a key or closes terminal
pause >nul

echo.
echo Stopping CineTrack servers...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000" ^| findstr "LISTENING"') do (
    taskkill /F /T /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173" ^| findstr "LISTENING"') do (
    taskkill /F /T /PID %%a >nul 2>&1
)
echo All servers stopped cleanly.
timeout /t 2 /nobreak >nul
