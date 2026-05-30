@echo off
title Balatro MP Log Viewer
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js was not found.
  echo   Install it from https://nodejs.org  ^(the LTS version^), then run this file again.
  echo.
  pause
  exit /b 1
)

echo.
echo   Starting Balatro Multiplayer Log Viewer...
echo   Your browser will open at  http://localhost:4173
echo   Keep THIS window open while using the app. Close it (or Ctrl+C) to stop.
echo.
node server.js

echo.
echo   Server stopped. Press any key to close this window.
pause >nul
