@echo off
setlocal
cd /d "%~dp0"

echo.
echo === Painel CRM - Iniciando Backend, Frontend e Recorrencia ===
echo.

REM Docker: nao usar "docker ps" direto no batch — sem daemon ele pode travar varios minutos.
echo [1/4] Verificando Docker e PostgreSQL...
set "DOCKPF="
for /f "delims=" %%i in ('powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\docker-preflight.ps1"') do set "DOCKPF=%%i"
if "%DOCKPF%"=="" (
    echo     Nao foi possivel verificar Docker ^(PowerShell^). Pulando docker-compose.
    echo.
    goto :after_postgres
)
if "%DOCKPF%"=="NODOCKER" (
    echo     Docker nao esta no PATH. Pulando container. Configure DATABASE_URL no .env para seu Postgres.
    echo.
    goto :after_postgres
)
if "%DOCKPF%"=="TIMEOUT" (
    echo     Docker nao respondeu ^(timeout 12s^). Inicie o Docker Desktop e rode start.bat de novo,
    echo     ou aponte DATABASE_URL no .env para um PostgreSQL local na porta 5432.
    echo.
    goto :after_postgres
)
if "%DOCKPF%"=="RUNNING" (
    echo     Container painelcrm_postgres ja esta rodando.
    echo.
    goto :after_postgres
)
echo     Subindo PostgreSQL ^(docker-compose up -d postgres^)...
docker-compose up -d postgres
if %errorlevel% neq 0 (
    echo     ERRO ao subir o container. Verifique Docker Desktop e docker-compose.yml
    echo.
) else (
    timeout /t 3 /nobreak >nul
    echo.
)
:after_postgres

REM Instalar dependencias se faltar
if not exist "packages\backend\node_modules" (
    echo [2/4] Instalando dependencias do backend...
    cd packages\backend
    call npm install
    cd ..\..
    echo.
)
if not exist "node_modules" (
    echo [2/4] Instalando dependencias do frontend...
    call npm install
    echo.
)

if exist "packages\backend\node_modules" if exist "node_modules" (
    echo [2/4] Dependencias OK.
    echo.
)

REM Backend em nova janela
echo [3/4] Abrindo Backend (http://localhost:3001)...
start "Backend - PainelCRM" cmd /k "cd /d "%~dp0packages\backend" && npm run dev"
timeout /t 2 /nobreak >nul

REM Frontend em nova janela
echo [3/4] Abrindo Frontend...
start "Frontend - PainelCRM" cmd /k "cd /d "%~dp0" && npm run dev"
timeout /t 2 /nobreak >nul

REM Recorrencia: scheduler em loop (executa e dorme 60s)
echo [4/4] Abrindo Billing Scheduler...
start "Billing Scheduler - PainelCRM" powershell -NoExit -NoProfile -ExecutionPolicy Bypass -Command ^
  "Set-Location -LiteralPath '%~dp0packages\backend'; while ($true) { npm run billing:scheduler; Start-Sleep -Seconds 60 }"
timeout /t 2 /nobreak >nul

REM Recorrencia: worker em loop (executa e dorme 15s)
echo [4/4] Abrindo Billing Worker...
start "Billing Worker - PainelCRM" powershell -NoExit -NoProfile -ExecutionPolicy Bypass -Command ^
  "Set-Location -LiteralPath '%~dp0packages\backend'; while ($true) { npm run billing:worker; Start-Sleep -Seconds 15 }"

echo.
echo === Pronto! ===
echo.
echo   Backend:  http://localhost:3001
echo   Frontend: http://localhost:5173  ou  http://localhost:8080  (conforme .env / vite)
echo   Health:   http://localhost:3001/health
echo.
echo   Recorrencia: janelas "Billing Scheduler" e "Billing Worker"
echo.
echo Feche as janelas "Backend", "Frontend", "Billing Scheduler" e "Billing Worker" para parar.
echo.
echo Se aparecer "porta 3001 em uso": execute .\kill-port-3001.bat (PowerShell) e nao inicie
echo o backend em dois lugares (apenas esta janela OU apenas um terminal).
echo.
pause
