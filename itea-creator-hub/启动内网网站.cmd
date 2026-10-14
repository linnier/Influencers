@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 请先安装 Node.js 24，再重新打开本文件。
  pause
  exit /b 1
)
node setup-local.mjs
pause
