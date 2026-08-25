"""Script Kiểm tra Sức khỏe Toàn diện Hệ thống (System Health Check).

Chạy độc lập để kiểm tra:
1. Môi trường Python & Thư viện phụ thuộc
2. Dữ liệu đầu vào & Staging data
3. Kết quả ETL & File báo cáo Excel
4. Tính toàn vẹn của Web Dashboard
"""

from __future__ import annotations

import json
import sys
from pathlib import Path


DASHBOARD_JS_PREFIX = "window.VIKODA_DATA = "
REQUIRED_WEB_FILES = (
    "index.html",
    "css/executive-dashboard.css",
    "css/vikoda-powerbi-theme.css",
    "css/reference-dashboard-v3.css",
    "css/reference-fidelity-v4.css",
    "css/page05-sale-v5.css",
    "css/mobile-v6.css",
    "js/app.js",
    "js/charts.js",
    "js/data-engine.js",
    "js/executive-ui.js",
    "js/reference-analytics.js",
    "js/reference-fidelity-v4.js",
    "js/reference-geography-v4.js",
    "js/page05-sale-v5.js",
    "js/mobile-v6.js",
    "js/auth.js",
)


def check_python_version() -> bool:
    return sys.version_info >= (3, 10)


def check_dependencies() -> bool:
    try:
        import pandas  # noqa: F401
        import openpyxl  # noqa: F401
        import xlsxwriter  # noqa: F401
        return True
    except ImportError:
        return False


def check_input_data(project_root: Path) -> bool:
    staging_dir = project_root / "Data/Work/bao_cao/data/staging"
    sell_in_file = staging_dir / "sell_in_data.json"
    target_file = project_root / "Data/Work/bao_cao/target/staging/target_records.json"
    dmkh_file = project_root / "Data/Work/bao_cao/dmkh/staging/dmkh_data.json"
    return all(f.exists() and f.stat().st_size > 0 for f in [sell_in_file, target_file, dmkh_file])


def check_etl_output(project_root: Path) -> bool:
    master_xlsx = project_root / "Data/File bao cao/Bao_Cao_Sell_in.xlsx"
    quality_report = project_root / "Data/Work/data_quality_report.json"
    if not master_xlsx.exists() or not quality_report.exists():
        return False
    try:
        rep = json.loads(quality_report.read_text(encoding="utf-8"))
        return rep.get("status") == "PASS"
    except Exception:
        return False


def check_dashboard_data(project_root: Path) -> bool:
    json_path = project_root / "web/data/dashboard_data.json"
    js_path = project_root / "web/data/dashboard_data.js"
    if not json_path.exists() or not js_path.exists():
        return False
    try:
        data = json.loads(json_path.read_text(encoding="utf-8"))
        js_text = js_path.read_text(encoding="utf-8").strip()
        if not js_text.startswith(DASHBOARD_JS_PREFIX) or not js_text.endswith(";"):
            return False
        js_data = json.loads(js_text[len(DASHBOARD_JS_PREFIX):-1].strip())
        if js_data != data:
            return False

        meta = data.get("metadata", {})
        count_checks = {
            "fact_count": len(data.get("fact_sell_in", [])),
            "target_count": len(data.get("fact_target", [])),
            "customer_count": len(data.get("dim_customer", {})),
            "product_count": len(data.get("dim_product", {})),
        }
        return (
            meta.get("quality_status") == "PASS"
            and count_checks["fact_count"] > 0
            and all(meta.get(key) == value for key, value in count_checks.items())
        )
    except Exception:
        return False


def check_web_files(project_root: Path) -> bool:
    web_dir = project_root / "web"
    required = [web_dir / relative for relative in REQUIRED_WEB_FILES]
    return all(f.exists() and f.is_file() and f.stat().st_size > 0 for f in required)


def run_health_check(project_root: Path) -> int:
    results = {
        "Python": check_python_version(),
        "Dependencies": check_dependencies(),
        "Input data": check_input_data(project_root),
        "ETL output": check_etl_output(project_root),
        "Dashboard data": check_dashboard_data(project_root),
        "Web files": check_web_files(project_root),
    }

    print("\nVIKODA SELL-IN HEALTH CHECK\n")
    all_pass = True
    for item, status in results.items():
        status_str = "PASS" if status else "FAIL"
        print(f"{item:<18} {status_str}")
        if not status:
            all_pass = False

    print()
    if all_pass:
        print("SYSTEM HEALTHY\n")
        return 0

    print("SYSTEM UNHEALTHY - Review failed items above.\n")
    return 1


if __name__ == "__main__":
    root = Path(__file__).resolve().parent.parent if (Path(__file__).parent.name == "code") else Path(__file__).resolve().parent
    sys.exit(run_health_check(root))
