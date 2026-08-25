# Auto-Watch SharePoint/OneDrive & Run Full Pipeline locally (no source-control publish)
param(
    [string]$ProjectRoot = "$PSScriptRoot\..\..\..\.."
)

$ProjectRoot = (Resolve-Path $ProjectRoot).Path
$pipelinePy = Join-Path $ProjectRoot "code\Skill\skill-bao-cao\scripts\run_cloud_pipeline.py"

# Uu tien duong dan do nguoi dung cau hinh de khong phu thuoc o D:.
# Vi du:
#   setx VIKODA_ONEDRIVE_PATH "D:\onedrive\Vikoda\Planning - Vikoda_Sales_Data"
$watchPaths = @()
$configuredOneDrivePath = [Environment]::GetEnvironmentVariable("VIKODA_ONEDRIVE_PATH", "Process")
if ([string]::IsNullOrWhiteSpace($configuredOneDrivePath)) {
    $configuredOneDrivePath = [Environment]::GetEnvironmentVariable("VIKODA_ONEDRIVE_PATH", "User")
}

if (-not [string]::IsNullOrWhiteSpace($configuredOneDrivePath)) {
    $watchPaths += (Join-Path $configuredOneDrivePath "Data ERP")
    $watchPaths += (Join-Path $configuredOneDrivePath "Data_ERP")
}

# Giu fallback cu de tuong thich may dang dung va che do data cuc bo.
$watchPaths += @(
    "D:\onedrive\Vikoda\Planning - Vikoda_Sales_Data\Data ERP",
    "D:\onedrive\Vikoda\Planning - Vikoda_Sales_Data\Data_ERP",
    (Join-Path $ProjectRoot "Data\Data ERP"),
    (Join-Path $ProjectRoot "Data\Data_ERP")
)
$watchPaths = @($watchPaths | Select-Object -Unique)

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " VIKODA AUTO-WATCHER: SHAREPOINT/ONEDRIVE -> LOCAL PIPELINE" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan

if (-not [string]::IsNullOrWhiteSpace($configuredOneDrivePath)) {
    Write-Host " -> VIKODA_ONEDRIVE_PATH: $configuredOneDrivePath" -ForegroundColor DarkGray
}

$validWatchers = @()
foreach ($wp in $watchPaths) {
    if (Test-Path -LiteralPath $wp) {
        Write-Host " -> Dang theo doi thu muc: $wp" -ForegroundColor Yellow
        $watcher = New-Object System.IO.FileSystemWatcher
        $watcher.Path = $wp
        $watcher.Filter = "*.*"
        $watcher.IncludeSubdirectories = $false
        $watcher.NotifyFilter = [System.IO.NotifyFilters]'FileName, LastWrite, Size'
        $watcher.EnableRaisingEvents = $true
        $validWatchers += $watcher
    }
}

if ($validWatchers.Count -eq 0) {
    Write-Warning "Khong tim thay thu muc SharePoint/OneDrive nao de theo doi tren may nay."
    Write-Host "Hay dong bo thu vien SharePoint bang OneDrive, sau do cau hinh:" -ForegroundColor White
    Write-Host '  setx VIKODA_ONEDRIVE_PATH "DUONG_DAN_THU_MUC_VIKODA_SALES_DATA"' -ForegroundColor Gray
    Write-Host "Dong cua so nay, mo lai CMD watcher sau khi setx." -ForegroundColor Gray
    exit 1
}

Write-Host "`nHe thong dang theo doi thay doi..." -ForegroundColor Green
Write-Host "Moi khi SharePoint/OneDrive co workbook moi trong 'Data ERP':" -ForegroundColor White
Write-Host "  1. Tu dong tach data & tinh Doanh so / Target" -ForegroundColor Gray
Write-Host "  2. Tu dong xuat bao cao Excel & Web Dashboard cuc bo" -ForegroundColor Gray
Write-Host "  3. Khong git add/commit/push du lieu nghiep vu.`n" -ForegroundColor Gray

$lastRun = [DateTime]::MinValue

while ($true) {
    foreach ($w in $validWatchers) {
        $change = $w.WaitForChanged(
            [System.IO.WatcherChangeTypes]::Created -bor [System.IO.WatcherChangeTypes]::Changed -bor [System.IO.WatcherChangeTypes]::Renamed,
            2000
        )
        if (-not $change.TimedOut) {
            $ext = [System.IO.Path]::GetExtension($change.Name).ToLowerInvariant()
            if ($ext -in @('.xlsm', '.xlsx')) {
                $now = [DateTime]::Now
                if (($now - $lastRun).TotalSeconds -gt 10) {
                    $lastRun = $now
                    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Phat hien workbook cap nhat: $($change.Name)" -ForegroundColor Cyan
                    Write-Host "-> Cho 5 giay de OneDrive dong bo xong file..." -ForegroundColor Yellow
                    Start-Sleep -Seconds 5

                    Write-Host "-> Dang chay chuoi tach data va xuat dashboard..." -ForegroundColor Yellow
                    Set-Location -LiteralPath $ProjectRoot
                    & python "$pipelinePy" --project-root "$ProjectRoot"
                    if ($LASTEXITCODE -ne 0) {
                        Write-Error "Pipeline that bai (exit code $LASTEXITCODE). Khong phat hanh artifact."
                        continue
                    }

                    # Tuyet doi khong git add/commit/push Data hoac web/data tu may watcher.
                    # Phat hanh cloud phai di qua CI, quality gate va approval cua moi truong.
                    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] DA HOAN TAT PIPELINE CUC BO.`n" -ForegroundColor Green
                }
            }
        }
    }
}
