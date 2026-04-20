# Preflight para start.bat: evita bloqueio infinito quando o daemon Docker nao responde.
# Saidas (stdout, uma linha): NODOCKER | TIMEOUT | RUNNING | NOTRUN
$ErrorActionPreference = 'SilentlyContinue'
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Output 'NODOCKER'
  exit 0
}
$j = Start-Job { docker ps --format '{{.Names}}' 2>$null }
if (-not (Wait-Job $j -Timeout 12)) {
  Stop-Job $j -Force -ErrorAction SilentlyContinue
  Remove-Job $j -Force -ErrorAction SilentlyContinue
  Write-Output 'TIMEOUT'
  exit 0
}
$names = @(Receive-Job $j -ErrorAction SilentlyContinue)
Remove-Job $j -Force -ErrorAction SilentlyContinue
$joined = if ($names) { $names -join "`n" } else { '' }
if ($joined -match 'painelcrm_postgres') {
  Write-Output 'RUNNING'
} else {
  Write-Output 'NOTRUN'
}
exit 0
