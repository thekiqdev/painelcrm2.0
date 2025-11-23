@echo off
setlocal enabledelayedexpansion
set "NPM_CMD=%~1"
set "DIR=%~2"

if "%DIR%"=="" set "DIR=%~dp0..\packages\backend"

REM Extrair diretorio do Node.js do caminho do npm
set "NODEJS_DIR="
if not "%NPM_CMD%"=="" (
    if "%NPM_CMD:~-8%"=="npm.cmd" (
        for %%F in ("%NPM_CMD%") do set "NODEJS_DIR=%%~dpF"
        set "NODEJS_DIR=!NODEJS_DIR:~0,-1!"
    ) else if not "%NPM_CMD%"=="npm" (
        for %%F in ("%NPM_CMD%") do set "NODEJS_DIR=%%~dpF"
        set "NODEJS_DIR=!NODEJS_DIR:~0,-1!"
    )
)

REM Adicionar Node.js ao PATH (sem endlocal para manter variaveis)
if defined NODEJS_DIR (
    set "PATH=!NODEJS_DIR!;%PATH%"
    echo Adicionando Node.js ao PATH: !NODEJS_DIR!
)

cd /d "%DIR%"

if not exist "node_modules" (
    echo Instalando dependencias do backend...
    REM Verificar node antes de executar npm
    where node >nul 2>&1
    if errorlevel 1 (
        if defined NODEJS_DIR (
            echo Usando node de: !NODEJS_DIR!
            set "PATH=!NODEJS_DIR!;%PATH%"
        ) else (
            echo ERRO: node nao encontrado no PATH
            pause
            exit /b 1
        )
    )
    call "%NPM_CMD%" install
    if errorlevel 1 (
        echo.
        echo ERRO: Falha ao instalar dependencias
        echo.
        echo Verificando node...
        where node
        if defined NODEJS_DIR (
            echo Node.js dir: !NODEJS_DIR!
            "!NODEJS_DIR!\node.exe" --version
        )
        pause
        exit /b 1
    )
    echo Dependencias instaladas com sucesso!
)

REM Verificar se node_modules existe
if not exist "node_modules" (
    echo ERRO: node_modules nao encontrado. Execute npm install primeiro.
    pause
    exit /b 1
)

echo.
echo Backend rodando em: http://localhost:3001
echo Pressione Ctrl+C para parar
echo.

REM Garantir PATH antes de executar (Node.js + node_modules/.bin)
if defined NODEJS_DIR (
    set "PATH=!NODEJS_DIR!;%PATH%"
)
REM Adicionar node_modules/.bin ao PATH para executar scripts npm
if exist "node_modules\.bin" (
    set "PATH=%CD%\node_modules\.bin;%PATH%"
)

REM Garantir que npm existe e obter caminho completo
if "%NPM_CMD%"=="npm" (
    REM Se for apenas "npm", encontrar o caminho completo
    where npm >nul 2>&1
    if errorlevel 1 (
        echo ERRO: npm nao encontrado no PATH
        pause
        exit /b 1
    )
    REM Obter caminho completo do npm
    for /f "delims=" %%i in ('where npm') do (
        set "NPM_CMD=%%i"
        goto :found_npm_full_path
    )
    :found_npm_full_path
    REM Se ainda for apenas "npm", tentar locais comuns
    if "%NPM_CMD%"=="npm" (
        if exist "%ProgramFiles%\nodejs\npm.cmd" (
            set "NPM_CMD=%ProgramFiles%\nodejs\npm.cmd"
        ) else if exist "C:\Program Files\nodejs\npm.cmd" (
            set "NPM_CMD=C:\Program Files\nodejs\npm.cmd"
        ) else (
            echo ERRO: npm nao encontrado
            pause
            exit /b 1
        )
    )
) else (
    REM Se for caminho completo, verificar se existe
    if not exist "%NPM_CMD%" (
        echo ERRO: npm.cmd nao encontrado em: %NPM_CMD%
        pause
        exit /b 1
    )
)

REM Verificar se tsx esta instalado
if not exist "node_modules\.bin\tsx.cmd" (
    if not exist "node_modules\.bin\tsx" (
        echo AVISO: tsx nao encontrado. Reinstalando dependencias...
        call "%NPM_CMD%" install
        if errorlevel 1 (
            echo ERRO: Falha ao reinstalar dependencias
            pause
            exit /b 1
        )
    )
)

REM Usar npm run dev (que executa tsx watch src/index.ts)
REM Garantir que estamos usando call para executar o comando corretamente
call "%NPM_CMD%" run dev
