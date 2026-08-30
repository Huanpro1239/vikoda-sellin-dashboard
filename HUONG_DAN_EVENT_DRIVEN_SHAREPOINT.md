# VIKODA SELL-IN — CẬP NHẬT DASHBOARD THEO SỰ KIỆN SHAREPOINT

## Mục tiêu

Không còn polling SharePoint 15/30 phút một lần. Dashboard chỉ chạy refresh khi SharePoint báo có file nguồn được tạo hoặc sửa.

```text
SharePoint file created/modified
        ↓
Power Automate (SharePoint trigger - Standard)
        ↓
GitHub connector: Create a repository dispatch event - Standard
        ↓
repository_dispatch: sharepoint_changed
        ↓
Vikoda Sell-In Pipeline
        ↓
Fingerprint detector xác nhận nguồn thực sự thay đổi
        ↓
Chỉ rebuild ERP period bị ảnh hưởng
        ↓
Deploy GitHub Pages
```

Pipeline vẫn giữ `sharepoint_change_detector_v2.py`. Power Automate chỉ là tín hiệu đánh thức pipeline; GitHub vẫn tự kiểm tra fingerprint để tránh refresh sai hoặc duplicate event.

---

## 1. Flow Power Automate

Tạo **Automated cloud flow**.

### Trigger

Connector: **SharePoint**

Action:

```text
When a file is created or modified (properties only)
```

Cấu hình:

```text
Site Address : https://vikodacomvn.sharepoint.com/sites/Planning
Library Name : Shared Documents / Documents tương ứng trong tenant
Folder       : để trống để bắt thay đổi trong toàn library
```

Không dùng trigger `...in a folder [deprecated]`.

### Condition lọc đúng nguồn dashboard

Chỉ đi nhánh **Yes** khi `Folder path` thuộc một trong 4 vùng sau:

```text
/Vikoda_Sales_Data/Data ERP/
/Vikoda_Sales_Data/Target/
/Vikoda_Sales_Data/DanhMuc_KH/
/Vikoda_Sales_Data/DanhMuc_SP/
```

Không dispatch khi file nằm trong:

```text
/Vikoda_Sales_Data/Data_Goc/
```

Lý do: pipeline tự upload `Data_Goc`; nếu không loại folder này flow sẽ tự kích hoạt lại chính nó.

Có thể dùng Condition với 4 nhánh OR, mỗi nhánh dùng `Folder path` → `contains` hoặc `starts with` theo path thực tế Power Automate trả về.

---

## 2. Action GitHub trong nhánh Yes

Connector: **GitHub**

Action:

```text
Create a repository dispatch event (Preview)
```

Cấu hình:

```text
Repository Owner : Huanpro1239
Repository Name  : vikoda-sellin-dashboard
Event Name       : sharepoint_changed
Event Payload    : {"source":"sharepoint"}
```

GitHub connector và SharePoint connector đều là Standard connectors; không cần dùng HTTP Premium cho kiến trúc này.

---

## 3. GitHub workflow contract

`.github/workflows/vikoda_pipeline.yml` nhận:

```yaml
repository_dispatch:
  types: [sharepoint_changed]
```

Không còn `schedule` cho production refresh.

Khi `sharepoint_changed` đến:

1. Bỏ qua full source test suite vì code trên `main` đã qua CI.
2. Đăng nhập Microsoft Graph bằng GitHub OIDC.
3. Đọc metadata/fingerprint của các folder nguồn.
4. Nếu fingerprint không đổi: STOP sớm.
5. Nếu đổi: xác định ERP period bị ảnh hưởng.
6. Rebuild đúng period, health check, upload `Data_Goc` delta.
7. Build và deploy GitHub Pages.

Manual `workflow_dispatch` vẫn được giữ làm phương án vận hành dự phòng.

---

## 4. Test sau khi merge

### Test A — file không liên quan

Sửa một file ngoài 4 folder nguồn.

Kỳ vọng:

```text
Không có repository_dispatch
Không có dashboard refresh
```

### Test B — ERP thay đổi

Sửa một workbook trong:

```text
Vikoda_Sales_Data/Data ERP/
```

Kỳ vọng:

```text
Power Automate: Success
GitHub event : repository_dispatch / sharepoint_changed
Source change: true
ERP periods changed: chỉ tháng liên quan
Data_Goc workbooks rebuilt: chỉ file tháng liên quan
Deploy GitHub Pages: success
```

### Test C — Data_Goc được pipeline upload

Kỳ vọng:

```text
Power Automate không dispatch lại
Không tạo vòng lặp refresh
```

### Test D — cùng một file bị save nhiều lần

Có thể phát sinh nhiều event. Workflow dùng concurrency để serialize các run và fingerprint detector sẽ STOP sớm các run không còn delta.

---

## 5. Rollback

Nếu Power Automate gặp sự cố, vẫn có thể chạy thủ công:

```text
GitHub → Actions → Vikoda Sell-In Pipeline → Run workflow
run_cloud_refresh = true
```

Không cần khôi phục cron chỉ để chạy một lần.
