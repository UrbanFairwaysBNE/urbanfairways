@echo off
REM ============================================================
REM UF Bay Controller Watchdog (single-check)
REM ============================================================
REM Run by the "UF Bay Controller Watchdog" scheduled task, which
REM the installer creates automatically (every 1 minute).
REM Each run performs ONE check: if the controller process is not
REM running, it starts it. No loop - Task Scheduler handles repeat.
REM
REM Manual setup (only if the task was removed):
REM   schtasks /Create /F /SC MINUTE /MO 1 ^
REM     /TN "UF Bay Controller Watchdog" ^
REM     /TR "\"C:\path\to\watchdog.bat\"" /RL HIGHEST
REM ============================================================

set "PROCESS_NAME=UF Bay Controller.exe"
set "APP_PATH=%LOCALAPPDATA%\Programs\UF Bay Controller\UF Bay Controller.exe"
if not exist "%APP_PATH%" set "APP_PATH=%ProgramFiles%\UF Bay Controller\UF Bay Controller.exe"

set "LOG_DIR=%LOCALAPPDATA%\uf-bay-controller"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"
set "LOG_FILE=%LOG_DIR%\watchdog.log"

tasklist /FI "IMAGENAME eq %PROCESS_NAME%" 2>NUL | find /I "%PROCESS_NAME%" >NUL
if %ERRORLEVEL% EQU 0 goto :eof

echo [%date% %time%] Process not found. Restarting: "%APP_PATH%" >> "%LOG_FILE%"
if not exist "%APP_PATH%" (
    echo [%date% %time%] ERROR: Executable not found at "%APP_PATH%" >> "%LOG_FILE%"
    goto :eof
)
start "" "%APP_PATH%"
echo [%date% %time%] Restart command issued. >> "%LOG_FILE%"
