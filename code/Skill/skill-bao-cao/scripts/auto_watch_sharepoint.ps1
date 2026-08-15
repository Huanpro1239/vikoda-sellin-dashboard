# Auto-Watch SharePoint & Run Full Pipeline locally (no source-control publish)
param(
    [string]$ProjectRoot = "$PSScriptRoot\..\..\..\.."
)

$ProjectRoot = (Resolve-Path $ProjectRoot).Path
$pipelinePy = Join-Path $ProjectRoot "code\Skill\skill-bao-cao\scripts\run_cloud_pipeline.py"

$watchPaths = @(
    "D:\onedrive\Vikoda\Planning - Vikoda_Sales_Data\Data ERP",
    "D:\onedrive\Vikoda\Planning - Vikoda_Sales_Data\Data_ERP",
    (Join-Path $ProjectRoot "Data\Data ERP"),
    (Join-Path $ProjectRoot "Data\Data_ERP")
)

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " VIKODA 24/7 AUTO-WATCHER: TU DONG CAP NHAT ARTIFACT NOI BO" -ForegroundColor Green
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
    Write-Warning "Khong tim thay thu muc SharePoint nao de theo doi tren may nay."
    exit 1
}

Write-Host "`nHe thong dang chay ngam 24/7..." -ForegroundColor Green
Write-Host "Moi khi SharePoint co file moi trong 'Data ERP':" -ForegroundColor White
Write-Host "  1. Tu dong Tách data & Tinh toan Doanh so / Target" -ForegroundColor Gray
Write-Host "  2. Tu dong Xuat bao cao Excel & Web Dashboard" -ForegroundColor Gray
Write-Host "  3. Luu artifact cuc bo de doi soat va phe duyet truoc khi phat hanh.`n" -ForegroundColor Gray

$lastRun = [DateTime]::MinValue

while ($true) {
    foreach ($w in $validWatchers) {
        $change = $w.WaitForChanged([System.IO.WatcherChangeTypes]::Created -bor [System.IO.WatcherChangeTypes]::Changed, 2000)
        if (-not $change.TimedOut) {
            $ext = [System.IO.Path]::GetExtension($change.Name).ToLower()
            if ($ext -in @('.xlsm', '.xlsx')) {
                $now = [DateTime]::Now
                if (($now - $lastRun).TotalSeconds -gt 10) {
                    $lastRun = $now
                    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Phat hien file moi tren SharePoint: $($change.Name)" -ForegroundColor Cyan
                    Write-Host "-> Cho 3 giay de file dong bo xong tu Cloud..." -ForegroundColor Yellow
                    Start-Sleep -Seconds 3
                    
                    Write-Host "-> Dang chay chuoi tach data va xuat dashboard..." -ForegroundColor Yellow
                    Set-Location -LiteralPath $ProjectRoot
                    & python "$pipelinePy" --project-root "$ProjectRoot"
                    if ($LASTEXITCODE -ne 0) {
                        Write-Error "Pipeline that bai (exit code $LASTEXITCODE). Khong phat hanh artifact."
                        continue
                    }

                    # Tuyet doi khong git add/commit/push Data hoac web/data tu may watcher.
                    # Phat hanh phai di qua CI read-only, quality gate va approval cua moi truong.
                    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] DA HOAN TAT PIPELINE CUC BO. ARTIFACT DANG CHO DOI SOAT/PHET DUYET.`n" -ForegroundColor Green
                }
            }
        }
    }
}
