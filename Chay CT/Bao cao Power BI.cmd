@echo off
setlocal
for %%I in ("%~dp0..") do set "PROJECT_ROOT=%%~fI"
set "RUNNER=%PROJECT_ROOT%\code\Skill\skill-bao-cao\scripts\run_powerbi_dashboard.ps1"
set "POWERSHELL_EXE=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"

pushd "%PROJECT_ROOT%" >nul 2>&1
if errorlevel 1 (
  echo Khong mo duoc thu muc du an: %PROJECT_ROOT%
  pause
  exit /b 2
)

"%POWERSHELL_EXE%" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%RUNNER%" -ProjectRoot "%PROJECT_ROOT%" %*
set "RC=%ERRORLEVEL%"
popd

if not "%RC%"=="0" (
  echo.
  echo Tao dashboard Power BI that bai. Ma loi: %RC%
  if not defined TARGET_REPORT_NO_PAUSE pause
  exit /b %RC%
)
echo.
echo Da cap nhat goi Power BI trong Data\File bao cao\PowerBI.
echo Power BI Desktop dang mo project - bam Refresh de nap so lieu moi.
if not defined TARGET_REPORT_NO_PAUSE pause
exit /b 0
