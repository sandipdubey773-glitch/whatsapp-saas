@echo off
title WhatsApp SaaS — Stopping...
color 0C
echo.
echo  ==========================================
echo   WhatsApp SaaS — Stopping Services
echo  ==========================================
echo.
echo  Backend (PM2) band ho raha hai...
pm2 stop whatsapp-saas >nul 2>&1
echo  Frontend band ho raha hai...
taskkill /f /im cmd.exe /fi "WINDOWTITLE eq WhatsApp SaaS*" >nul 2>&1
echo  Done! Sab services band ho gayi.
echo.
pause
