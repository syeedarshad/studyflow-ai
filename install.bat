@echo off
title StudyFlow AI - Setup
color 0A
cls

echo.
echo  =============================================
echo    STUDYFLOW AI - Installation Script
echo  =============================================
echo.

:: Check Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] Node.js not found!
    echo  Please install Node.js from https://nodejs.org
    echo  Required: Node.js v18 or higher
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node --version') do set NODE_VER=%%i
echo  [OK] Node.js found: %NODE_VER%

:: Check npm
npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] npm not found. Reinstall Node.js.
    pause
    exit /b 1
)

echo  [OK] npm found
echo.
echo  Installing dependencies...
echo  (This may take 2-5 minutes on first run)
echo.

cd frontend
npm install

if %errorlevel% neq 0 (
    echo.
    echo  [ERROR] Installation failed.
    echo  Try running as Administrator, or run:
    echo    npm install --build-from-source
    echo.
    pause
    exit /b 1
)

echo.
echo  =============================================
echo    Installation complete!
echo  =============================================
echo.
echo  To START the app:   npm start
echo  To BUILD exe:       npm run build
echo.
echo  Starting StudyFlow AI now...
echo.
npm start
