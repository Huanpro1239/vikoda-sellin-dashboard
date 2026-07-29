param(
  [string]$WorkbookPath = ''
)
$ErrorActionPreference = 'Stop'
$projectRoot = if ($PSScriptRoot) { (Resolve-Path "$PSScriptRoot\..\..\..\..").Path } else { (Get-Location).Path }
$candidate = if ($WorkbookPath) { $WorkbookPath } else { "$projectRoot\Data\File bao cao\Excel\Bao_Cao_Sell_in.xlsx" }
$path = (Resolve-Path $candidate).Path
$xl = New-Object -ComObject Excel.Application
$xl.Visible = $false; $xl.DisplayAlerts = $false
$wb = $xl.Workbooks.Open($path)
try {
  $hasPvt=$false; $hasPivot=$false
  try {$null=$wb.Queries.Item('PQ_PVT_DATA');$hasPvt=$true} catch {}
  try {$null=$wb.Queries.Item('PQ_PIVOT');$hasPivot=$true} catch {}
  if($hasPvt -and $hasPivot){$wb.RefreshAll();$xl.CalculateUntilAsyncQueriesDone();$wb.Save();Write-Output "Power Query already portable in $path";return}
  foreach($n in @('PQ_PVT_DATA','PQ_PIVOT','PQ_HuongDan')) { try { $wb.Worksheets.Item($n).Delete() } catch {} }
  foreach($n in @('PQ_PVT_DATA','PQ_PIVOT')) { try { $wb.Queries.Item($n).Delete() } catch {} }
  $pvtSheet=$wb.Worksheets.Item('PVT_DATA'); if($pvtSheet.ListObjects.Count -eq 0){$src=$pvtSheet.Range($pvtSheet.Cells.Item(1,1),$pvtSheet.Cells.Item($pvtSheet.UsedRange.Rows.Count,14)); $srcTable=$pvtSheet.ListObjects.Add(1,$src,$null,1); $srcTable.Name='tblPVTDataPython'} else {$pvtSheet.ListObjects.Item(1).Name='tblPVTDataPython'}
  $mPvt = @'
let S=Excel.CurrentWorkbook(){[Name="tblPVTDataPython"]}[Content], T=Table.TransformColumnTypes(S,{{"MIEN",type text},{"VUNG",type text},{"MaKH",type text},{"KhachHang",type text},{"SanPham",type text},{"Actual",type number},{"CungKyLY",type number},{"ThangTruoc",type number},{"Vikoda",type number},{"TargetTong",type number},{"TargetVikoda",type number},{"KDT",type number},{"VikodaLY",type number},{"VikodaThangTruoc",type number}}) in T
'@
  $mPivot = @'
let S=PQ_PVT_DATA, G=Table.Group(S,{"MIEN","VUNG"},{{"Actual",each List.Sum([Actual]),type number},{"CungKyLY",each List.Sum([CungKyLY]),type number},{"ThangTruoc",each List.Sum([ThangTruoc]),type number},{"Vikoda",each List.Sum([Vikoda]),type number},{"KDT",each List.Sum([KDT]),type number},{"TargetTong",each List.Sum([TargetTong]),type number},{"TargetVikoda",each List.Sum([TargetVikoda]),type number}}) in G
'@
  $wb.Queries.Add('PQ_PVT_DATA',$mPvt) | Out-Null
  $wb.Queries.Add('PQ_PIVOT',$mPivot) | Out-Null
  $s1=$wb.Worksheets.Add(); $s1.Name='PQ_PVT_DATA'; $s2=$wb.Worksheets.Add(); $s2.Name='PQ_PIVOT'
  function Load-Query($ws,$q,$tbl){ $conn=('OLEDB;Provider=Microsoft.Mashup.OleDb.1;Data Source=$Workbook$;Location=' + $q + ';Extended Properties=""'); $qt=$ws.QueryTables.Add($conn,$ws.Range('A1')); $qt.CommandType=2; $qt.CommandText="SELECT * FROM [$q]"; $qt.RefreshOnFileOpen=$false; $qt.Refresh($false) | Out-Null }
  Load-Query $s1 'PQ_PVT_DATA' 'tblPQ_PVT_DATA'; Load-Query $s2 'PQ_PIVOT' 'tblPQ_PIVOT'
  $s1.Visible=0
  $h=$wb.Worksheets.Add(); $h.Name='PQ_HuongDan'; $rows=@(
    @('PHUONG AN 2 - POWER QUERY','',''),
    @('Muc tieu','Power Query doc mo hinh PVT_DATA chuan va tinh lai bang tong hop theo Mien/Vung.',''),
    @('Cach chay','Mo Excel > Data > Refresh All. Query doc tblPVTDataPython va nap ket qua vao PQ_PVT_DATA/PQ_PIVOT.',''),
    @('Doi soat','So sanh PQ_PIVOT voi PIVOT; neu chenh lech, kiem tra ky va ma khach hang.',''),
    @('Nguon','Bang nguon van do phuong an Python tao/cap nhat de bao toan quy trinh va nhat ky.',''),
    @('Luu y','Khong sua truc tiep PQ_PVT_DATA/PQ_PIVOT; chi Refresh All sau khi cap nhat du lieu nguon.','')
  ); $r=1; foreach($row in $rows){$c=1; foreach($v in $row){$h.Cells.Item($r,$c)=$v; $c++}; $r++}; $h.Columns.AutoFit() | Out-Null
  $wb.Save()
} finally { $wb.Close($true); $xl.Quit(); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($xl) }
Write-Output "Updated $path"
