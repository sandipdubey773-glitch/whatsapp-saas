@echo off
title Supabase Setup — 3 Steps
color 0B
echo.
echo  ==========================================
echo   Supabase Setup — Free, No Scanner!
echo  ==========================================
echo.
echo  STEP 1: Supabase website khulega
echo  "Sign Up" karo — sirf email aur password chahiye
echo.
pause
start https://supabase.com
echo.
echo  Account ban gaya? ENTER dabaao...
pause
echo.
echo  STEP 2: New Project banao
echo  - "New Project" click karo
echo  - Name: whatsapp-saas
echo  - Password: koi bhi (yaad rakhna)
echo  - Region: closest to India (Singapore)
echo  - "Create Project" click karo (1-2 min lagega)
echo.
pause
echo.
echo  STEP 3: Tables banao — SQL Editor mein yeh paste karo
echo  (SQL Editor link khulega)
echo.
pause
start https://supabase.com/dashboard/project/_/sql/new
echo.
echo  Yeh SQL copy karo aur paste karo SQL Editor mein:
echo.
echo  --- COPY FROM HERE ---
echo.
type "%~dp0SUPABASE_TABLES.sql"
echo.
echo  --- COPY TILL HERE ---
echo.
echo  "Run" button dabao
echo.
pause
echo.
echo  STEP 4: API Keys lo
echo  (Project Settings - API khulega)
echo.
pause
start https://supabase.com/dashboard/project/_/settings/api
echo.
echo  Yahan se copy karo:
echo  - "Project URL"  =^> SUPABASE_URL
echo  - "anon public"  =^> SUPABASE_KEY
echo.
echo  Ab 4_OPEN_ENV.bat chalao aur yeh 2 values paste karo!
echo.
pause
start notepad "%~dp0backend\.env"
