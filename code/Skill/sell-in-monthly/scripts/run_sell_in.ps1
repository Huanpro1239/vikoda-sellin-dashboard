[CmdletBinding()]
param(
    [string]$ProjectRoot = '',
    [string]$OutputDirectory = '',
    [string]$GoogleDriveTarget = 'G:\My Drive\Bao cao Sell in\Sell in hang thang',
    [switch]$SkipGoogleDrive,
    [string[]]$ForcePeriod = @(),
    [switch]$ForceAll,
    [string]$PythonExecutable = ''
)

$ErrorActionPreference = 'Stop'

function Resolve-SellInPython {
    <#
        Tìm Python 3.8+ có openpyxl theo thứ tự ưu tiên:
        tham số -PythonExecutable, .runtime của dự án, runtime Codex, py.exe,
        rồi python.exe/python3.exe trong PATH. Không phụ thuộc một đường dẫn
        cứng duy nhất để máy mất runtime Codex vẫn chạy được.
    #>
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

    $candidates += [pscustomobject]@{
        Executable = (Join-Path $Root '.runtime\python\python.exe')
        Prefix = @()
        Label = 'project runtime'
    }

    if (-not [string]::IsNullOrWhiteSpace($env:USERPROFILE)) {
        $candidates += [pscustomobject]@{
            Executable = (Join-Path $env:USERPROFILE `
                '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe')
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
Khong tim thay Python 3.8+ co openpyxl.
Cach xu ly, chon mot trong ba:
  1. Cai Python 3 chinh thuc va tich "Add python.exe to PATH".
  2. Copy Python vao .runtime\python\python.exe trong thu muc du an.
  3. Chay lai: Tach data.cmd -PythonExecutable "D:\duong\dan\python.exe"
'@
}

function Invoke-SellInPython {
    param([string[]]$ArgumentList)
    $allArguments = @($script:PythonRuntime.Prefix) + $ArgumentList
    & $script:PythonRuntime.Executable @allArguments
}

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
    $ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..\..')).Path
}

$sourceDir = Join-Path $ProjectRoot 'Data\Data ERP'
$outputDir = if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
    Join-Path $ProjectRoot 'Data\out put\Sell in hang  thang'
} else {
    $OutputDirectory
}
$workDir = Join-Path $ProjectRoot 'Data\Work\sell_in'
$stagingDir = Join-Path $workDir 'staging'
$previewDir = Join-Path $workDir 'previews'
$verificationDir = Join-Path $workDir 'verification'
$masterDataDir = Join-Path $workDir 'master_data'
$candidateDir = Join-Path $workDir 'new_customers'
$logDir = Join-Path $ProjectRoot 'Data\Logs\Tach data logs'
$stateFile = Join-Path $logDir 'incremental_state.json'
$incrementalPlanFile = Join-Path $stagingDir 'incremental_plan.json'
$customerMaster = Join-Path $ProjectRoot 'Data\Danh muc KH\Thong tin khach hang.xlsx'
$productMaster = Join-Path $ProjectRoot 'Data\Danh muc SP\Danh Muc San Pham.xlsx'
$customerBackupDir = Join-Path $ProjectRoot 'Data\Logs\Danh muc KH backups'
$approvalPlanFile = Join-Path $masterDataDir 'approved_customers_plan.json'
$applyReportFile = Join-Path $masterDataDir 'approved_customers_apply_report.json'
$masterAnalysisFile = Join-Path $masterDataDir 'master_data_analysis.json'
$masterVerificationFile = Join-Path $verificationDir 'master_data_report.json'

$localNodeModules = Join-Path $PSScriptRoot 'node_modules'
$createdLocalNodeModules = $false

foreach ($requiredPath in @(
    $sourceDir,
    $customerMaster,
    $productMaster
)) {
    if (-not (Test-Path -LiteralPath $requiredPath)) {
        throw "Required path not found: $requiredPath"
    }
}

# Python he thong thuong khong co openpyxl; muon openpyxl da vendor san cua
# skill bao cao de khong phai cai them goi.
$vendorCandidates = @(
    (Join-Path $PSScriptRoot 'vendor'),
    (Join-Path $ProjectRoot 'code\Skill\skill-bao-cao\scripts\vendor')
)
foreach ($vendorDir in $vendorCandidates) {
    if (Test-Path -LiteralPath (Join-Path $vendorDir 'openpyxl\__init__.py')) {
        if ([string]::IsNullOrWhiteSpace($env:PYTHONPATH)) {
            $env:PYTHONPATH = $vendorDir
        } else {
            $env:PYTHONPATH = $vendorDir +
                [System.IO.Path]::PathSeparator + $env:PYTHONPATH
        }
        break
    }
}
$env:PYTHONUTF8 = '1'
$env:PYTHONDONTWRITEBYTECODE = '1'

$script:PythonRuntime = Resolve-SellInPython `
    -ExplicitExecutable $PythonExecutable `
    -Root $ProjectRoot
Write-Host (
    "Python: {0} ({1})" -f
    $script:PythonRuntime.Executable,
    $script:PythonRuntime.Label
)

# Toan bo buoc dung file da chuyen sang Python/openpyxl. Node kem
# @oai/artifact-tool chi con dung cho render_previews.mjs, va la tuy chon:
# khong co Node thi bo qua anh preview, cac buoc khac van chay day du.
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

foreach ($directory in @(
    $outputDir,
    $stagingDir,
    $previewDir,
    $verificationDir,
    $masterDataDir,
    $candidateDir,
    $customerBackupDir,
    $logDir
)) {
    New-Item -ItemType Directory -Force -Path $directory | Out-Null
}

try {
    Write-Host '1/5 - Planning incremental Sell In update...'
    $planArguments = @(
        'plan',
        '--source-dir', $sourceDir,
        '--output-dir', $outputDir,
        '--state-file', $stateFile,
        '--plan-file', $incrementalPlanFile
    )
    foreach ($period in $ForcePeriod) {
        $planArguments += @('--force-period', $period)
    }
    if ($ForceAll) {
        $planArguments += '--force-all'
    }
    Invoke-SellInPython -ArgumentList (
        @((Join-Path $PSScriptRoot 'plan_incremental.py')) + $planArguments
    )
    if ($LASTEXITCODE -ne 0) {
        throw "Incremental planning failed. Review: $incrementalPlanFile"
    }
    $incrementalPlan = Get-Content -Raw -LiteralPath $incrementalPlanFile |
        ConvertFrom-Json
    $rebuildPeriods = @(
        $incrementalPlan.rebuild_periods |
            Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) }
    )
    $rebuildCount = $rebuildPeriods.Count

    Write-Host '2/5 - Checking approved new customers...'
    Invoke-SellInPython -ArgumentList @(
        (Join-Path $PSScriptRoot 'prepare_master_data.py'),
        'plan-approvals',
        '--customer-master', $customerMaster,
        '--candidate-dir', $candidateDir,
        '--plan-file', $approvalPlanFile
    )
    if ($LASTEXITCODE -ne 0) {
        throw "Approved-customer planning failed. Review: $approvalPlanFile"
    }
    $approvalPlan = Get-Content -Raw -LiteralPath $approvalPlanFile |
        ConvertFrom-Json
    $approvedCount = [int]$approvalPlan.approved_count
    $needsMasterData = ($rebuildCount -gt 0) -or ($approvedCount -gt 0)

    # Node chi con phuc vu render anh preview cua cac thang duoc dung lai.
    if ($rebuildCount -gt 0 -and $null -ne $node) {
        if (-not (Test-Path -LiteralPath $localNodeModules)) {
            New-Item -ItemType Junction -Path $localNodeModules -Target $nodeModules |
                Out-Null
            $createdLocalNodeModules = $true
        }
    }
    if ($rebuildCount -gt 0 -and $null -eq $node) {
        Write-Warning (
            'Khong co Node runtime: bo qua anh preview. Workbook Sell In va ' +
            'toan bo buoc kiem tra van chay day du bang Python.'
        )
    }

    if ($rebuildCount -gt 0) {
        $lockedFiles = @()
        foreach ($period in $rebuildPeriods) {
            $parts = $period.Split('-')
            $outputName = 'Sell in T{0:D2}_{1}.xlsx' -f [int]$parts[1], [int]$parts[0]
            $outputPath = Join-Path $outputDir $outputName
            if (Test-Path -LiteralPath $outputPath) {
                try {
                    $handle = [System.IO.File]::Open(
                        $outputPath,
                        [System.IO.FileMode]::Open,
                        [System.IO.FileAccess]::ReadWrite,
                        [System.IO.FileShare]::None
                    )
                    $handle.Dispose()
                } catch {
                    $lockedFiles += $outputPath
                }
            }
        }
        if ($lockedFiles.Count -gt 0) {
            throw "Close these open output files before running:`n$($lockedFiles -join [Environment]::NewLine)"
        }

        Write-Host "3/5 - Rebuilding $rebuildCount changed month(s)..."
        Invoke-SellInPython -ArgumentList @(
            (Join-Path $PSScriptRoot 'extract_sources.py'),
            '--source-dir', $sourceDir,
            '--staging-dir', $stagingDir,
            '--plan-file', $incrementalPlanFile
        )
        if ($LASTEXITCODE -ne 0) {
            throw "Data extraction failed with exit code $LASTEXITCODE."
        }

        $audit = Get-Content -Raw -LiteralPath (Join-Path $stagingDir 'audit.json') |
            ConvertFrom-Json
        foreach ($monthlyFile in $audit.monthly_files) {
            $periodKey = '{0}-{1:D2}' -f $monthlyFile.year, $monthlyFile.month
            Write-Host "  - REBUILD $periodKey"
            Invoke-SellInPython -ArgumentList @(
                (Join-Path $PSScriptRoot 'build_outputs.py'),
                '--staging-dir', $stagingDir,
                '--output-dir', $outputDir,
                '--report-dir', $previewDir,
                '--period', $periodKey
            )
            if ($LASTEXITCODE -ne 0) {
                throw "Workbook creation failed for $periodKey with exit code $LASTEXITCODE."
            }
        }

        # Anh preview khong bat buoc: chi render khi co Node runtime.
        if ($null -ne $node) {
            foreach ($period in $rebuildPeriods) {
                & $node (Join-Path $PSScriptRoot 'render_previews.mjs') `
                    $outputDir `
                    $previewDir `
                    $period
                if ($LASTEXITCODE -ne 0) {
                    Write-Warning "Khong render duoc anh preview cho $period; file Sell In van hop le."
                }
            }
        }

        Write-Host '4/5 - Verifying rebuilt workbooks...'
        Invoke-SellInPython -ArgumentList @(
            (Join-Path $PSScriptRoot 'verify_outputs.py'),
            '--audit-file', (Join-Path $stagingDir 'audit.json'),
            '--output-dir', $outputDir,
            '--report-file', (Join-Path $verificationDir 'verification_report.json')
        )
        if ($LASTEXITCODE -ne 0) {
            throw "Output verification failed with exit code $LASTEXITCODE."
        }
    } else {
        Write-Host '3/5 - No changed month; workbook rebuild skipped.'
        Write-Host '4/5 - No rebuilt workbook requires verification.'
    }

    if ($needsMasterData) {
        Write-Host '5/5 - Processing customer and product master-data review...'
        Invoke-SellInPython -ArgumentList @(
            (Join-Path $PSScriptRoot 'prepare_master_data.py'),
            'apply-approved',
            '--plan-file', $approvalPlanFile,
            '--backup-dir', $customerBackupDir,
            '--report-file', $applyReportFile
        )
        if ($LASTEXITCODE -ne 0) {
            throw "Customer master update failed with exit code $LASTEXITCODE."
        }

        Invoke-SellInPython -ArgumentList @(
            (Join-Path $PSScriptRoot 'prepare_master_data.py'),
            'analyze',
            '--output-dir', $outputDir,
            '--source-dir', $sourceDir,
            '--customer-master', $customerMaster,
            '--product-master', $productMaster,
            '--candidate-dir', $candidateDir,
            '--staging-file', $masterAnalysisFile
        )
        if ($LASTEXITCODE -ne 0) {
            throw "Master-data analysis failed with exit code $LASTEXITCODE."
        }
        Invoke-SellInPython -ArgumentList @(
            (Join-Path $PSScriptRoot 'prepare_master_data.py'),
            'build-review',
            '--analysis-file', $masterAnalysisFile
        )
        if ($LASTEXITCODE -ne 0) {
            throw "Master-data review workbook creation failed with exit code $LASTEXITCODE."
        }

        Invoke-SellInPython -ArgumentList @(
            (Join-Path $PSScriptRoot 'verify_master_data.py'),
            '--analysis-file', $masterAnalysisFile,
            '--apply-report', $applyReportFile,
            '--report-file', $masterVerificationFile
        )
        if ($LASTEXITCODE -ne 0) {
            throw "Master-data verification failed. Review: $masterVerificationFile"
        }
    } else {
        Write-Host '5/5 - No changed month or approved customer; master-data review skipped.'
    }

    if (-not $SkipGoogleDrive -and $rebuildCount -gt 0) {
        if (Test-Path -LiteralPath (Split-Path -Parent $GoogleDriveTarget)) {
            New-Item -ItemType Directory -Force -Path $GoogleDriveTarget |
                Out-Null
            foreach ($period in $rebuildPeriods) {
                $parts = $period.Split('-')
                $outputName = 'Sell in T{0:D2}_{1}.xlsx' -f [int]$parts[1], [int]$parts[0]
                Copy-Item `
                    -LiteralPath (Join-Path $outputDir $outputName) `
                    -Destination $GoogleDriveTarget `
                    -Force
            }
            Write-Host "Rebuilt files copied to: $GoogleDriveTarget"
        } else {
            Write-Warning 'Google Drive was not found. Local files were still created.'
        }
    }

    Invoke-SellInPython -ArgumentList @(
        (Join-Path $PSScriptRoot 'plan_incremental.py'),
        'commit',
        '--plan-file', $incrementalPlanFile,
        '--state-file', $stateFile
    )
    if ($LASTEXITCODE -ne 0) {
        throw "Incremental state commit failed with exit code $LASTEXITCODE."
    }

    Write-Host (
        "Completed. REBUILD: {0}; SKIP: {1}. Output folder: {2}" -f
        $rebuildCount,
        @(
            $incrementalPlan.skipped_periods |
                Where-Object { -not [string]::IsNullOrWhiteSpace([string]$_) }
        ).Count,
        $outputDir
    )
} finally {
    if (
        $createdLocalNodeModules -and
        (Test-Path -LiteralPath $localNodeModules)
    ) {
        [System.IO.Directory]::Delete($localNodeModules)
    }
}
