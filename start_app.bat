@echo off
title CineTrack Movie App Launcher
echo ======================================================================
echo           Starting CineTrack Movie Recommender & Tracker
echo ======================================================================
echo.

set "ROOT_DIR=%~dp0"
cd /d "%ROOT_DIR%"

:: Find Python in virtual environment
if exist "%ROOT_DIR%\.venv\py314\Scripts\python.exe" (
    set "PYTHON_EXE=%ROOT_DIR%\.venv\py314\Scripts\python.exe"
) else (
    set "PYTHON_EXE=python"
)

echo [1/3] Launching Django REST backend on port 8000...
start "CineTrack Backend (Django API)" cmd /k "title CineTrack Backend && cd /d "%ROOT_DIR%" && "%PYTHON_EXE%" backend\manage.py runserver 0.0.0.0:8000"

echo [2/3] Launching React Vite frontend on port 5173...
start "CineTrack Frontend (React Vite)" cmd /k "title CineTrack Frontend && cd /d "%ROOT_DIR%\frontend" && npm.cmd run dev"

echo [3/3] Opening browser at http://localhost:5173 ...
timeout /t 3 /nobreak >nul
start http://localhost:5173

echo.
echo ======================================================================
echo   Both servers are now running!
echo   - Web App UI:     http://localhost:5173
echo   - Backend API:    http://localhost:8000/api/
echo.
echo   (You can minimize this window. Keep the backend and frontend
echo    console windows open while using the application.)
echo ======================================================================
echo.
pause

