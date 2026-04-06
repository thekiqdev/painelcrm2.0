@echo off
setlocal
cd /d "%~dp0"

echo.
echo === Painel CRM - Iniciando Backend e Frontend ===
echo.

REM Docker: subir PostgreSQL se nao estiver rodando
docker ps 2>nul | findstr /C:"painelcrm_postgres" >nul 2>&1
if %errorlevel% neq 0 (
    echo [1/3] Iniciando PostgreSQL...
    docker-compose up -d postgres
    timeout /t 3 /nobreak >nul
    echo.
) else (
    echo [1/3] PostgreSQL ja esta rodando.
    echo.
)

REM Instalar dependencias se faltar
if not exist "packages\backend\node_modules" (
    echo [2/3] Instalando dependencias do backend...
    cd packages\backend
    call npm install
    cd ..\..
    echo.
)
if not exist "node_modules" (
    echo [2/3] Instalando dependencias do frontend...
    call npm install
    echo.
)

if exist "packages\backend\node_modules" if exist "node_modules" (
    echo [2/3] Dependencias OK.
    echo.
)

REM Backend em nova janela
echo [3/3] Abrindo Backend (http://localhost:3001)...
start "Backend - PainelCRM" cmd /k "cd /d "%~dp0packages\backend" && npm run dev"
timeout /t 2 /nobreak >nul

REM Frontend em nova janela
echo [3/3] Abrindo Frontend...
start "Frontend - PainelCRM" cmd /k "cd /d "%~dp0" && npm run dev"

echo.
echo === Pronto! ===
echo.
echo   Backend:  http://localhost:3001
echo   Frontend: http://localhost:5173  ou  http://localhost:8080  (conforme .env / vite)
echo   Health:   http://localhost:3001/health
echo.
echo Feche as janelas "Backend" e "Frontend" para parar.
echo.
echo Se aparecer "porta 3001 em uso": execute .\kill-port-3001.bat (PowerShell) e nao inicie
echo o backend em dois lugares (apenas esta janela OU apenas um terminal).
echo.
pause
