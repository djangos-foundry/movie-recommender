@echo off
title CineTrack Backend Server
set "ROOT_DIR=%~dp0"
cd /d "%ROOT_DIR%"

if exist "%ROOT_DIR%\.venv\py314\Scripts\python.exe" (
    set "PYTHON_EXE=%ROOT_DIR%\.venv\py314\Scripts\python.exe"
) else (
    set "PYTHON_EXE=python"
)

echo Starting CineTrack Django API Server on http://localhost:8000/api/ ...
"%PYTHON_EXE%" backend\manage.py runserver 0.0.0.0:8000
pause

