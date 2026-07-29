[CmdletBinding()]
param(
    [string]$ProjectRoot = '',
    [string]$OutputFile = '',
    [string]$PythonExecutable = '',
    [switch]$SkipVisualQa,
    [switch]$EnableVisualQa,
    [switch]$SkipPowerBI,
    # Không tự chạy lại Tach data khi file ERP mới hơn workbook Sell In.
    [switch]$SkipAutoRefresh,
    # Không mở Power BI Desktop sau khi dựng xong.
    [switch]$NoOpen
)

$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'lib\Pipeline.ps1')

function Resolve-ReportPython {
    param(
        [string]$ExplicitExecutable,
        [string]$Root
    )

    $candidates = @()
    if (-not [string]::IsNullOrWhiteSpace($ExplicitExecutable)) {
        $candidates += [pscustomobject]@{
            Executable = $ExplicitExecutable
            Prefix = @()
            Label = 'explicit'
        }
    }

    $projectPython = Join-Path $Root '.runtime\python\python.exe'
    $candidates += [pscustomobject]@{
        Executable = $projectPython
        Prefix = @()
        Label = 'project runtime'
    }

    if (-not [string]::IsNullOrWhiteSpace($env:USERPROFILE)) {
        $codexPython = Join-Path $env:USERPROFILE `
            '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
        $candidates += [pscustomobject]@{
            Executable = $codexPython
            Prefix = @()
            Label = 'Codex runtime'
        }
    }

    $pyCommand = Get-Command 'py.exe' -ErrorAction SilentlyContinue
    if ($null -ne $pyCommand) {
        $candidates += [pscustomobject]@{
            Executable = $pyCommand.Source
            Prefix = @('-3')
            Label = 'Python launcher'
        }
    }

    foreach ($commandName in @('python.exe', 'python3.exe')) {
        $command = Get-Command $commandName -ErrorAction SilentlyContinue
        if ($null -ne $command) {
            $candidates += [pscustomobject]@{
                Executable = $command.Source
                Prefix = @()
                Label = $commandName
            }
        }
    }

    $seen = @{}
    foreach ($candidate in $candidates) {
        $key = "$($candidate.Executable)|$($candidate.Prefix -join ' ')"
        if ($seen.ContainsKey($key)) {
            continue
        }
        $seen[$key] = $true
        if (-not (Test-Path -LiteralPath $candidate.Executable)) {
            continue
        }
        $testArguments = @($candidate.Prefix) + @(
            '-c',
            'import sys, openpyxl; raise SystemExit(0 if sys.version_info >= (3, 8) else 2)'
        )
        & $candidate.Executable @testArguments 2>$null
        if ($LASTEXITCODE -eq 0) {
            return $candidate
        }
    }

    throw @'
Khong tim thay Python 3.8+ phu hop.
Hay cai Python chinh thuc, hoac copy Python vao .runtime\python\python.exe,
sau do chay lai Chay CT\Bao cao Target.cmd.
'@
}

function Invoke-ReportPython {
    param([string[]]$ArgumentList)
    $allArguments = @($script:PythonRuntime.Prefix) + $ArgumentList
    & $script:PythonRuntime.Executable @allArguments
    $script:LastPythonExitCode = $LASTEXITCODE
}

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
    $ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..\..')).Path
} else {
    $ProjectRoot = $ProjectRoot.Trim().Trim('"')
    $ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
}

$targetSourceDir = Join-Path $ProjectRoot 'Data\Target'
$sellInSourceDir = Join-Path $ProjectRoot 'Data\out put\Sell in hang  thang'
$dmkhSourceDir = Join-Path $ProjectRoot 'Data\Danh muc KH'
$targetWorkDir = Join-Path $ProjectRoot 'Data\Work\bao_cao\target'
$targetStagingDir = Join-Path $targetWorkDir 'staging'
$dataStagingDir = Join-Path $ProjectRoot 'Data\Work\bao_cao\data\staging'
$dmkhStagingDir = Join-Path $ProjectRoot 'Data\Work\bao_cao\dmkh\staging'
$pivotWorkDir = Join-Path $ProjectRoot 'Data\Work\bao_cao\pivot'
$pivotStagingDir = Join-Path $pivotWorkDir 'staging'
$previewDir = Join-Path $targetWorkDir 'previews'
$verificationDir = Join-Path $targetWorkDir 'verification'
$powerBIOutputDir = Join-Path $ProjectRoot 'Data\File bao cao\PowerBI'
$targetDataFile = Join-Path $targetStagingDir 'target_records.json'
$targetAuditFile = Join-Path $targetStagingDir 'target_audit.json'
$sellInDataFile = Join-Path $dataStagingDir 'sell_in_data.json'
$sellInAuditFile = Join-Path $dataStagingDir 'sell_in_audit.json'
$dmkhDataFile = Join-Path $dmkhStagingDir 'dmkh_data.json'
$dmkhAuditFile = Join-Path $dmkhStagingDir 'dmkh_audit.json'
$productCatalogFile = Join-Path $ProjectRoot 'Data\Danh muc SP\Danh Muc San Pham.xlsx'
$pivotBuildReport = Join-Path $pivotStagingDir 'pivot_build_report.json'
$pivotPreviewFile = Join-Path $previewDir 'PIVOT.png'
$finalInspectionFile = Join-Path $previewDir 'report_final_inspection.json'
$verificationFile = Join-Path $verificationDir 'bao_cao_verification_report.json'
$vendorDir = Join-Path $PSScriptRoot 'vendor'

if ([string]::IsNullOrWhiteSpace($OutputFile)) {
    $OutputFile = Join-Path $ProjectRoot 'Data\File bao cao\Excel\Bao_Cao_Sell_in.xlsx'
}

foreach ($requiredPath in @(
    $targetSourceDir,
    $sellInSourceDir,
    $dmkhSourceDir,
    $productCatalogFile,
    (Join-Path $vendorDir 'openpyxl\__init__.py'),
    (Join-Path $vendorDir 'et_xmlfile\__init__.py')
)) {
    if (-not (Test-Path -LiteralPath $requiredPath)) {
        throw "Required path not found: $requiredPath"
    }
}

foreach ($directory in @(
    $targetStagingDir,
    $dataStagingDir,
    $dmkhStagingDir,
    $pivotStagingDir,
    $previewDir,
    $verificationDir,
    $powerBIOutputDir,
    (Split-Path -Parent $OutputFile)
)) {
    New-Item -ItemType Directory -Force -Path $directory | Out-Null
}

if (Test-Path -LiteralPath $OutputFile) {
    try {
        $handle = [System.IO.File]::Open(
            $OutputFile,
            [System.IO.FileMode]::Open,
            [System.IO.FileAccess]::ReadWrite,
            [System.IO.FileShare]::None
        )
        $handle.Dispose()
    } catch {
        throw "Hay dong file dau ra truoc khi chay: $OutputFile"
    }
}

$env:PYTHONUTF8 = '1'
$env:PYTHONDONTWRITEBYTECODE = '1'
if ([string]::IsNullOrWhiteSpace($env:PYTHONPATH)) {
    $env:PYTHONPATH = $vendorDir
} else {
    $env:PYTHONPATH = $vendorDir + [System.IO.Path]::PathSeparator + $env:PYTHONPATH
}
$script:PythonRuntime = Resolve-ReportPython `
    -ExplicitExecutable $PythonExecutable `
    -Root $ProjectRoot
$script:LastPythonExitCode = 0
Write-Host (
    "Python: {0} ({1})" -f `
    $script:PythonRuntime.Executable, `
    $script:PythonRuntime.Label
)

# Buoc 0/9 - Neu file ERP moi hon workbook Sell In theo thang thi tach lai
# truoc, de bao cao khong bao gio dung so cu ma khong bao.
if (-not $SkipAutoRefresh) {
    $freshness = Get-PipelineFreshness `
        -PythonExecutable $script:PythonRuntime.Executable `
        -PythonPrefix $script:PythonRuntime.Prefix `
        -ScriptRoot $PSScriptRoot `
        -ProjectRoot $ProjectRoot
    Write-FreshnessSummary -Freshness $freshness
    if ($null -ne $freshness -and $freshness.needs_tach_data) {
        Write-Host '0/9 - Tach lai data ERP truoc khi dung bao cao...'
        Invoke-TachData -ProjectRoot $ProjectRoot -PythonExecutable $PythonExecutable
    }
} else {
    Write-Host 'Bo qua kiem tra du lieu cu theo tham so SkipAutoRefresh.'
}

$nodeCandidates = @(
    [pscustomobject]@{
        Executable = (Join-Path $ProjectRoot '.runtime\node\node.exe')
        Modules = (Join-Path $ProjectRoot '.runtime\node\node_modules')
        Label = 'project runtime'
    }
)
if (-not [string]::IsNullOrWhiteSpace($env:USERPROFILE)) {
    $nodeCandidates += [pscustomobject]@{
        Executable = (Join-Path $env:USERPROFILE `
            '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe')
        Modules = (Join-Path $env:USERPROFILE `
            '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules')
        Label = 'Codex runtime'
    }
}

$node = $null
$nodeModules = $null
foreach ($candidate in $nodeCandidates) {
    if (
        (Test-Path -LiteralPath $candidate.Executable) -and
        (Test-Path -LiteralPath $candidate.Modules)
    ) {
        $node = $candidate.Executable
        $nodeModules = $candidate.Modules
        Write-Host ("Node: {0} ({1})" -f $node, $candidate.Label)
        break
    }
}
# Toan bo workbook do Python/openpyxl dung. Node chi con dung de render anh
# preview trong buoc kiem tra hinh anh, va la tuy chon.
if ($null -eq $node) {
    Write-Warning (
        'Khong co Node runtime: bo qua buoc preview anh. Workbook va toan bo ' +
        'buoc kiem tra du lieu van chay day du bang Python.'
    )
    $SkipVisualQa = $true
}
if (-not $EnableVisualQa) {
    $SkipVisualQa = $true
    Write-Host 'Visual QA: bo qua theo mac dinh; dung -EnableVisualQa neu can render preview.'
}

$localNodeModules = Join-Path $PSScriptRoot 'node_modules'
$createdLocalNodeModules = $false
if (
    $null -ne $node -and
    -not (Test-Path -LiteralPath $localNodeModules)
) {
    New-Item -ItemType Junction `
        -Path $localNodeModules `
        -Target $nodeModules | Out-Null
    $createdLocalNodeModules = $true
}

try {
    Write-Host '1/9 - Doc va chuan hoa Target tat ca cac thang...'
    Invoke-ReportPython -ArgumentList @(
        (Join-Path $PSScriptRoot 'extract_targets.py'),
        '--source-dir', $targetSourceDir,
        '--staging-dir', $targetStagingDir
    )
    if ($script:LastPythonExitCode -ne 0) {
        throw "Chuan hoa Target that bai. Xem: $targetAuditFile"
    }

    Write-Host '2/9 - Doc Sell In nam nay va cung ky nam truoc...'
    $asOfDate = (Get-Date).ToString('yyyy-MM-dd')
    Invoke-ReportPython -ArgumentList @(
        (Join-Path $PSScriptRoot 'extract_sell_in_data.py'),
        '--source-dir', $sellInSourceDir,
        '--staging-dir', $dataStagingDir,
        '--as-of-date', $asOfDate
    )
    if ($script:LastPythonExitCode -ne 0) {
        throw "Chuan hoa Sell In that bai. Xem: $sellInAuditFile"
    }

    Write-Host '3/9 - Doc va chuan hoa danh muc khach hang...'
    Invoke-ReportPython -ArgumentList @(
        (Join-Path $PSScriptRoot 'extract_customers.py'),
        '--source-dir', $dmkhSourceDir,
        '--staging-dir', $dmkhStagingDir
    )
    if ($script:LastPythonExitCode -ne 0) {
        throw "Chuan hoa DMKH that bai. Xem: $dmkhAuditFile"
    }

    Write-Host '4/9 - Tao workbook nen Target, Data va DMKH...'
    Invoke-ReportPython -ArgumentList @(
        (Join-Path $PSScriptRoot 'build_report_workbook.py'),
        '--target-data-file', $targetDataFile,
        '--sell-in-data-file', $sellInDataFile,
        '--dmkh-data-file', $dmkhDataFile,
        '--output-file', $OutputFile
    )
    if ($script:LastPythonExitCode -ne 0) {
        throw "Tao workbook that bai voi exit code $script:LastPythonExitCode."
    }

    Write-Host '5/9 - Tao PVT_DATA, sheet PIVOT va 8 sheet bao cao theo mien...'
    Invoke-ReportPython -ArgumentList @(
        (Join-Path $PSScriptRoot 'build_pivot_sheet.py'),
        '--workbook', $OutputFile,
        '--sell-in-data-file', $sellInDataFile,
        '--target-data-file', $targetDataFile,
        '--dmkh-data-file', $dmkhDataFile,
        '--report-file', $pivotBuildReport
    )
    if ($script:LastPythonExitCode -ne 0) {
        throw "Tao sheet PIVOT va cac sheet BC_ that bai. Xem: $pivotBuildReport"
    }

    Write-Host '6/9 - Kiem tra hinh anh workbook...'
    if (-not $SkipVisualQa) {
        & $node (Join-Path $PSScriptRoot 'inspect_target_workbook.mjs') `
            $OutputFile `
            $previewDir `
            $sellInDataFile `
            $targetDataFile `
            $dmkhDataFile
        if ($LASTEXITCODE -ne 0) {
            Write-Warning (
                "Preview Node khong hoan tat (exit code $LASTEXITCODE). " +
                'Day la buoc tuy chon; tiep tuc kiem tra du lieu, cong thuc va ' +
                'dinh dang bang Python.'
            )
        }
    } else {
        Write-Warning 'Da bo qua preview anh theo tham so SkipVisualQa.'
    }

    Write-Host '7/9 - Kiem tra du lieu, cong thuc va dinh dang...'
    Invoke-ReportPython -ArgumentList @(
        (Join-Path $PSScriptRoot 'verify_target_report.py'),
        '--data-file', $targetDataFile,
        '--sell-in-data-file', $sellInDataFile,
        '--sell-in-audit-file', $sellInAuditFile,
        '--dmkh-data-file', $dmkhDataFile,
        '--dmkh-audit-file', $dmkhAuditFile,
        '--output-file', $OutputFile,
        '--report-file', $verificationFile
    )
    if ($script:LastPythonExitCode -ne 0) {
        throw "Kiem tra workbook that bai. Xem: $verificationFile"
    }

    Write-Host '8/9 - Gan Power Query portable vao workbook...'
    $powerQueryInstaller = Join-Path $PSScriptRoot 'add_powerquery_option2.ps1'
    if (Test-Path -LiteralPath $powerQueryInstaller) {
        & "$PSHOME\powershell.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass `
            -File $powerQueryInstaller -WorkbookPath $OutputFile
        if ($LASTEXITCODE -ne 0) {
            Write-Warning (
                'Khong gan duoc Power Query. Bao cao Python van hoan tat; ' +
                'co the chay lai add_powerquery_option2.ps1 tren may co Excel.'
            )
        }
    } else {
        Write-Warning "Khong tim thay script Power Query: $powerQueryInstaller"
    }

    if (-not $SkipPowerBI) {
        Write-Host '9/9 - Tao goi Power BI PBIP va bo du lieu sao...'
        Invoke-ReportPython -ArgumentList @(
            (Join-Path $PSScriptRoot 'build_powerbi_package.py'),
            '--sell-in-data-file', $sellInDataFile,
            '--target-data-file', $targetDataFile,
            '--dmkh-data-file', $dmkhDataFile,
            '--product-catalog-file', $productCatalogFile,
            '--output-dir', $powerBIOutputDir
        )
        if ($script:LastPythonExitCode -ne 0) {
            throw "Tao goi Power BI that bai voi exit code $script:LastPythonExitCode."
        }
        Write-Host "Power BI: $powerBIOutputDir\Vikoda_SellIn_PowerBI.pbip"
    } else {
        Write-Host '9/9 - Bo qua goi Power BI theo tham so SkipPowerBI.'
    }

    Write-Host "Hoan tat Excel va Power BI: $OutputFile"

    if (-not $SkipPowerBI -and -not $NoOpen) {
        Open-PowerBIProject -ProjectFile (
            Join-Path $powerBIOutputDir 'Vikoda_SellIn_PowerBI.pbip'
        )
    }
} finally {
    if (
        $createdLocalNodeModules -and
        (Test-Path -LiteralPath $localNodeModules)
    ) {
        [System.IO.Directory]::Delete($localNodeModules)
    }
}
