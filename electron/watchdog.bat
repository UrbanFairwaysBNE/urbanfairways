@echo off
REM ============================================================
REM UF Bay Controller Watchdog (single-check)
REM ============================================================
REM Run by the "UF Bay Controller Watchdog" scheduled task, which
REM the installer creates automatically (every 1 minute).
REM Each run performs ONE check: if the controller process is not
REM running, it starts it. No loop - Task Scheduler handles repeat.
REM
REM The exe path is resolved at runtime - never hardcode a
REM Windows user name (e.g. C:\Users\golf\...). Bay PCs use
REM different account names, so we probe LOCALAPPDATA first,
REM then Program Files, then every user profile on the machine.
REM
REM Manual setup (only if the task was removed):
REM   schtasks /Create /F /SC MINUTE /MO 1 ^
REM     /TN "UF Bay Controller Watchdog" ^
REM     /TR "\"C:\path\to\watchdog.bat\"" /RU "%USERNAME%" /IT
REM ============================================================

setlocal enabledelayedexpansion

set "PROCESS_NAME=UF Bay Controller.exe"
set "APP_PATH="

if exist "%LOCALAPPDATA%\Programs\UF Bay Controller\%PROCESS_NAME%" set "APP_PATH=%LOCALAPPDATA%\Programs\UF Bay Controller\%PROCESS_NAME%"
if not defined APP_PATH if exist "%ProgramFiles%\UF Bay Controller\%PROCESS_NAME%" set "APP_PATH=%ProgramFiles%\UF Bay Controller\%PROCESS_NAME%"
if not defined APP_PATH if exist "%ProgramFiles(x86)%\UF Bay Controller\%PROCESS_NAME%" set "APP_PATH=%ProgramFiles(x86)%\UF Bay Controller\%PROCESS_NAME%"

REM Last resort: scan every user profile (handles the task running as
REM SYSTEM or a different account than the one that installed the app).
if not defined APP_PATH (
    for /d %%U in ("%SystemDrive%\Users\*") do (
        if not defined APP_PATH if exist "%%~fU\AppData\Local\Programs\UF Bay Controller\%PROCESS_NAME%" set "APP_PATH=%%~fU\AppData\Local\Programs\UF Bay Controller\%PROCESS_NAME%"
    )
)

set "LOG_DIR=%LOCALAPPDATA%\uf-bay-controller"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%" 2>NUL
set "LOG_FILE=%LOG_DIR%\watchdog.log"

tasklist /FI "IMAGENAME eq %PROCESS_NAME%" 2>NUL | find /I "%PROCESS_NAME%" >NUL
if %ERRORLEVEL% EQU 0 goto :eof

if not defined APP_PATH (
    echo [%date% %time%] ERROR: UF Bay Controller executable not found in LOCALAPPDATA, Program Files or any user profile. >> "%LOG_FILE%"
    goto :eof
)

echo [%date% %time%] Process not found. Restarting: "%APP_PATH%" >> "%LOG_FILE%"
start "" "%APP_PATH%"
echo [%date% %time%] Restart command issued. >> "%LOG_FILE%"
