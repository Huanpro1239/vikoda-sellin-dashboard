@echo off
setlocal
title VIKODA - AUTO WATCHER SHAREPOINT
for %%I in ("%~dp0..") do set "PROJECT_ROOT=%%~fI"
set "WATCHER_PS=%PROJECT_ROOT%\code\Skill\skill-bao-cao\scripts\auto_watch_sharepoint.ps1"

cd /d "%PROJECT_ROOT%"
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%WATCHER_PS%" -ProjectRoot "%PROJECT_ROOT%"
pause
