[CmdletBinding()]
param(
    [string]$ProjectRoot = '',
    [string]$PythonExecutable = '',
    # Xóa thật. Không có tham số này thì chỉ liệt kê những gì sẽ xóa.
    [switch]$Confirm,
    # Liệt kê đầy đủ thay vì vài ví dụ mỗi nhóm.
    [switch]$Verbose
)

$ErrorActionPreference = 'Stop'

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
    throw 'Khong tim thay Python 3.8+ de chay don dep.'
}

$env:PYTHONUTF8 = '1'
$env:PYTHONDONTWRITEBYTECODE = '1'

$cleaner = Join-Path $PSScriptRoot 'cleanup_workspace.py'
$arguments = @($cleaner, '--project-root', $ProjectRoot)
if ($Confirm) {
    $arguments += '--confirm'
}
if ($Verbose) {
    $arguments += '--verbose'
}

& $python @arguments
$code = $LASTEXITCODE

if (-not $Confirm) {
    Write-Host ''
    Write-Host 'Day moi la chay thu. De xoa that:'
    Write-Host '    .\Chay CT\Don dep.cmd -Confirm'
}

exit $code
