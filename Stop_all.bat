@echo off
setlocal
title BinBotNow Stopper

echo [STOP] Cerrando procesos de BinBotNow...

REM Cierra por título exacto de las ventanas que abrimos con START
taskkill /FI "WINDOWTITLE eq BinBotNow_BACKEND" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq BinBotNow_WORKER"  /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq BinBotNow_DASHBOARD" /T /F >nul 2>&1

REM Como respaldo, intenta por ejecutable
taskkill /IM uvicorn.exe /F >nul 2>&1
taskkill /IM python.exe /F >nul 2>&1
taskkill /IM node.exe /F >nul 2>&1

echo [STOP] Listo.
exit /b 0
