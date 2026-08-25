# HƯỚNG DẪN SHAREPOINT → VIKODA SELL-IN DASHBOARD

> Mục tiêu: tự cập nhật dữ liệu Sell-In từ SharePoint mà **không phụ thuộc Power Automate Premium**.
>
> Site hiện dùng: `https://vikodacomvn.sharepoint.com/sites/Planning`

---

## 1. KẾT LUẬN SAU KHI KIỂM TRA LỖI

Luồng hiện tại đã có sẵn cơ chế đọc SharePoint bằng **Microsoft Graph API** trong GitHub Actions. Power Automate không cần là thành phần bắt buộc.

Lần chạy cloud gần nhất bị dừng ở bước `Preflight cloud config and resolve SharePoint IDs` vì GitHub Actions chưa có 3 thông tin xác thực Entra bắt buộc:

- `AZURE_TENANT_ID`
- `AZURE_CLIENT_ID`
- `AZURE_CLIENT_SECRET`

`SHAREPOINT_SITE_ID` và `SHAREPOINT_DRIVE_ID` hiện có thể để trống: script `code/common/sharepoint_bootstrap.py` sẽ tự tìm từ hostname/site path nếu ứng dụng Entra đã được cấp quyền đúng.

Ngoài ra Flow Power Automate cũ từng gọi input `deploy_pages` trong khi workflow mới dùng `deploy_now`. Workflow đã được sửa để **chấp nhận cả hai tên**, nhưng cấu hình mới nên dùng `deploy_now`.

---

## 2. KIẾN TRÚC KHUYẾN NGHỊ — KHÔNG CẦN POWER AUTOMATE

```text
ERP / Kế toán
     │
     ▼
SharePoint: Planning / Vikoda_Sales_Data
     │
     │ Microsoft Graph API
     ▼
GitHub Actions
     │
     ├─ tải Data ERP
     ├─ tải Target
     ├─ tải Danh mục KH
     ├─ tải Danh mục SP
     ├─ chạy pipeline Python
     ├─ kiểm tra chất lượng
     └─ deploy dashboard đã được phép phát hành
```

GitHub Actions có thể chạy:

1. thủ công bằng nút **Run workflow**;
2. theo lịch bằng `schedule`;
3. qua Power Automate nếu sau này công ty có license Premium — nhưng đây chỉ là tùy chọn.

### Tại sao chọn cách này?

- Power Automate Free/Microsoft 365 dùng được các connector Standard như SharePoint.
- Action HTTP dùng để POST sang GitHub API là Premium, nên không phù hợp với tài khoản Free.
- GitHub Actions có thể tự kết nối SharePoint bằng Microsoft Graph mà không cần Power Automate làm trung gian.

Tài liệu Microsoft:

- Power Automate licensing: https://learn.microsoft.com/power-platform/admin/power-automate-licensing/types
- SharePoint connector: https://learn.microsoft.com/connectors/sharepointonline/
- Selected permissions: https://learn.microsoft.com/graph/permissions-selected-overview

---

## 3. CẤU HÌNH MICROSOFT ENTRA APP CHO SHAREPOINT

> Phần này thường cần IT/Microsoft 365 Admin hỗ trợ một lần.

### Bước 3.1 — Tạo App Registration

Vào Microsoft Entra admin center:

1. **Microsoft Entra ID** → **App registrations**.
2. Chọn **New registration**.
3. Tên gợi ý: `vikoda-sellin-github-sync`.
4. Account type: chỉ tenant công ty.
5. Không cần Redirect URI cho chế độ `client_credentials`.
6. Bấm **Register**.

Ghi lại:

- **Directory (tenant) ID** → `AZURE_TENANT_ID`
- **Application (client) ID** → `AZURE_CLIENT_ID`

### Bước 3.2 — Tạo Client Secret

1. App → **Certificates & secrets**.
2. **New client secret**.
3. Chọn thời hạn phù hợp theo chính sách IT.
4. Copy **Value** ngay khi tạo.

Giá trị này sẽ dùng cho:

`AZURE_CLIENT_SECRET`

Không commit secret vào Git, `.env`, README hoặc chat.

### Bước 3.3 — Cấp quyền Microsoft Graph

Khuyến nghị quyền tối thiểu:

1. **API permissions** → **Add a permission**.
2. **Microsoft Graph**.
3. **Application permissions**.
4. Chọn `Sites.Selected`.
5. Admin thực hiện **Grant admin consent**.
6. Admin cấp quyền `read` cho app đúng site SharePoint `Planning`.

`Sites.Selected` an toàn hơn `Sites.Read.All` vì app chỉ đọc site được chỉ định.

Nếu IT cần cấu hình nhanh để kiểm tra kỹ thuật, `Sites.Read.All` cũng cho phép đọc, nhưng phạm vi rộng hơn toàn tenant và không phải lựa chọn khuyến nghị cho production.

### Bước 3.4 — Site và document library

Cấu hình mặc định của project:

```text
SHAREPOINT_HOSTNAME = vikodacomvn.sharepoint.com
SHAREPOINT_SITE_PATH = /sites/Planning
```

Workflow sẽ tự resolve:

```text
SHAREPOINT_SITE_ID
SHAREPOINT_DRIVE_ID
```

Vì vậy hai ID này không còn bắt buộc phải tự tìm thủ công.

---

## 4. CẤU HÌNH GITHUB ACTIONS

Mở repository:

`Huanpro1239/vikoda-sellin-dashboard`

Vào:

**Settings → Secrets and variables → Actions**

### 4.1 Repository Secrets — bắt buộc

Tạo đúng 3 secret:

```text
AZURE_TENANT_ID
AZURE_CLIENT_ID
AZURE_CLIENT_SECRET
```

Project cũng hỗ trợ tên cũ sau để tương thích:

```text
MS_TENANT_ID
MS_CLIENT_ID
MS_CLIENT_SECRET
```

Nhưng chỉ nên giữ một bộ tên để tránh nhầm lẫn.

### 4.2 Secrets tùy chọn

Có thể khai báo nếu IT cung cấp sẵn:

```text
SHAREPOINT_SITE_ID
SHAREPOINT_DRIVE_ID
```

Nếu bỏ trống, workflow sẽ tự resolve.

### 4.3 Repository Variables

Khuyến nghị:

```text
SHAREPOINT_HOSTNAME=vikodacomvn.sharepoint.com
SHAREPOINT_SITE_PATH=/sites/Planning
SHAREPOINT_ERP_FOLDER=Data ERP
SHAREPOINT_TARGET_FOLDER=Target
SHAREPOINT_CUSTOMER_FOLDER=Danh muc KH
SHAREPOINT_PRODUCT_FOLDER=Danh muc SP
```

Nếu muốn deploy GitHub Pages, production workflow còn yêu cầu:

```text
ENABLE_PAGES_DEPLOY=true
WEB_DATA_CLASSIFICATION=public-or-sanitized
```

**Không bật hai biến trên nếu dashboard chứa dữ liệu khách hàng/doanh thu nội bộ chưa được ẩn danh hoặc chưa được phê duyệt.** Repository hiện là public; GitHub Pages không phải access control nội bộ.

---

## 5. KIỂM TRA KẾT NỐI SHAREPOINT

Sau khi đã thêm 3 secret:

1. GitHub → tab **Actions**.
2. Chọn workflow **Vikoda Demo Daily Refresh** hoặc production workflow.
3. Chọn **Run workflow**.
4. Theo dõi các bước:

```text
Preflight cloud config and resolve SharePoint IDs
Sync raw ERP data from SharePoint
Sync target data from SharePoint
Sync customer catalog from SharePoint
Sync product catalog from SharePoint
Execute strict Sell-In pipeline
```

Nếu `Preflight` PASS, phần đăng nhập Microsoft Graph đã đúng.

Nếu `Sync raw ERP data` PASS, đường dẫn và quyền SharePoint đã đúng.

---

## 6. CHẾ ĐỘ MIỄN PHÍ KHÔNG CẦN ENTRA APP — ONEDRIVE SYNC + WINDOWS WATCHER

Dùng chế độ này nếu:

- không có Power Automate Premium;
- không có quyền tạo App Registration / Application Permission;
- chấp nhận máy Windows phải bật để xử lý tự động.

### Bước 6.1 — Đồng bộ thư viện SharePoint xuống máy

Trong SharePoint site `Planning`:

1. mở document library chứa `Vikoda_Sales_Data`;
2. bấm **Sync** hoặc **Add shortcut to OneDrive**;
3. đợi OneDrive tạo thư mục trên Windows;
4. xác nhận trong đó có thư mục `Data ERP`.

Ví dụ:

```text
D:\onedrive\Vikoda\Planning - Vikoda_Sales_Data\Data ERP
```

### Bước 6.2 — Khai báo đường dẫn một lần

Mở Command Prompt:

```bat
setx VIKODA_ONEDRIVE_PATH "D:\onedrive\Vikoda\Planning - Vikoda_Sales_Data"
```

Đóng Command Prompt rồi mở lại để Windows nhận biến mới.

Không bắt buộc phải dùng ổ `D:`; watcher đã được sửa để đọc `VIKODA_ONEDRIVE_PATH`.

### Bước 6.3 — Chạy watcher

Nhấp đúp:

```text
Chay CT\Tu dong chay khi SharePoint cap nhat.cmd
```

Watcher sẽ:

1. theo dõi `Data ERP`;
2. phát hiện `.xlsm` / `.xlsx` mới hoặc thay đổi;
3. đợi OneDrive đồng bộ xong;
4. tự chạy pipeline;
5. cập nhật báo cáo/web artifact cục bộ.

Watcher không tự `git add/commit/push` dữ liệu nghiệp vụ để tránh đưa dữ liệu nội bộ lên repository public.

### Bước 6.4 — Tự chạy khi đăng nhập Windows

Có thể đặt shortcut của file:

```text
Chay CT\Tu dong chay khi SharePoint cap nhat.cmd
```

vào thư mục Startup của Windows hoặc tạo Task Scheduler chạy lúc đăng nhập.

---

## 7. NẾU SAU NÀY VẪN MUỐN DÙNG POWER AUTOMATE

SharePoint trigger là Standard, nhưng bước gửi HTTP request trực tiếp đến GitHub API cần Premium. Vì vậy tài khoản Free không nên dùng kiến trúc này.

Nếu công ty có Power Automate Premium, Flow có thể cấu hình:

### Trigger

```text
SharePoint — When a file is created or modified in a folder
```

Folder: `Data ERP`.

### HTTP action

```text
POST https://api.github.com/repos/Huanpro1239/vikoda-sellin-dashboard/actions/workflows/deploy_dashboard.yml/dispatches
```

Headers:

```text
Accept: application/vnd.github+json
Authorization: Bearer <GITHUB_FINE_GRAINED_TOKEN>
X-GitHub-Api-Version: 2026-03-10
Content-Type: application/json
```

Body mới:

```json
{
  "ref": "main",
  "inputs": {
    "deploy_now": true
  }
}
```

Workflow vẫn chấp nhận body cũ có `deploy_pages` để không làm hỏng Flow cũ, nhưng nên chuyển sang `deploy_now`.

Fine-grained GitHub token chỉ cần quyền repository **Actions: Read and write**.

---

## 8. CÁC LỖI THƯỜNG GẶP

### `Missing GitHub Actions secrets: AZURE_TENANT_ID...`

Nguyên nhân: GitHub chưa có 3 secret Entra.

Cách xử lý: làm Mục 3 và 4.

### HTTP 401 từ Microsoft Graph

Nguyên nhân thường gặp:

- sai Tenant ID;
- sai Client ID;
- client secret hết hạn/sai value.

### HTTP 403 từ Microsoft Graph

Nguyên nhân thường gặp:

- app chưa được admin consent;
- dùng `Sites.Selected` nhưng chưa grant app vào site `Planning`;
- chỉ cấp Delegated permission thay vì Application permission.

### Không tìm thấy workbook trong `Data ERP`

Kiểm tra:

```text
SHAREPOINT_ERP_FOLDER
```

Tên phải khớp đúng thư mục thật trong document library.

### GitHub workflow báo `skipped`

Production deploy chỉ chạy khi:

```text
ENABLE_PAGES_DEPLOY=true
WEB_DATA_CLASSIFICATION=public-or-sanitized
```

Đây là guard bảo mật, không phải lỗi kết nối SharePoint.

### Power Automate báo cần Premium

Không sửa bằng cách đổi trigger SharePoint. Nguyên nhân là HTTP action. Chuyển sang:

- GitHub Actions + Microsoft Graph; hoặc
- OneDrive Sync + Windows watcher.

---

## 9. PHƯƠNG ÁN NÊN DÙNG CHO VIKODA

### Có IT/Admin hỗ trợ

**SharePoint → Microsoft Graph → GitHub Actions**.

Ưu điểm: chạy cloud, không cần mở máy, không cần Power Automate Premium.

### Không có quyền Entra Admin

**SharePoint → OneDrive Sync → Windows watcher**.

Ưu điểm: miễn phí và triển khai ngay; nhược điểm là máy phải bật.

### Không khuyến nghị với Power Automate Free

**SharePoint → Power Automate → HTTP → GitHub** vì HTTP là Premium.
