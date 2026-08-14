# Hàm dùng chung cho run_target_report.ps1 và run_powerbi_dashboard.ps1.
#
# Nguyên tắc dự án: logic dùng chung giữa các luồng chỉ được có MỘT bản. File
# này giữ phần kiểm tra độ tươi dữ liệu, gọi lại Tach data và mở Power BI
# Desktop; hai script kia chỉ dot-source rồi gọi, không chép lại.

function Get-PipelineFreshness {
    <#
        Gọi pipeline_freshness.py và trả về object đã parse từ JSON.
        Trả $null khi không kiểm tra được, để phía gọi tự quyết định chạy tiếp.
    #>
    param(
        [Parameter(Mandatory = $true)][string]$PythonExecutable,
        [string[]]$PythonPrefix = @(),
        [Parameter(Mandatory = $true)][string]$ScriptRoot,
        [Parameter(Mandatory = $true)][string]$ProjectRoot
    )

    $checker = Join-Path $ScriptRoot 'pipeline_freshness.py'
    if (-not (Test-Path -LiteralPath $checker)) {
        Write-Warning "Khong tim thay $checker; bo qua buoc kiem tra du lieu cu."
        return $null
    }

    $arguments = @($PythonPrefix) + @($checker, '--project-root', $ProjectRoot)
    $output = & $PythonExecutable @arguments 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Kiem tra do tuoi du lieu that bai: $output"
        return $null
    }

    try {
        return ($output -join "`n" | ConvertFrom-Json)
    } catch {
        Write-Warning "Khong doc duoc ket qua kiem tra do tuoi: $_"
        return $null
    }
}

function Write-FreshnessSummary {
    <# In tóm tắt từng chặng để người vận hành thấy vì sao script chạy lại. #>
    param([Parameter(Mandatory = $true)]$Freshness)

    if ($null -eq $Freshness) {
        return
    }
    if ($Freshness.up_to_date) {
        Write-Host 'Kiem tra du lieu: toan bo chuoi da moi nhat.'
        return
    }
    Write-Host 'Kiem tra du lieu: phat hien chang bi cu, se chay lai.'
    $needs = @{
        'tach_data' = [bool]$Freshness.needs_tach_data
        'staging'   = [bool]$Freshness.needs_staging
        'excel'     = [bool]$Freshness.needs_excel
        'powerbi'   = [bool]$Freshness.needs_powerbi
    }
    foreach ($name in @('tach_data', 'staging', 'excel', 'powerbi')) {
        $stage = $Freshness.stages.$name
        if ($null -eq $stage) {
            continue
        }
        # CU = tu no da cu; KE = chinh no con moi nhung chang truoc do da cu.
        $mark = if ($stage.stale) { 'CU' } elseif ($needs[$name]) { 'KE' } else { 'OK' }
        Write-Host ("  [{0}] {1}" -f $mark, $stage.label)
        if ($stage.stale) {
            Write-Host ("       {0}" -f $stage.reason)
        } elseif ($mark -eq 'KE') {
            Write-Host '       Phai dung lai vi chang truoc do da cu.'
        }
    }
}

function Invoke-TachData {
    <#
        Chạy lại bước tách data ERP -> Sell in T*.xlsx.
        Dùng chính run_sell_in.ps1 để không nhân bản logic tách.
    #>
    param(
        [Parameter(Mandatory = $true)][string]$ProjectRoot,
        [string]$PythonExecutable = ''
    )

    $runner = Join-Path $ProjectRoot 'code\Skill\sell-in-monthly\scripts\run_sell_in.ps1'
    if (-not (Test-Path -LiteralPath $runner)) {
        throw "Khong tim thay script tach data: $runner"
    }

    Write-Host 'Tach data: file ERP moi hon workbook Sell In, dang tach lai...'
    $arguments = @(
        '-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass',
        '-File', $runner,
        '-ProjectRoot', $ProjectRoot,
        '-SkipGoogleDrive',
        # Buoc nay chi can workbook thang; CSV gop cho Looker la viec cua
        # Tach data.cmd, khong dung o day nen bo qua cho nhanh.
        '-SkipLookerDataset'
    )
    if (-not [string]::IsNullOrWhiteSpace($PythonExecutable)) {
        $arguments += @('-PythonExecutable', $PythonExecutable)
    }

    $previousNoPause = $env:TACH_DATA_NO_PAUSE
    $env:TACH_DATA_NO_PAUSE = '1'
    try {
        & "$PSHOME\powershell.exe" @arguments
        $code = $LASTEXITCODE
    } finally {
        $env:TACH_DATA_NO_PAUSE = $previousNoPause
    }

    if ($code -ne 0) {
        throw "Tach data that bai voi exit code $code. Dong workbook dang mo roi chay lai."
    }
    Write-Host 'Tach data: hoan tat.'
}

function Open-PowerBIProject {
    <#
        Mở file .pbip bằng Power BI Desktop để người dùng chỉ việc bấm Refresh.
        Không tìm thấy Power BI Desktop thì chỉ cảnh báo, không làm hỏng luồng.
    #>
    param([Parameter(Mandatory = $true)][string]$ProjectFile)

    if (-not (Test-Path -LiteralPath $ProjectFile)) {
        Write-Warning "Khong tim thay project Power BI de mo: $ProjectFile"
        return
    }

    $candidates = @(
        'C:\Program Files\Microsoft Power BI Desktop\bin\PBIDesktop.exe',
        'C:\Program Files (x86)\Microsoft Power BI Desktop\bin\PBIDesktop.exe',
        "$env:LOCALAPPDATA\Microsoft\WindowsApps\PBIDesktopStore.exe"
    )
    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate) {
            Write-Host "Dang mo Power BI Desktop: $ProjectFile"
            Write-Host 'Trong Power BI Desktop, bam Refresh de nap so lieu moi.'
            Start-Process -FilePath $candidate -ArgumentList ('"{0}"' -f $ProjectFile)
            return
        }
    }

    # Không có đường dẫn quen thuộc thì để Windows tự chọn ứng dụng mặc định.
    try {
        Write-Host "Dang mo project Power BI: $ProjectFile"
        Start-Process -FilePath $ProjectFile
    } catch {
        Write-Warning (
            'Khong tim thay Power BI Desktop. Goi PBIP van da duoc tao, ' +
            "hay mo thu cong: $ProjectFile"
        )
    }
}
