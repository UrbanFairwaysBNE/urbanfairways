@echo off
echo ========================================
echo Bay Controller - Build Script
echo ========================================
echo.

:: Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed!
    echo Please install Node.js from https://nodejs.org
    pause
    exit /b 1
)

echo Step 1/4: Installing web app dependencies...
cd ..
call npm install
if %errorlevel% neq 0 (
    echo ERROR: Failed to install web app dependencies
    pause
    exit /b 1
)

echo.
echo Step 2/4: Building web app...
call npm run build
if %errorlevel% neq 0 (
    echo ERROR: Failed to build web app
    pause
    exit /b 1
)

echo.
echo Step 3/4: Installing Electron dependencies...
cd electron
call npm install
if %errorlevel% neq 0 (
    echo ERROR: Failed to install Electron dependencies
    pause
    exit /b 1
)

echo.
echo Step 4/4: Building Windows installer...
call npm run build
if %errorlevel% neq 0 (
    echo ERROR: Failed to build Windows installer
    pause
    exit /b 1
)

echo.
echo ========================================
echo BUILD COMPLETE!
echo ========================================
echo.
echo Your installer is ready at:
echo %cd%\dist-electron\
echo.
echo Look for "Bay Controller Setup 1.0.0.exe"
echo.
pause
