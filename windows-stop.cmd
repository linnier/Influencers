@echo off
setlocal
set "INFLUENCERS_PACKAGE_ROOT=%~dp0"
powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -Command "$ErrorActionPreference='Stop'; $bundle=$env:INFLUENCERS_PACKAGE_ROOT; Get-ChildItem -LiteralPath (Join-Path $bundle 'deploy') -Filter 'windows-*.ps1' | Unblock-File; & (Join-Path $bundle 'deploy/windows-stop.ps1')"
set "INFLUENCERS_EXIT_CODE=%ERRORLEVEL%"
pause
exit /b %INFLUENCERS_EXIT_CODE%
