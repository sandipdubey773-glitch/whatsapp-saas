@echo off
title Shivangi Auto Clinic - System Start
color 0A

echo.
echo  ==========================================
echo   Shivangi Auto Clinic - Starting...
echo  ==========================================
echo.

REM Step 1: Backend server start karo
echo  [1/2] Server start ho raha hai...
start "WhatsApp Bot Server" cmd /k "cd /d C:\Users\My Pc\Desktop\whatsapp-saas\backend && node index.js"
timeout /t 8 /nobreak >nul

REM Step 2: Cloudflare tunnel start karo aur URL capture karo
echo  [2/2] Online link ban raha hai...
set CFBIN=C:\Users\My Pc\AppData\Roaming\npm\node_modules\cloudflared\bin\cloudflared.exe
set LOGFILE=C:\Users\My Pc\Desktop\whatsapp-saas\tunnel-quick.log
del /f /q "%LOGFILE%" >nul 2>&1
start /B "" "%CFBIN%" tunnel --url http://localhost:3000 > "%LOGFILE%" 2>&1
timeout /t 15 /nobreak >nul

REM Step 3: URL nikalo aur WhatsApp pe bhejo
for /f "delims=" %%a in ('findstr "trycloudflare" "%LOGFILE%"') do set LASTLINE=%%a
echo  URL mili: %LASTLINE%

REM Node se WhatsApp pe URL bhejo aur file mein save karo
node -e "const axios=require('axios');const fs=require('fs');const line='%LASTLINE%';const m=line.match(/https:\/\/[^\s]+trycloudflare[^\s]+/);if(m){const url=m[0];fs.writeFileSync('C:\\Users\\My Pc\\Desktop\\whatsapp-saas\\backend\\tunnel-url.txt',url);console.log('URL saved to file:',url);axios.post('http://localhost:3000/booking/send-msg',{to:'9327363931',text:'🌐 *Shivangi Dashboard Link*\n\n'+url+'/booking/\n\n✅ System online hai\n📋 Team calling dashboard ready'},{headers:{'Content-Type':'application/json'}}).then(()=>console.log('URL sent!')).catch(e=>console.log('Send error:',e.message));}"

echo.
echo  ==========================================
echo   System ready! URL WhatsApp pe bhej di.
echo  ==========================================
echo.
pause
