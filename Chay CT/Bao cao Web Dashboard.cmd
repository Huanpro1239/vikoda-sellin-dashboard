@echo off
setlocal
for %%I in ("%~dp0..") do set "PROJECT_ROOT=%%~fI"
set "EXPORTER=%PROJECT_ROOT%\code\Skill\skill-bao-cao\scripts\export_web_data.py"
set "HTML_INDEX=%PROJECT_ROOT%\web\index.html"

if not exist "%EXPORTER%" (
  echo.
  echo ============================================================
  echo  KHONG CHAY DUOC - THIEU PHAN CODE CUA DU AN
  echo ============================================================
  echo  Khong tim thay: %EXPORTER%
  echo ============================================================
  pause
  exit /b 3
)

pushd "%PROJECT_ROOT%" >nul 2>&1
if errorlevel 1 (
  echo Khong mo duoc thu muc du an: %PROJECT_ROOT%
  pause
  exit /b 2
)

echo Dang cap nhat du lieu Web Dashboard...
python "%EXPORTER%" --project-root "%PROJECT_ROOT%"
set "RC=%ERRORLEVEL%"
popd

if not "%RC%"=="0" (
  echo.
  echo Cap nhat du lieu Web that bai. Ma loi: %RC%
  pause
  exit /b %RC%
)

echo.
echo ============================================================
echo  HOAN TAT CAP NHAT WEB DASHBOARD!
echo ============================================================
echo  Dang mo Dashboard tren trinh duyet...
start "" "%HTML_INDEX%"
exit /b 0
