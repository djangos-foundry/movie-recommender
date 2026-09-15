@echo off
title CineTrack Frontend Server
set "ROOT_DIR=%~dp0"
cd /d "%ROOT_DIR%\frontend"

echo Starting CineTrack React Vite Server on http://localhost:5173 ...
npm.cmd run dev
pause

