# Libere les ports du lab DEV (Nest + Vite + kick agent).
# Ne touche pas Postgres Docker (5435 / 5438) ni la VM GCP.

$ErrorActionPreference = "Continue"
$ports = 3000, 3001, 5173, 5174, 3911

Write-Host "Liberation des ports lab DEV: $($ports -join ', ')..." -ForegroundColor Cyan

$pids = @()
foreach ($p in $ports) {
  $conns = Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue |
    Where-Object { $_.State -eq 'Listen' }
  foreach ($c in $conns) {
    if ($c.OwningProcess -and $c.OwningProcess -ne 0) {
      $pids += $c.OwningProcess
    }
  }
}

$pids = $pids | Select-Object -Unique
foreach ($procId in $pids) {
  $name = (Get-Process -Id $procId -ErrorAction SilentlyContinue).ProcessName
  Write-Host "  stop PID $procId ($name)"
  Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
}

Write-Host "OK - ports libres." -ForegroundColor Green
Write-Host "Postgres DEV (5435) et miroir (5438) inchanges." -ForegroundColor DarkGray
