@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 20 or newer, then run this launcher again.
  pause
  exit /b 1
)
echo Open http://127.0.0.1:5173 in your browser.
echo Keep this window open while using Myths Map.
call npm run dev
pause
