[CmdletBinding()]
param(
    [string]$ProjectRoot = '',
    [string]$PyInstaller = '',
    [string]$CodeSigningCertificateThumbprint = '',
    [string]$TimestampServer = ''
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
    $ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
}

# Tim pyinstaller.exe: tham so truyen vao, .runtime cua du an, roi PATH.
if ([string]::IsNullOrWhiteSpace($PyInstaller)) {
    $pyInstallerCandidates = @(
        (Join-Path $ProjectRoot '.runtime\python\Scripts\pyinstaller.exe'),
        (Join-Path $ProjectRoot '.venv\Scripts\pyinstaller.exe')
    )
    $found = Get-Command 'pyinstaller.exe' -ErrorAction SilentlyContinue
    if ($null -ne $found) {
        $pyInstallerCandidates += $found.Source
    }
    foreach ($candidate in $pyInstallerCandidates) {
        if (Test-Path -LiteralPath $candidate) {
            $PyInstaller = $candidate
            break
        }
    }
}
if ([string]::IsNullOrWhiteSpace($PyInstaller) -or
    -not (Test-Path -LiteralPath $PyInstaller)) {
    throw @'
Khong tim thay pyinstaller.exe.
Cach xu ly, chon mot trong hai:
  1. Cai dat: python -m pip install pyinstaller
  2. Chi dinh truc tiep:
     build_portable.ps1 -PyInstaller "D:\duong\dan\pyinstaller.exe"
'@
}
Write-Host "PyInstaller: $PyInstaller"

$assetDir = Join-Path $ProjectRoot 'Skill\sell-in-monthly\assets\portable'
$workDir = Join-Path $ProjectRoot 'Data\Work\portable_build'
$specDir = Join-Path $ProjectRoot 'Data\Work\portable_spec'
$source = Join-Path $PSScriptRoot 'portable_sell_in.py'

foreach ($directory in @($assetDir, $workDir, $specDir)) {
    New-Item -ItemType Directory -Force -Path $directory | Out-Null
}

& $PyInstaller `
    --noconfirm `
    --clean `
    --onefile `
    --console `
    --name TachDataPortable `
    --distpath $assetDir `
    --workpath $workDir `
    --specpath $specDir `
    $source
if ($LASTEXITCODE -ne 0) {
    throw "Portable build failed with exit code $LASTEXITCODE."
}

$exePath = Join-Path $assetDir 'TachDataPortable.exe'
if (-not [string]::IsNullOrWhiteSpace($CodeSigningCertificateThumbprint)) {
    $certificatePath = (
        'Cert:\CurrentUser\My\{0}' -f
        $CodeSigningCertificateThumbprint.Replace(' ', '')
    )
    if (-not (Test-Path -LiteralPath $certificatePath)) {
        throw "Code-signing certificate was not found: $certificatePath"
    }
    $certificate = Get-Item -LiteralPath $certificatePath
    $signatureParameters = @{
        FilePath = $exePath
        Certificate = $certificate
        HashAlgorithm = 'SHA256'
    }
    if (-not [string]::IsNullOrWhiteSpace($TimestampServer)) {
        $signatureParameters['TimestampServer'] = $TimestampServer
    }
    $signature = Set-AuthenticodeSignature @signatureParameters
    if ($signature.Status -ne 'Valid') {
        throw "Executable signing failed: $($signature.StatusMessage)"
    }
    Write-Host "Signature: $($signature.Status)"
    Write-Host "Signer: $($certificate.Subject)"
}

$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $exePath).Hash
$hashPath = Join-Path $assetDir 'SHA256.txt'
Set-Content -LiteralPath $hashPath -Encoding ascii -Value @(
    'TachDataPortable.exe'
    "SHA256: $hash"
)

Write-Host "Portable executable: $exePath"
Write-Host "SHA256: $hash"
