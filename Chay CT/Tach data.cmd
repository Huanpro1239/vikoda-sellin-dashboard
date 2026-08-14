@echo off
setlocal

for %%I in ("%~dp0..") do set "PROJECT_ROOT=%%~fI"
set "RUNNER=%PROJECT_ROOT%\code\Skill\sell-in-monthly\scripts\run_sell_in.ps1"

if not exist "%RUNNER%" (
    echo.
    echo ============================================================
    echo  KHONG CHAY DUOC - THIEU PHAN CODE CUA DU AN
    echo ============================================================
    echo  Thu muc "Chay CT" chi la nut bam. Toan bo code, thu vien va
    echo  du lieu deu nam o thu muc CHA "Bao cao Sell in".
    echo.
    echo  May nay dang thieu phan code do chi copy moi "Chay CT".
    echo  Hay copy CA thu muc "Bao cao Sell in" sang may nay, roi chay
    echo  launcher trong "Chay CT" nam ben trong no.
    echo.
    echo  Khong tim thay: %RUNNER%
    echo ============================================================
    pause
    exit /b 3
)

cd /d "%PROJECT_ROOT%"
echo Starting Tach data...
echo.

"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%RUNNER%" -ProjectRoot "%PROJECT_ROOT%" %*
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
