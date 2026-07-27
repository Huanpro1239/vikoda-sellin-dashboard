@echo off
setlocal

cd /d "%~dp0"
echo Starting Tach data...
echo.

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Skill\sell-in-monthly\scripts\run_sell_in.ps1" %*
set "exit_code=%ERRORLEVEL%"

echo.
if not "%exit_code%"=="0" (
    echo Tach data failed with exit code %exit_code%.
    echo Review the message above, close any open output workbook, then run again.
) else (
    echo Tach data completed successfully.
)

if not defined TACH_DATA_NO_PAUSE pause
exit /b %exit_code%
