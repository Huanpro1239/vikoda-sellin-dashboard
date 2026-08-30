# PROJECT AUDIT — VIKODA SELL-IN DASHBOARD

**Baseline date:** 2026-08-30  
**Production branch:** `main`  
**Primary workflow:** `.github/workflows/vikoda_pipeline.yml`

## 1. Audit objective

Giữ repository nhỏ về mặt khái niệm, một kiến trúc production duy nhất, security
contract rõ ràng và regression gates đủ mạnh để refactor không làm sai dữ liệu.

Audit không chấm điểm bằng số tùy ý. Chất lượng được đánh giá bằng các gate có thể
kiểm chứng trong CI và bằng việc loại bỏ architecture/code không còn được sử dụng.

---

## 2. Production architecture

```text
SharePoint
→ Power Automate Standard event signal
→ repository_dispatch: sharepoint_changed
→ GitHub Actions
→ GitHub OIDC / Microsoft Entra
→ Microsoft Graph
→ fingerprint detector
→ incremental ETL
→ validation / health / web regression
→ SharePoint Data_Goc + GitHub Pages
```

### Invariants

- Không scheduled SharePoint polling.
- `workflow_dispatch` tồn tại làm fallback.
- Power Automate không xử lý ETL và không giữ Graph client secret.
- `Data_Goc` không được dispatch ngược lại GitHub.
- Fingerprint detector xác minh event trước download/ETL.
- State chỉ commit sau run thành công.

---

## 3. Quality gates

### Python

```bash
python code/run_all_tests.py --quiet
```

Bao gồm test cho hai skill nghiệp vụ và production-hardening layer.

### Web

```bash
npm run verify:web
```

Bao gồm JavaScript syntax check và Node regression tests.

### Workflow policy

`code/common/validate_workflow_policy.py` bảo vệ:

- event `sharepoint_changed`;
- không cron polling;
- manual fallback;
- không `AZURE_CLIENT_SECRET`;
- least-privilege `id-token`;
- Azure/Graph auth chỉ ở cloud-refresh;
- Pages job tách biệt Microsoft Entra auth.

---

## 4. Data/security boundary

### Không commit

```text
Data/
web/data/
.env
access/refresh token
client secret
production workbook
customer/revenue export
```

### Public Pages risk

GitHub Pages hiện là public static hosting và dashboard payload đã deploy phải được
coi là public. Client-side `auth.js` chỉ là UX gate, không phải security boundary.

---

## 5. Cleanup decisions

### Xóa

- `code/common/sharepoint_change_detector.py`: detector V1 không còn production use/test;
  V2 là implementation duy nhất được workflow và test suite sử dụng.
- `code/Skill/skill-bao-cao/scripts/auto_watch_sharepoint.ps1`: local FileSystemWatcher
  trùng production event-driven capability.
- `Chay CT/Tu dong chay khi SharePoint cap nhat.cmd`: launcher của watcher local đã loại bỏ.
- `HUONG_DAN_EVENT_DRIVEN_SHAREPOINT.md`: nội dung được hợp nhất vào runbook chính để
  tránh hai tài liệu production drift khỏi nhau.

### Giữ

- `Chay CT/` còn lại: manual/local launchers cho tác vụ hỗ trợ, không phải production trigger.
- Versioned web layers (`reference-*`, `page05-*`, `mobile-v6`): được
  `executive-ui.js` load động và có regression tests, vì vậy không phải dead code.
- `code/Prompt/` và `code/Skill/*/SKILL.md`: knowledge/agent assets, không nằm trên
  production runtime path nhưng có giá trị bảo trì.

---

## 6. Documentation source of truth

Các file phải đồng bộ khi đổi architecture:

```text
README.md
HUONG_DAN_SHAREPOINT_GITHUB_ACTIONS.md
AGENTS.md
SECURITY.md
PROJECT_AUDIT.md
```

Không tạo một runbook production thứ hai nếu nội dung có thể hợp nhất vào runbook chính.

---

## 7. Remaining improvement backlog

Không blocker cho production, nhưng là các bước nâng chất lượng tiếp theo:

1. Tách các module JavaScript lớn theo domain khi có feature change thực sự, thay vì
   refactor chỉ để giảm số dòng.
2. Bổ sung test contract cho schema `dashboard_data` nếu schema tiếp tục mở rộng.
3. Đánh giá private hosting/access control nếu dashboard payload không phù hợp để public.
4. Định kỳ rà dependency và GitHub Actions qua Dependabot.
5. Khi legacy Windows launcher không còn người dùng, xóa theo usage evidence thay vì
   giữ vô thời hạn.

---

## 8. Definition of Done cho PR production

Một PR thay đổi runtime/cloud chỉ được coi là hoàn tất khi:

```text
CI hygiene PASS
Python tests PASS
Web syntax PASS
Web regression PASS
Workflow policy PASS
Docs architecture không drift
Không thêm runtime data/secrets vào Git
```

Nếu thay đổi cloud path/OIDC/event contract, sau merge phải có end-to-end run thật hoặc
manual validation trên `main`.
