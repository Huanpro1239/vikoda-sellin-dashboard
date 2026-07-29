[CmdletBinding()]
param(
    [string]$ProjectRoot = '',
    [string]$PythonExecutable = '',
    # Mặc định mở Power BI Desktop sau khi dựng xong; dùng -NoOpen để tắt.
    [switch]$NoOpen,
    # Dựng lại gói Power BI kể cả khi dữ liệu đã mới nhất.
    [switch]$Force,
    # Không tự chạy lại Tach data / báo cáo khi phát hiện nguồn mới hơn.
    [switch]$SkipAutoRefresh,
    # Giữ tương thích ngược với lệnh cũ; hiện đã là hành vi mặc định.
    [switch]$OpenAfterBuild
)

$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'lib\Pipeline.ps1')

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
    $ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..\..')).Path
} else {
    $ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot.Trim().Trim('"')).Path
}

$candidates = @()
if (-not [string]::IsNullOrWhiteSpace($PythonExecutable)) {
    $candidates += $PythonExecutable
}
$candidates += Join-Path $ProjectRoot '.runtime\python\python.exe'
if (-not [string]::IsNullOrWhiteSpace($env:USERPROFILE)) {
    $candidates += Join-Path $env:USERPROFILE `
        '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
}
foreach ($name in @('python.exe', 'python3.exe')) {
    $command = Get-Command $name -ErrorAction SilentlyContinue
    if ($null -ne $command) {
        $candidates += $command.Source
    }
}

$python = $null
foreach ($candidate in $candidates | Select-Object -Unique) {
    if (-not (Test-Path -LiteralPath $candidate)) {
        continue
    }
    & $candidate -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 8) else 2)' 2>$null
    if ($LASTEXITCODE -eq 0) {
        $python = $candidate
        break
    }
}
if ($null -eq $python) {
    throw 'Khong tim thay Python 3.8+ de tao goi Power BI.'
}

$sellInData = Join-Path $ProjectRoot 'Data\Work\bao_cao\data\staging\sell_in_data.json'
$targetData = Join-Path $ProjectRoot 'Data\Work\bao_cao\target\staging\target_records.json'
$dmkhData = Join-Path $ProjectRoot 'Data\Work\bao_cao\dmkh\staging\dmkh_data.json'
$productCatalog = Join-Path $ProjectRoot 'Data\Danh muc SP\Danh Muc San Pham.xlsx'
$outputDir = Join-Path $ProjectRoot 'Data\File bao cao\PowerBI'
$builder = Join-Path $PSScriptRoot 'build_powerbi_package.py'
$vendorDir = Join-Path $PSScriptRoot 'vendor'
$projectFile = Join-Path $outputDir 'Vikoda_SellIn_PowerBI.pbip'

$env:PYTHONUTF8 = '1'
$env:PYTHONDONTWRITEBYTECODE = '1'
if (Test-Path -LiteralPath (Join-Path $vendorDir 'openpyxl\__init__.py')) {
    if ([string]::IsNullOrWhiteSpace($env:PYTHONPATH)) {
        $env:PYTHONPATH = $vendorDir
    } else {
        $env:PYTHONPATH = $vendorDir + [System.IO.Path]::PathSeparator + $env:PYTHONPATH
    }
}

# Bước 1: xem nguồn nào mới hơn đầu ra. Nhờ đó chạy file .cmd nào cũng ra số
# đúng, không phụ thuộc việc nhớ thứ tự Tach data -> Bao cao Target.
$freshness = Get-PipelineFreshness `
    -PythonExecutable $python `
    -ScriptRoot $PSScriptRoot `
    -ProjectRoot $ProjectRoot
Write-FreshnessSummary -Freshness $freshness

$needsStaging = $false
$needsPowerBI = $true
if ($null -ne $freshness) {
    $needsStaging = [bool]$freshness.needs_staging
    $needsPowerBI = [bool]$freshness.needs_powerbi
}
if ($SkipAutoRefresh) {
    $needsStaging = $false
}

if ($needsStaging) {
    # Staging cũ: giao trọn cho run_target_report.ps1 vì script đó đã tự lo
    # Tach data, Excel rồi dựng luôn gói Power BI. Không dựng lại lần hai.
    Write-Host 'Du lieu nguon moi hon staging: chay lai toan bo chuoi bao cao...'
    $reportRunner = Join-Path $PSScriptRoot 'run_target_report.ps1'
    $reportArguments = @(
        '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass',
        '-File', $reportRunner,
        '-ProjectRoot', $ProjectRoot,
        '-SkipVisualQa',
        '-NoOpen'
    )
    if (-not [string]::IsNullOrWhiteSpace($PythonExecutable)) {
        $reportArguments += @('-PythonExecutable', $PythonExecutable)
    }
    & "$PSHOME\powershell.exe" @reportArguments
    if ($LASTEXITCODE -ne 0) {
        throw "Chay lai chuoi bao cao that bai voi exit code $LASTEXITCODE."
    }
} elseif ($needsPowerBI -or $Force) {
    foreach ($required in @($sellInData, $targetData, $dmkhData, $productCatalog, $builder)) {
        if (-not (Test-Path -LiteralPath $required)) {
            throw "Khong tim thay du lieu can thiet: $required. Hay chay Bao cao Target truoc."
        }
    }
    & $python $builder `
        --sell-in-data-file $sellInData `
        --target-data-file $targetData `
        --dmkh-data-file $dmkhData `
        --product-catalog-file $productCatalog `
        --output-dir $outputDir
    if ($LASTEXITCODE -ne 0) {
        throw "Tao goi Power BI that bai voi exit code $LASTEXITCODE."
    }
} else {
    Write-Host 'Goi Power BI da khop voi du lieu nguon; bo qua buoc dung lai.'
    Write-Host 'Dung -Force neu van muon dung lai tu dau.'
}

Write-Host "Hoan tat Power BI: $projectFile"

if (-not $NoOpen) {
    Open-PowerBIProject -ProjectFile $projectFile
}
