@echo off
setlocal enabledelayedexpansion

echo === Iniciando Backend ===
echo.

REM Procurar npm
set "NPM_CMD="
where npm >nul 2>&1
if %errorlevel% equ 0 (
    set "NPM_CMD=npm"
    goto :found_npm
)

REM Procurar em locais comuns
if exist "%ProgramFiles%\nodejs\npm.cmd" (
    set "NPM_CMD=%ProgramFiles%\nodejs\npm.cmd"
    goto :found_npm
)
if exist "C:\Program Files\nodejs\npm.cmd" (
    set "NPM_CMD=C:\Program Files\nodejs\npm.cmd"
    goto :found_npm
)

echo ERRO: npm nao encontrado!
pause
exit /b 1

:found_npm
echo npm encontrado: %NPM_CMD%
echo.

cd /d "%~dp0packages\backend"

if not exist "node_modules" (
    echo Instalando dependencias...
    call "%NPM_CMD%" install
    if errorlevel 1 (
        echo ERRO: Falha ao instalar dependencias
        pause
        exit /b 1
    )
)

echo.
echo Backend rodando em: http://localhost:3001
echo Pressione Ctrl+C para parar
echo.

call "%NPM_CMD%" run dev
