@echo off
setlocal enabledelayedexpansion

echo === Iniciando Sistema ===
echo.

REM Encontrar npm
echo [0/3] Procurando Node.js/npm...
set "NPM_CMD="

REM Verificar se npm esta no PATH e obter caminho completo
where npm >nul 2>&1
if %errorlevel% equ 0 (
    REM Obter caminho completo do npm
    for /f "delims=" %%i in ('where npm') do (
        set "NPM_CMD=%%i"
        echo       npm encontrado no PATH: !NPM_CMD!
        goto :found_npm
    )
)

REM Procurar em locais comuns
set "NODEJS_PATHS[0]=%ProgramFiles%\nodejs\npm.cmd"
set "NODEJS_PATHS[1]=%ProgramFiles(x86)%\nodejs\npm.cmd"
set "NODEJS_PATHS[2]=%LOCALAPPDATA%\Programs\nodejs\npm.cmd"
set "NODEJS_PATHS[3]=C:\Program Files\nodejs\npm.cmd"
set "NODEJS_PATHS[4]=C:\Program Files (x86)\nodejs\npm.cmd"

for /L %%i in (0,1,4) do (
    if exist "!NODEJS_PATHS[%%i]!" (
        set "NPM_CMD=!NODEJS_PATHS[%%i]!"
        echo       npm encontrado em: !NPM_CMD!
        goto :found_npm
    )
)

REM Se nao encontrou, tentar usar node para encontrar
where node >nul 2>&1
if %errorlevel% equ 0 (
    for /f "delims=" %%i in ('where node') do (
        set "NODE_PATH=%%i"
        set "NODE_DIR=%%~dpi"
        if exist "!NODE_DIR!npm.cmd" (
            set "NPM_CMD=!NODE_DIR!npm.cmd"
            echo       npm encontrado via node: !NPM_CMD!
            goto :found_npm
        )
    )
)

REM Nao encontrou
echo.
echo ERRO: npm nao encontrado!
echo.
echo SOLUCAO:
echo   1. Instale Node.js de: https://nodejs.org/
echo   2. Baixe a versao LTS
echo   3. Durante a instalacao, marque "Add to PATH"
echo   4. REINICIE o terminal
echo   5. Execute este script novamente
echo.
pause
exit /b 1

:found_npm
REM Extrair diretorio do Node.js do caminho do npm
if "%NPM_CMD:~-8%"=="npm.cmd" (
    REM Caminho completo - extrair diretorio
    for %%F in ("%NPM_CMD%") do set "NODEJS_DIR=%%~dpF"
    set "NODEJS_DIR=%NODEJS_DIR:~0,-1%"
) else if "%NPM_CMD%"=="npm" (
    REM npm esta no PATH - tentar encontrar diretorio
    where node >nul 2>&1
    if %errorlevel% equ 0 (
        for /f "delims=" %%i in ('where node') do (
            for %%F in ("%%i") do set "NODEJS_DIR=%%~dpF"
            set "NODEJS_DIR=!NODEJS_DIR:~0,-1!"
        )
    ) else (
        REM Tentar locais comuns
        if exist "%ProgramFiles%\nodejs\node.exe" (
            set "NODEJS_DIR=%ProgramFiles%\nodejs"
        ) else if exist "%ProgramFiles(x86)%\nodejs\node.exe" (
            set "NODEJS_DIR=%ProgramFiles(x86)%\nodejs"
        ) else if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" (
            set "NODEJS_DIR=%LOCALAPPDATA%\Programs\nodejs"
        )
    )
) else (
    REM Fallback - extrair diretorio do caminho
    for %%F in ("%NPM_CMD%") do set "NODEJS_DIR=%%~dpF"
    set "NODEJS_DIR=%NODEJS_DIR:~0,-1%"
)

if defined NODEJS_DIR (
    echo       Diretorio Node.js: !NODEJS_DIR!
) else (
    echo       AVISO: Nao foi possivel determinar diretorio do Node.js
    echo       Tentando continuar...
)
echo.

REM Verificar Docker
echo [1/3] Verificando Docker...
docker ps >nul 2>&1
if %errorlevel% neq 0 (
    echo ERRO: Docker nao esta rodando. Inicie o Docker Desktop.
    pause
    exit /b 1
)

echo [1/3] Iniciando Docker (PostgreSQL)...
docker-compose up -d postgres
if %errorlevel% neq 0 (
    echo AVISO: Erro ao iniciar Docker
) else (
    echo       Docker iniciado
    timeout /t 2 /nobreak >nul
)
echo.

REM Backend
echo [2/3] Iniciando Backend...
REM Adicionar Node.js ao PATH antes de tentar instalar
if defined NODEJS_DIR (
    set "PATH=!NODEJS_DIR!;%PATH%"
)
if not exist "packages\backend\node_modules" (
    echo       Instalando dependencias do backend...
    cd packages\backend
    REM Garantir node no PATH
    if defined NODEJS_DIR (
        set "PATH=!NODEJS_DIR!;%PATH%"
    )
    call "%NPM_CMD%" install
    if !errorlevel! neq 0 (
        echo       AVISO: Erro ao instalar. A janela do backend tentara instalar.
    ) else (
        echo       Dependencias do backend instaladas!
    )
    cd ..\..
) else (
    echo       Dependencias do backend ja instaladas
)

REM Obter diretorio raiz do projeto (um nivel acima de scripts)
cd /d "%~dp0.."
set "PROJECT_ROOT=%CD%"
set "BACKEND_DIR=%PROJECT_ROOT%\packages\backend"
set "FRONTEND_DIR=%PROJECT_ROOT%"
set "BACKEND_SCRIPT=%~dp0run-backend.bat"
set "FRONTEND_SCRIPT=%~dp0run-frontend.bat"

REM Os scripts auxiliares ja adicionam Node.js ao PATH
start "Backend - PainelCRM" cmd /k ""%BACKEND_SCRIPT%" "%NPM_CMD%" "%BACKEND_DIR%""
timeout /t 2 /nobreak >nul
echo       Backend iniciado em nova janela (http://localhost:3001)
echo.

REM Frontend
echo [3/3] Iniciando Frontend...
REM Garantir Node.js no PATH
if defined NODEJS_DIR (
    set "PATH=!NODEJS_DIR!;%PATH%"
)
if not exist "node_modules" (
    echo       Instalando dependencias do frontend...
    REM Garantir node no PATH antes de instalar
    if defined NODEJS_DIR (
        set "PATH=!NODEJS_DIR!;%PATH%"
    )
    call "%NPM_CMD%" install
    if !errorlevel! neq 0 (
        echo       AVISO: Erro ao instalar. A janela do frontend tentara instalar.
    ) else (
        echo       Dependencias do frontend instaladas!
    )
) else (
    echo       Dependencias do frontend ja instaladas
)

REM Os scripts auxiliares ja adicionam Node.js ao PATH
start "Frontend - PainelCRM" cmd /k ""%FRONTEND_SCRIPT%" "%NPM_CMD%" "%FRONTEND_DIR%""
timeout /t 2 /nobreak >nul
echo       Frontend iniciado em nova janela (http://localhost:5173)
echo.

echo === Pronto! ===
echo.
echo URLs:
echo   Frontend: http://localhost:5173
echo   Backend:  http://localhost:3001
echo   Health:   http://localhost:3001/health
echo.
echo Dicas:
echo   - Feche as janelas do backend/frontend para parar
echo   - Para parar Docker: docker-compose down
echo.
pause



