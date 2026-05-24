@echo off
title WhatsApp SaaS — Setup
color 0A
echo.
echo  ==========================================
echo   WhatsApp SaaS — First Time Setup
echo  ==========================================
echo.
echo  [1/2] Backend dependencies install ho rahi hain...
cd /d "%~dp0backend"
call npm install
if errorlevel 1 (
  echo  [ERROR] Backend install failed!
  pause
  exit /b 1
)
echo  [1/2] Backend DONE!
echo.
echo  [2/2] Frontend dependencies install ho rahi hain...
cd /d "%~dp0frontend"
call npm install
if errorlevel 1 (
  echo  [ERROR] Frontend install failed!
  pause
  exit /b 1
)
echo  [2/2] Frontend DONE!
echo.
echo  ==========================================
echo   Setup complete!
echo   Ab 2_START.bat chalao
echo  ==========================================
echo.
pause
