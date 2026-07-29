@echo off
setlocal

for %%I in ("%~dp0..") do set "PROJECT_ROOT=%%~fI"
cd /d "%PROJECT_ROOT%"
echo Starting Tach data...
echo.

"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%PROJECT_ROOT%\code\Skill\sell-in-monthly\scripts\run_sell_in.ps1" -ProjectRoot "%PROJECT_ROOT%" %*
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
