@echo off
setlocal
cd /d "%~dp0"
echo.
echo === Liberando porta 3001 (backend) ===
echo.

for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3001" ^| findstr "LISTENING"') do (
  set PID=%%a
  goto :found
)
echo Nenhum processo encontrado na porta 3001.
echo.
pause
exit /b 0

:found
echo Processo na porta 3001: PID %PID%
echo Encerrando...
taskkill /PID %PID% /F 2>nul
if %errorlevel% equ 0 (
  echo.
  echo Porta 3001 liberada. Pode iniciar o backend novamente.
) else (
  echo.
  echo Falha ao encerrar. Feche a janela "Backend - PainelCRM" ou execute este script como Administrador.
)
echo.
pause
exit /b 0
