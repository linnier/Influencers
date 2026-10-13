@echo off
setlocal
set "INFLUENCERS_PACKAGE_ROOT=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -Command "$ErrorActionPreference='Stop'; $bundle=$env:INFLUENCERS_PACKAGE_ROOT; Unblock-File -LiteralPath (Join-Path $bundle 'deploy/personal-start.ps1'); & (Join-Path $bundle 'deploy/personal-start.ps1')"
set "INFLUENCERS_EXIT_CODE=%ERRORLEVEL%"
pause
exit /b %INFLUENCERS_EXIT_CODE%
