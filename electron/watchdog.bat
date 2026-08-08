@echo off
REM ============================================================
REM Bay Controller Watchdog
REM ============================================================
REM This script monitors the Bay Controller process and restarts
REM it automatically if it crashes or closes unexpectedly.
REM
REM SETUP (Windows Task Scheduler):
REM   1. Open Task Scheduler (taskschd.msc)
REM   2. Create Basic Task > Name: "Bay Controller Watchdog"
REM   3. Trigger: "When the computer starts" (or "At log on")
REM   4. Action: Start a program
REM      - Program: C:\path\to\watchdog.bat
REM   5. Check "Run with highest privileges"
REM   6. In Properties > Settings:
REM      - Uncheck "Stop the task if it runs longer than"
REM      - Check "If the task fails, restart every: 1 minute"
REM
REM The script checks every 30 seconds if the Bay Controller
REM process is running. If not, it restarts it.
REM ============================================================

REM --- Configuration ---
REM Update this path to match your installation
set "APP_PATH=%LOCALAPPDATA%\Programs\UF Bay Controller\UF Bay Controller.exe"
set "PROCESS_NAME=UF Bay Controller.exe"
set "CHECK_INTERVAL=30"

REM Log file for watchdog activity
set "LOG_FILE=%LOCALAPPDATA%\uf-bay-controller\watchdog.log"
if not exist "%LOCALAPPDATA%\uf-bay-controller" mkdir "%LOCALAPPDATA%\uf-bay-controller"

echo [%date% %time%] Watchdog started. Monitoring: %PROCESS_NAME% >> "%LOG_FILE%"

:loop
REM Check if process is running
tasklist /FI "IMAGENAME eq %PROCESS_NAME%" 2>NUL | find /I "%PROCESS_NAME%" >NUL

if %ERRORLEVEL% NEQ 0 (
    echo [%date% %time%] Process not found. Restarting... >> "%LOG_FILE%"
    
    REM Start the application
    start "" "%APP_PATH%"
    
    if %ERRORLEVEL% EQU 0 (
        echo [%date% %time%] Successfully restarted Bay Controller. >> "%LOG_FILE%"
    ) else (
        echo [%date% %time%] ERROR: Failed to start Bay Controller. >> "%LOG_FILE%"
    )
    
    REM Wait a bit longer after restart to let it initialize
    timeout /t 10 /nobreak >NUL
)

REM Wait before next check
timeout /t %CHECK_INTERVAL% /nobreak >NUL

goto loop
