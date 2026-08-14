@echo off
setlocal EnableExtensions DisableDelayedExpansion

for %%I in ("%~dp0..") do set "project_root=%%~fI"
cd /d "%project_root%"
set "portable_exe=%project_root%\code\Skill\sell-in-monthly\assets\portable\TachDataPortable.exe"
set "portable_script=%project_root%\code\Skill\sell-in-monthly\scripts\portable_sell_in.py"

if not exist "%project_root%\code" (
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
    echo  Khong tim thay: %project_root%\code
    echo ============================================================
    pause
    exit /b 3
)

set "portable_options="
if defined TACH_DATA_OUTPUT set portable_options=%portable_options% --output-dir "%TACH_DATA_OUTPUT%"
if defined TACH_DATA_LOG_DIR set portable_options=%portable_options% --log-dir "%TACH_DATA_LOG_DIR%"
rem TACH_DATA_DRIVE_FOLDER_ID va TACH_DATA_RCLONE do portable_sell_in.py tu doc,
rem khong can truyen. Dat TACH_DATA_SKIP_DRIVE=1 khi chi muon tao file cuc bo.
if "%TACH_DATA_SKIP_DRIVE%"=="1" set portable_options=%portable_options% --skip-google-drive

echo Starting portable Tach data...
if "%TACH_DATA_SKIP_DRIVE%"=="1" (
    echo Google Drive: skipped by TACH_DATA_SKIP_DRIVE=1.
) else (
    echo Google Drive: tai len thu muc dung chung bang rclone.
    echo   May nay KHONG can cai Google Drive for Desktop.
    echo   Can rclone.exe va mot lan "rclone config" - doc references\google-drive-rclone.md
)
echo.

set "portable_python="
set "py_launcher="

if not "%TACH_DATA_FORCE_EXE%"=="1" call :find_python

if defined portable_python goto run_python
if defined py_launcher goto run_py_launcher
goto run_exe

:run_python
if not exist "%portable_script%" (
    echo Portable Python script was not found:
    echo %portable_script%
    set "exit_code=2"
    goto portable_done
)
echo Runtime: signed/allowed Python
echo %portable_python%
echo.
"%portable_python%" "%portable_script%" --project-root "%project_root%" %portable_options% %*
set "exit_code=%ERRORLEVEL%"
goto portable_done

:run_py_launcher
if not exist "%portable_script%" (
    echo Portable Python script was not found:
    echo %portable_script%
    set "exit_code=2"
    goto portable_done
)
echo Runtime: Python launcher
echo %py_launcher% -3
echo.
"%py_launcher%" -3 "%portable_script%" --project-root "%project_root%" %portable_options% %*
set "exit_code=%ERRORLEVEL%"
goto portable_done

:run_exe
if not exist "%portable_exe%" (
    echo Portable executable was not found and no compatible Python was detected:
    echo %portable_exe%
    set "exit_code=2"
    goto portable_done
)
echo Runtime: portable EXE
echo.
"%portable_exe%" --project-root "%project_root%" %portable_options% %*
set "exit_code=%ERRORLEVEL%"
if not "%exit_code%"=="0" (
    echo.
    echo If Windows reports Device Guard or Enterprise signing level:
    echo - This EXE must be signed with an organization-trusted certificate, or
    echo - IT must allow-list its SHA-256, or
    echo - Install an approved Python 3 runtime with openpyxl and run this launcher again.
)
goto portable_done

:portable_done
echo.
if not "%exit_code%"=="0" (
    echo Portable Tach data failed with exit code %exit_code%.
    echo Review the message above, close any open output workbook, then run again.
) else (
    echo Portable Tach data completed successfully.
)

if not defined TACH_DATA_NO_PAUSE pause
exit /b %exit_code%

:find_python
call :check_python "%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
for /d %%D in ("%LOCALAPPDATA%\Programs\Python\Python3*") do (
    if not defined portable_python call :check_python "%%~fD\python.exe"
)
for /d %%D in ("%ProgramFiles%\Python3*") do (
    if not defined portable_python call :check_python "%%~fD\python.exe"
)
call :check_python "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
for /f "delims=" %%P in ('where python.exe 2^>nul') do (
    if not defined portable_python call :check_python "%%~fP"
)
if not defined portable_python (
    for /f "delims=" %%P in ('where py.exe 2^>nul') do (
        if not defined py_launcher call :check_py_launcher "%%~fP"
    )
)
exit /b 0

:check_python
if defined portable_python exit /b 0
if not exist "%~1" exit /b 0
"%~1" -c "import openpyxl" >nul 2>&1
if errorlevel 1 exit /b 0
set "portable_python=%~1"
exit /b 0

:check_py_launcher
if defined py_launcher exit /b 0
if not exist "%~1" exit /b 0
"%~1" -3 -c "import openpyxl" >nul 2>&1
if errorlevel 1 exit /b 0
set "py_launcher=%~1"
exit /b 0
