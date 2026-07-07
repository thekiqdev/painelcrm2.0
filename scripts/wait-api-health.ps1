param(
    [int]$Port = 3001,
    [int]$TimeoutSec = 90
)

$url = "http://127.0.0.1:$Port/health"
$deadline = (Get-Date).AddSeconds($TimeoutSec)

while ((Get-Date) -lt $deadline) {
    try {
        $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
        if ($response.StatusCode -eq 200) {
            Write-Output 'OK'
            exit 0
        }
    } catch {
        # backend ainda subindo (migrate + nodemon)
    }
    Start-Sleep -Seconds 1
}

Write-Output 'TIMEOUT'
exit 1
