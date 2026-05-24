@echo off
title Deploy to Railway
color 0B
echo.
echo  ==========================================
echo   Railway.app Deployment
echo  ==========================================
echo.

REM Check if Railway CLI installed
where railway >nul 2>&1
if errorlevel 1 (
  echo  Railway CLI install ho raha hai...
  npm install -g @railway/cli
)

echo.
echo  Railway mein login karo...
cd /d "%~dp0backend"
railway login
echo.
echo  Project create/link kar rahe hain...
railway init
echo.
echo  Environment variables set karo Railway dashboard mein:
echo  ADMIN_TOKEN = ShivangiSaaS@2026
echo  PORT = 3000
echo.
echo  Deploy ho raha hai...
railway up
echo.
echo  ==========================================
echo   Deploy complete! Railway URL copy karo
echo   aur frontend ki VITE_API_URL mein daalo
echo  ==========================================
echo.
pause
