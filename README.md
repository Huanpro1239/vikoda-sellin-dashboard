<div align="center">

# VIKODA SELL-IN DASHBOARD

**Event-driven SharePoint → Incremental ETL → Data_Goc → Executive Web Dashboard**

[![Vikoda Sell-In Pipeline](https://github.com/Huanpro1239/vikoda-sellin-dashboard/actions/workflows/vikoda_pipeline.yml/badge.svg)](https://github.com/Huanpro1239/vikoda-sellin-dashboard/actions/workflows/vikoda_pipeline.yml)

### [MỞ DASHBOARD VIKODA](https://huanpro1239.github.io/vikoda-sellin-dashboard/)

</div>

---

## 1. Mục tiêu

Dự án biến dữ liệu Sell-In trên SharePoint thành dashboard quản trị có kiểm soát chất
lượng. Production không chạy ETL theo lịch cố định: SharePoint chỉ đánh thức pipeline
khi file nguồn được tạo hoặc sửa, sau đó GitHub tự xác minh fingerprint để quyết định
có cần rebuild hay không.

```text
SharePoint source change
        ↓
Power Automate Standard
        ↓ repository_dispatch: sharepoint_changed
GitHub Actions
        ↓
GitHub OIDC → Microsoft Entra → Microsoft Graph
        ↓
Fingerprint / delta detection
        ↓
Incremental ETL
        ↓
Validation + Health Check + Web Regression
        ↓
SharePoint Data_Goc + GitHub Pages
```

**Nguyên tắc:** event chỉ là tín hiệu. Không có delta thực → pipeline STOP sớm, không
ETL và không deploy thừa.

---

## 2. Dành cho người xem dashboard

Nếu chỉ cần xem báo cáo:

1. Mở dashboard bằng link phía trên.
2. Chọn kỳ báo cáo và bộ lọc.
3. Theo dõi các KPI chính: `Actual · Cùng kỳ · Target · % Đạt Target · Tăng trưởng`.
4. Trên mobile, dùng thanh điều hướng dưới cùng và vuốt ngang các chart/table rộng.

**Hướng dẫn sử dụng:** [HUONG_DAN_NHAN_VIEN_VIKODA.md](HUONG_DAN_NHAN_VIEN_VIKODA.md)

### Các trang chính

| Trang | Nội dung |
|---|---|
| **01. Tổng quan** | Actual/Cùng kỳ/Target, cơ cấu kênh, Group Brand, gap Target |
| **02. Vùng - Miền** | Xu hướng, cơ cấu Miền/Vùng, vùng ưu tiên, bao bì |
| **03. Khách hàng** | Top khách hàng, hệ thống MT, movement/churn |
| **04. Sale quản lý** | Bảng chi tiết, tìm kiếm, sắp xếp, export Excel |
| **05. Sản phẩm** | Group Brand/Brand/SKU, xu hướng và SKU suy giảm |
| **06. Chênh lệch** | Gap Target và phân tích chênh lệch |

---

## 3. Production trigger

Power Automate dùng trigger SharePoint:

```text
When a file is created or modified (properties only)
```

Chỉ dispatch GitHub khi `Folder path` thuộc một trong bốn nguồn:

```text
Vikoda_Sales_Data/Data ERP
Vikoda_Sales_Data/Target
Vikoda_Sales_Data/DanhMuc_KH
Vikoda_Sales_Data/DanhMuc_SP
```

Không dispatch `Vikoda_Sales_Data/Data_Goc` vì đây là output do pipeline tự ghi; lọc
folder này là điều kiện bắt buộc để tránh refresh loop.

GitHub nhận duy nhất event production:

```yaml
repository_dispatch:
  types: [sharepoint_changed]
```

Production workflow **không có cron/schedule polling**. `workflow_dispatch` vẫn được
giữ làm fallback vận hành thủ công.

---

## 4. Incremental processing

Ví dụ ERP tháng 08/2026 thay đổi:

```text
T01–T07  → SKIP
T08      → REBUILD
T09+     → SKIP
```

Change detector so metadata/fingerprint hiện tại với state của lần chạy thành công gần
nhất. State chỉ được cập nhật sau khi pipeline thành công, vì vậy một run lỗi không bị
đánh dấu nhầm là đã xử lý.

SharePoint output:

```text
Vikoda_Sales_Data/Data_Goc/
├── Sell in Txx_yyyy.xlsx
├── _vikoda_pipeline_state.json
└── _vikoda_incremental_state.json
```

---

## 5. SharePoint contract

```text
Shared Documents/
└── Vikoda_Sales_Data/
    ├── Data ERP/
    ├── Target/
    ├── DanhMuc_KH/
    │   └── Thong tin khach hang.xlsx
    ├── DanhMuc_SP/
    │   └── Danh Muc San Pham.xlsx
    └── Data_Goc/
```

Nếu đổi tên/path, phải cập nhật đồng bộ Power Automate condition, GitHub workflow,
runbook và code liên quan.

---

## 6. Release gates

Dashboard chỉ được phát hành khi các gate chính đều PASS:

```text
Source fingerprint
      ↓
Incremental ETL
      ↓
Data validation
      ↓
System health check
      ↓
JavaScript syntax
      ↓
Web regression tests
      ↓
Pages artifact
      ↓
GitHub Pages deploy
```

Nếu nguồn không đổi, các bước download/ETL/deploy được bỏ qua. Nếu build lỗi trước
Pages deployment, phiên bản dashboard đang chạy không bị thay bằng artifact lỗi.

---

## 7. Authentication và quyền

Microsoft Graph production sử dụng:

```text
GitHub OIDC
Microsoft Entra Federated Credential
Microsoft Graph
Sites.Selected
```

Repository Variables bắt buộc:

```text
AZURE_TENANT_ID
AZURE_CLIENT_ID
```

Không dùng `AZURE_CLIENT_SECRET` dài hạn trong production workflow.

Power Automate/GitHub connector chỉ có nhiệm vụ gửi `repository_dispatch`; token Graph
không nằm trong Power Automate flow.

---

## 8. Cấu trúc repository

```text
.github/workflows/
  vikoda_pipeline.yml          # CI + cloud refresh + Pages deploy

code/common/
  sharepoint_bootstrap.py      # resolve site/drive Graph
  sharepoint_change_detector_v2.py
  incremental_cloud_pipeline.py
  validation.py
  validate_workflow_policy.py

code/Skill/
  sell-in-monthly/             # nghiệp vụ tách Sell-In theo kỳ
  skill-bao-cao/               # reporting, target, export dashboard

code/tests/                    # production hardening tests
web/
  index.html
  js/
  css/
  tests/

Chay CT/                       # launcher local/manual, không phải production trigger
```

Runtime data (`Data/`, `web/data/`) không được commit vào Git.

---

## 9. Kiểm tra trước khi merge

Python 3.12 được dùng trong CI.

```bash
python -m pip install -r requirements.txt
python code/run_all_tests.py --quiet
npm run verify:web
```

Workflow policy có regression test riêng để ngăn các lỗi kiến trúc như:

- đưa cron polling trở lại production;
- đổi sai event `sharepoint_changed`;
- thêm `AZURE_CLIENT_SECRET`;
- cấp `id-token: write` cho job không cần thiết;
- đưa Microsoft Entra auth vào Pages deploy job.

---

## 10. Chạy fallback thủ công

Khi Power Automate gặp sự cố:

```text
GitHub
→ Actions
→ Vikoda Sell-In Pipeline
→ Run workflow
→ Branch: main
→ run_cloud_refresh = true
```

Manual run vẫn chạy change detector/incremental planner; không cần khôi phục cron.

---

## 11. Security transparency

`Data/` và generated `web/data/` không được commit vào repository. Tuy nhiên GitHub
Pages là static public hosting và production hiện publish **đầy đủ dashboard payload**
được build cho web.

Lớp đăng nhập trong `web/js/auth.js` chỉ là optional client-side UX gate; nó **không
phải security boundary** và không thể biến public Pages thành private application.

Xem chi tiết: [SECURITY.md](SECURITY.md)

---

## 12. Tài liệu vận hành

- [Hướng dẫn nhân viên](HUONG_DAN_NHAN_VIEN_VIKODA.md)
- [Runbook SharePoint / GitHub Actions](HUONG_DAN_SHAREPOINT_GITHUB_ACTIONS.md)
- [Engineering guardrails](AGENTS.md)
- [Project audit / quality baseline](PROJECT_AUDIT.md)
