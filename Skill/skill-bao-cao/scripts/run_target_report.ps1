[CmdletBinding()]
param(
    [string]$ProjectRoot = '',
    [string]$OutputFile = '',
    [string]$PythonExecutable = '',
    [switch]$SkipVisualQa
)

$ErrorActionPreference = 'Stop'

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
sau do chay lai Bao cao Target.cmd.
'@
}

function Invoke-ReportPython {
    param([string[]]$ArgumentList)
    $allArguments = @($script:PythonRuntime.Prefix) + $ArgumentList
    & $script:PythonRuntime.Executable @allArguments
    $script:LastPythonExitCode = $LASTEXITCODE
}

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
    $ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
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
$targetDataFile = Join-Path $targetStagingDir 'target_records.json'
$targetAuditFile = Join-Path $targetStagingDir 'target_audit.json'
$sellInDataFile = Join-Path $dataStagingDir 'sell_in_data.json'
$sellInAuditFile = Join-Path $dataStagingDir 'sell_in_audit.json'
$dmkhDataFile = Join-Path $dmkhStagingDir 'dmkh_data.json'
$dmkhAuditFile = Join-Path $dmkhStagingDir 'dmkh_audit.json'
$pivotArtifactFile = Join-Path $pivotStagingDir 'pivot_artifact.xlsx'
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
if ($null -eq $node) {
    throw @'
Khong tim thay Codex spreadsheet runtime de tao sheet PIVOT.
Hay chay trong Codex, hoac copy Node runtime vao .runtime\node.
'@
}

$localNodeModules = Join-Path $PSScriptRoot 'node_modules'
$createdLocalNodeModules = $false
if (
    -not (Test-Path -LiteralPath $localNodeModules)
) {
    New-Item -ItemType Junction `
        -Path $localNodeModules `
        -Target $nodeModules | Out-Null
    $createdLocalNodeModules = $true
}

try {
    Write-Host '1/7 - Doc va chuan hoa Target tat ca cac thang...'
    Invoke-ReportPython -ArgumentList @(
        (Join-Path $PSScriptRoot 'extract_targets.py'),
        '--source-dir', $targetSourceDir,
        '--staging-dir', $targetStagingDir
    )
    if ($script:LastPythonExitCode -ne 0) {
        throw "Chuan hoa Target that bai. Xem: $targetAuditFile"
    }

    Write-Host '2/7 - Doc Sell In nam nay va cung ky nam truoc...'
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

    Write-Host '3/7 - Doc va chuan hoa danh muc khach hang...'
    Invoke-ReportPython -ArgumentList @(
        (Join-Path $PSScriptRoot 'extract_customers.py'),
        '--source-dir', $dmkhSourceDir,
        '--staging-dir', $dmkhStagingDir
    )
    if ($script:LastPythonExitCode -ne 0) {
        throw "Chuan hoa DMKH that bai. Xem: $dmkhAuditFile"
    }

    Write-Host '4/7 - Tao workbook nen Target, Data va DMKH...'
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

    Write-Host '5/7 - Tao mo hinh PVT_DATA va sheet PIVOT...'
    & $node (Join-Path $PSScriptRoot 'build_pivot_sheet.mjs') `
        $pivotArtifactFile `
        $sellInDataFile `
        $targetDataFile `
        $dmkhDataFile `
        $pivotBuildReport `
        $pivotPreviewFile
    if ($LASTEXITCODE -ne 0) {
        if (
            $LASTEXITCODE -eq -1073740791 -and
            (Test-Path -LiteralPath $pivotArtifactFile) -and
            (Test-Path -LiteralPath $pivotBuildReport) -and
            (Test-Path -LiteralPath $pivotPreviewFile)
        ) {
            Write-Warning 'Workbook engine cleanup warning sau buoc tao PIVOT.'
        } else {
            throw "Tao sheet PIVOT that bai voi exit code $LASTEXITCODE."
        }
    }
    Invoke-ReportPython -ArgumentList @(
        (Join-Path $PSScriptRoot 'merge_pivot_workbook.py'),
        '--base-workbook', $OutputFile,
        '--pivot-workbook', $pivotArtifactFile
    )
    if ($script:LastPythonExitCode -ne 0) {
        throw "Ghep PIVOT vao workbook that bai."
    }

    Write-Host '6/7 - Kiem tra hinh anh workbook...'
    if (-not $SkipVisualQa) {
        & $node (Join-Path $PSScriptRoot 'inspect_target_workbook.mjs') `
            $OutputFile `
            $previewDir `
            $sellInDataFile `
            $targetDataFile `
            $dmkhDataFile `
            $pivotArtifactFile
        if ($LASTEXITCODE -ne 0) {
            if (
                $LASTEXITCODE -eq -1073740791 -and
                (Test-Path -LiteralPath $finalInspectionFile)
            ) {
                Write-Warning 'Workbook engine cleanup warning sau buoc preview.'
            } else {
                throw "Kiem tra hinh anh that bai voi exit code $LASTEXITCODE."
            }
        }
    } else {
        Write-Warning 'Da bo qua preview anh theo tham so SkipVisualQa.'
    }

    Write-Host '7/7 - Kiem tra du lieu, cong thuc va dinh dang...'
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

    Write-Host "Hoan tat: $OutputFile"
} finally {
    if (
        $createdLocalNodeModules -and
        (Test-Path -LiteralPath $localNodeModules)
    ) {
        [System.IO.Directory]::Delete($localNodeModules)
    }
}
