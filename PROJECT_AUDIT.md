# PROJECT AUDIT — VIKODA SELL-IN DATA PLATFORM v2.4

**Repository:** `Huanpro1239/vikoda-sellin-dashboard`  
**Ngày cập nhật:** 25/08/2026  
**Trạng thái:** production ETL/Data_Goc đã E2E validated; SharePoint watcher + Executive Dashboard v2.4 cần CI/manual re-validation sau thay đổi.

## 1. Kiến trúc

```text
SharePoint sources
→ Microsoft Graph metadata watcher
→ SHA-256 change fingerprint
→ GitHub Actions OIDC / Entra
→ Python ETL --strict
→ Validation + Health Check
→ Data_Goc + web/data
→ SharePoint Data_Goc upload
→ Web regression
→ source-state checkpoint
→ optional gated web deploy
```

Không dùng Power Automate/Flow làm production trigger và không dùng Azure Client Secret dài hạn.

## 2. Baseline production

Manual run #29 (`32869379937`) đã PASS end-to-end: OIDC, site/drive resolve, ERP/Target/DMKH/DMSP downloads, strict ETL, dashboard-data export, health check và Data_Goc upload.

## 3. Thay đổi v2.4

### Change-aware refresh

`code/common/sharepoint_change_detector.py` bổ sung:

- recursive workbook discovery qua Graph;
- ignore Office lock files;
- SHA-256 fingerprint từ Graph metadata;
- checkpoint tại `Data_Goc/_vikoda_pipeline_state.json`;
- state chỉ commit sau successful ETL/upload/web validation;
- schedule 30 phút, ETL chỉ chạy khi source đổi;
- manual refresh force full rebuild.

### Executive Dashboard

Presentation được thiết kế lại theo management-dashboard layout:

```text
01 Tổng quan
02 Vùng - Miền
03 Khách hàng
04 Sale quản lý
05 Sản phẩm
06 Chênh lệch
```

Global KPI strip: `Actual · Cùng kỳ · Target · % Đạt Target · Tăng trưởng`.

Không thay calculation engine. `VikodaDataEngine` và ECharts hiện hữu tiếp tục là nguồn logic/visualization.

## 4. Security controls

- `Data/` và `web/data/` production không commit.
- OIDC only; không Client Secret production.
- `Sites.Selected` + Planning site `write` là authorization mục tiêu.
- Watcher state nằm ở SharePoint, không commit state/data vào public repo.
- Pages chỉ mở khi `ENABLE_PAGES_DEPLOY=true` và `WEB_DATA_CLASSIFICATION=public-or-sanitized`.
- Manual Pages publish còn cần `publish_dashboard=true`.
- Customer/revenue-level dashboard là internal; JavaScript password không phải access control.

## 5. Validation requirements v2.4

Push CI:

```text
Repository hygiene          PASS
Python suite                PASS (bao gồm change-detector tests)
Web JS syntax               PASS
Web regression              PASS
Cloud refresh on push       SKIPPED
```

Manual production run tiếp theo phải xác nhận:

```text
Change detector (forced)             PASS
All SharePoint downloads             PASS
Strict ETL                           PASS
Dashboard JSON/JS fresh              PASS
Health check                         PASS
Data_Goc upload                      PASS
Generated web regression             PASS
SharePoint state checkpoint          PASS
```

Sau manual success, scheduled poll không có source change phải trả `changed=false` và skip ETL.

## 6. Non-blocking risks

1. Polling 30 phút không phải real-time webhook và GitHub cron có thể delay.
2. Public repo không phù hợp để chứa production dashboard payload.
3. Pages không phù hợp cho internal customer-level data; cần authenticated/private hosting nếu muốn chia sẻ đầy đủ nội bộ qua web.
4. `main` hiện chưa branch-protected.
5. Source folder names là API contract; rename cần code/doc/E2E validation.

## 7. Definition of Done

```text
CI PASS
Manual watcher/ETL/web build PASS
Data_Goc upload PASS
State checkpoint PASS
No-change scheduled poll PASS
```

Runbook: [`HUONG_DAN_SHAREPOINT_GITHUB_ACTIONS.md`](HUONG_DAN_SHAREPOINT_GITHUB_ACTIONS.md).
