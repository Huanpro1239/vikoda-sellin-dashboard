@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Skill\skill-bao-cao\scripts\run_target_report.ps1" -ProjectRoot "%~dp0."
if errorlevel 1 (
  echo.
  echo Tao Bao_Cao_Sell_in.xlsx that bai.
  pause
  exit /b 1
)
echo.
echo Da tao Bao_Cao_Sell_in.xlsx voi Target, Data va DMKH.
pause
endlocal
