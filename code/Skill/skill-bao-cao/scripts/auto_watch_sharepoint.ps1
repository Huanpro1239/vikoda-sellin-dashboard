# Auto-Watch SharePoint & Run Tach data.cmd Automatically
param(
    [string]$ProjectRoot = "$PSScriptRoot\..\..\..\.."
)

$ProjectRoot = (Resolve-Path $ProjectRoot).Path
$cmdPath = Join-Path $ProjectRoot "Chay CT\Tach data.cmd"

$watchPaths = @(
    "D:\onedrive\Vikoda\Planning - Vikoda_Sales_Data\Data ERP",
    (Join-Path $ProjectRoot "Data\Data ERP")
)

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " VIKODA AUTO-WATCHER: TU DONG CHAY 'Tach data.cmd'" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan

$validWatchers = @()
foreach ($wp in $watchPaths) {
    if (Test-Path -LiteralPath $wp) {
        Write-Host " -> Dang theo doi thu muc: $wp" -ForegroundColor Yellow
        $watcher = New-Object System.IO.FileSystemWatcher
        $watcher.Path = $wp
        $watcher.Filter = "*.*"
        $watcher.IncludeSubdirectories = $false
        $watcher.EnableRaisingEvents = $true
        $validWatchers += $watcher
    }
}

if ($validWatchers.Count -eq 0) {
    Write-Warning "Khong tim thay thu muc nao de theo doi."
    exit 1
}

Write-Host "`nHe thong dang chay ngam 24/7..." -ForegroundColor Green
Write-Host "Moi khi SharePoint co file moi trong 'Data ERP', 'Tach data.cmd' se TU DONG CHAY!`n" -ForegroundColor White

$lastRun = [DateTime]::MinValue

while ($true) {
    foreach ($w in $validWatchers) {
        $change = $w.WaitForChanged([System.IO.WatcherChangeTypes]::Created -bor [System.IO.WatcherChangeTypes]::Changed, 2000)
        if (-not $change.TimedOut) {
            $ext = [System.IO.Path]::GetExtension($change.Name).ToLower()
            if ($ext -in @('.xlsm', '.xlsx')) {
                $now = [DateTime]::Now
                if (($now - $lastRun).TotalSeconds -gt 5) {
                    $lastRun = $now
                    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Phat hien file moi: $($change.Name)" -ForegroundColor Cyan
                    Write-Host "-> Tu dong khoi dong 'Tach data.cmd' sau 3 giay de file dong bo xong..." -ForegroundColor Yellow
                    Start-Sleep -Seconds 3
                    
                    $env:TACH_DATA_NO_PAUSE = "1"
                    Start-Process -FilePath "cmd.exe" -ArgumentList "/c `"$cmdPath`"" -Wait
                    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Hoan tat Tách data va cap nhat SharePoint Data_Goc thanh cong!`n" -ForegroundColor Green
                }
            }
        }
    }
}
