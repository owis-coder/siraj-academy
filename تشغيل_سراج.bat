@echo off
title Siraj Educational Academy
cd /d "%~dp0"

echo ========================================================
echo        Siraj Educational Academy - Launcher
echo ========================================================
echo.

echo [1/4] Ensuring Database Service is Running (PostgreSQL)...
start "Siraj DB (PostgreSQL)" /min wsl -u root bash -c "service postgresql start && sleep infinity"

echo [2/4] Starting Backend Server (apps/server on Port 4000)...
start "Siraj Server (:4000)" /D "%~dp0apps\server" cmd /k "npm run dev"

echo [3/4] Starting Frontend Web (apps/web on Port 5173)...
start "Siraj Web (:5173)" /D "%~dp0apps\web" cmd /k "npm run dev"

echo [4/4] Waiting for servers to initialize...
ping -n 4 127.0.0.1 >nul

echo Opening browser at http://localhost:5173 ...
start http://localhost:5173

echo.
echo ========================================================
echo   Platform launched successfully!
echo   Website URL: http://localhost:5173
echo   Admin: admin@siraj.sa / Siraj@2026Admin
echo ========================================================
echo.
echo You can minimize or close this launcher window.
ping -n 5 127.0.0.1 >nul
