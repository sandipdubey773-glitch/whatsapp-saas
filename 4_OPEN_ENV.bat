@echo off
title Edit .env File
echo  .env file Notepad mein khul rahi hai...
echo  Apni Firebase details aur ADMIN_TOKEN fill karo, phir Save karo.
notepad "%~dp0backend\.env"
