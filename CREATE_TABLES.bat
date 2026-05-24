@echo off
title Create Tables — Last Step!
color 0A
echo.
echo  ==========================================
echo   Last Step — Tables Banana (1 minute)
echo  ==========================================
echo.
echo  SQL Editor khul raha hai...
start https://supabase.com/dashboard/project/dmyfbklrahhjrbelumgi/sql/new
echo.
echo  Yeh SQL COPY karo (Ctrl+A phir Ctrl+C):
echo.
type "%~dp0SUPABASE_TABLES.sql"
echo.
echo  ==========================================
echo  SQL Editor mein:
echo  1. Sab select karo (Ctrl+A)
echo  2. Delete karo
echo  3. Apna SQL paste karo (Ctrl+V)
echo  4. "RUN" button dabao (ya F5)
echo  ==========================================
echo.
pause
