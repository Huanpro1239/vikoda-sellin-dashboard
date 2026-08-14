@echo off
setlocal EnableExtensions DisableDelayedExpansion

for %%I in ("%~dp0..") do set "project_root=%%~fI"
cd /d "%project_root%"
set "runner=%project_root%\code\run_all_tests.py"

if not exist "%runner%" (
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
    echo  Khong tim thay: %runner%
    echo ============================================================
    pause
    exit /b 3
)

echo Chay toan bo test cua du an...
echo.

rem Test khong can openpyxl cai san: moi runner tu them ban vendored trong
rem code\Skill\skill-bao-cao\scripts\vendor vao sys.path.
set "python_exe="
call :check_python "%project_root%\.runtime\python\python.exe"
if not defined python_exe for /f "delims=" %%P in ('where python.exe 2^>nul') do (
    if not defined python_exe call :check_python "%%~fP"
)
if not defined python_exe for /f "delims=" %%P in ('where py.exe 2^>nul') do (
    if not defined python_exe set "python_exe=%%~fP" & set "python_args=-3"
)

if not defined python_exe (
    echo Khong tim thay Python 3. Cai Python 3 va tich "Add python.exe to PATH",
    echo hoac copy Python vao .runtime\python\python.exe trong thu muc du an.
    set "exit_code=2"
    goto done
)

set PYTHONUTF8=1
set PYTHONDONTWRITEBYTECODE=1
"%python_exe%" %python_args% "%runner%" %*
set "exit_code=%ERRORLEVEL%"

:done
echo.
if not "%exit_code%"=="0" (
    echo Kiem tra that bai. Ma loi: %exit_code%
    echo Doc phan bao loi o tren truoc khi trien khai hoac chuyen giao.
) else (
    echo Kiem tra hoan tat.
)

if not defined TACH_DATA_NO_PAUSE pause
exit /b %exit_code%

:check_python
if defined python_exe exit /b 0
if not exist "%~1" exit /b 0
set "python_exe=%~1"
set "python_args="
exit /b 0
