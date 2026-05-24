@echo off
title WhatsApp SaaS — Starting...
color 0A
echo.
echo  ==========================================
echo   WhatsApp SaaS — Starting Services
echo  ==========================================
echo.

REM Backend — PM2 se start karo (auto-restart on crash)
echo  [1/2] Backend PM2 se start ho raha hai...
pm2 start "%~dp0backend\index.js" --name "whatsapp-saas" --restart-delay=5000 --max-restarts=50 2>nul || pm2 restart whatsapp-saas 2>nul
pm2 save >nul 2>&1

timeout /t 3 /nobreak >nul

echo  [2/2] Frontend start ho raha hai (port 5173)...
start "WhatsApp SaaS — FRONTEND" cmd /k "cd /d "%~dp0frontend" && npm run dev"

timeout /t 3 /nobreak >nul

echo.
echo  ==========================================
echo   Dono services chal rahi hain!
echo.
echo   Admin Panel: http://localhost:5173
echo   Backend:     http://localhost:3000/health
echo   PM2 status:  pm2 status
echo   PM2 logs:    pm2 logs whatsapp-saas
echo  ==========================================
echo.
echo  Band karne ke liye 3_STOP.bat chalao
echo.
pause
