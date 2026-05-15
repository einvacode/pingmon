@echo off
title PingMon Server
setlocal

echo ==========================================
echo    PingMon - Network Monitor Starter
echo ==========================================
echo.

:: Check for Node.js
node -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js tidak ditemukan! Silakan instal Node.js terlebih dahulu.
    pause
    exit /b
)

:: Check for node_modules
if not exist "node_modules\" (
    echo [INFO] Folder node_modules tidak ditemukan. Mengunduh library...
    call npm install
)

echo [INFO] Menjalankan server...
echo [INFO] Silakan buka http://localhost:3000 di browser Anda.
echo.

:: Start browser after a short delay
start http://localhost:3000

:: Run the server
node server.js

pause
