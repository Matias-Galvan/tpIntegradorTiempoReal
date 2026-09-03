@echo off
echo ====================================================================
echo  Iniciando GAMA Server Headless en modo WebSocket (Puerto 6868)...
echo ====================================================================
cd /d "C:\Users\matia\AppData\Local\Programs\Gama\headless"
gama-headless.bat -socket 6868
pause

