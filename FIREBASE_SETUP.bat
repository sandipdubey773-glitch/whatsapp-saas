@echo off
title Firebase Setup — 3 Steps
color 0B
echo.
echo  ==========================================
echo   Firebase Setup — Sirf 3 Steps!
echo  ==========================================
echo.
echo  STEP 1: Firebase Console khulega — New Project banao
echo  (ya existing project use karo)
echo.
pause
start https://console.firebase.google.com/
echo.
echo  Project ban gaya? ENTER dabaao...
pause
echo.
echo  STEP 2: Firestore Database enable karo
echo  (Left menu - Firestore Database - Create Database - Production mode - any region)
echo.
pause
echo.
echo  STEP 3: Service Account key generate karo
echo  (Project Settings - Service Accounts - Generate New Private Key - Download JSON)
echo.
pause
start https://console.firebase.google.com/project/_/settings/serviceaccounts/adminsdk
echo.
echo  JSON file download ho gayi?
echo  Ab 4_OPEN_ENV.bat chalao aur JSON file se yeh 3 values copy karo:
echo.
echo    project_id       =^> FIREBASE_PROJECT_ID
echo    client_email     =^> FIREBASE_CLIENT_EMAIL
echo    private_key      =^> FIREBASE_PRIVATE_KEY
echo.
pause
start notepad "%~dp0backend\.env"
