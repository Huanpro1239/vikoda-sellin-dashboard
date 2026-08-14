"""Kiểm tra độ tươi của từng chặng trong chuỗi dữ liệu Sell In.

Chuỗi phụ thuộc:

    Data ERP (.xlsm)
        -> [Tach data]      -> Data/out put/Sell in hang  thang/Sell in T*.xlsx
        -> [Bao cao Target] -> Data/Work/bao_cao/*/staging/*.json
                            -> Data/File bao cao/Excel/Bao_Cao_Sell_in.xlsx
                            -> Data/File bao cao/PowerBI/Data/*.csv + PBIP

Một chặng bị coi là "cũ" khi thiếu đầu ra, hoặc khi file nguồn mới nhất có mốc
thời gian muộn hơn file đầu ra cũ nhất. Đây là bản logic DUY NHẤT dùng chung cho
cả `run_target_report.ps1` lẫn `run_powerbi_dashboard.ps1`; không nhân bản sang
PowerShell.

Dùng:
    python pipeline_freshness.py --project-root "D:\\Vikoda\\Bao cao Sell in"
    python pipeline_freshness.py --project-root ... --format text

Luôn thoát mã 0 khi kiểm tra được, để phía gọi đọc JSON và tự quyết định.
Thoát mã 2 khi thiếu thư mục nguồn bắt buộc.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Sequence

# Tên file ERP nguồn và workbook Sell In theo tháng, dùng để ghép cặp theo kỳ.
ERP_PATTERN = re.compile(
    r"^BCDonHangBanTrongKyNPP_[A-Za-z]+_T(?P<month>\d{1,2})_(?P<year>\d{4})\.xlsm$",
    re.IGNORECASE,
)
MONTHLY_PATTERN = re.compile(
    r"^Sell in T(?P<month>\d{1,2})_(?P<year>\d{4})\.xlsx$",
    re.IGNORECASE,
)

# Sai số cho phép giữa nguồn và đầu ra (giây). Một số hệ thống file ghi mốc
# thời gian với độ phân giải 2 giây, nên so bằng "lớn hơn hẳn" để tránh báo cũ
# nhầm ngay sau khi vừa chạy xong.
TOLERANCE_SECONDS = 2.0

# File tạm Excel tạo ra khi mở workbook; không tính vào mốc thời gian.
IGNORED_PREFIXES = ("~$",)


def _is_relevant(path: Path) -> bool:
    if not path.is_file():
        return False
    return not path.name.startswith(IGNORED_PREFIXES)


def _collect(patterns: Sequence[tuple[Path, str]]) -> list[Path]:
    """Gom file theo danh sách (thư mục, glob), bỏ file tạm."""
    found: list[Path] = []
    for directory, glob in patterns:
        if not directory.is_dir():
            continue
        found.extend(path for path in directory.glob(glob) if _is_relevant(path))
    return found


def _describe(path: Path, root: Path) -> dict:
    try:
        relative = path.relative_to(root).as_posix()
    except ValueError:
        relative = str(path)
    mtime = path.stat().st_mtime
    return {
        "path": relative,
        "mtime": mtime,
        "modified_at": datetime.fromtimestamp(mtime).isoformat(timespec="seconds"),
    }


def _newest(paths: Iterable[Path], root: Path) -> dict | None:
    items = [_describe(path, root) for path in paths]
    if not items:
        return None
    return max(items, key=lambda item: item["mtime"])


def _oldest(paths: Iterable[Path], root: Path) -> dict | None:
    items = [_describe(path, root) for path in paths]
    if not items:
        return None
    return min(items, key=lambda item: item["mtime"])


def evaluate_stage(
    name: str,
    label: str,
    sources: Sequence[Path],
    outputs: Sequence[Path],
    required_outputs: Sequence[Path],
    root: Path,
) -> dict:
    """So mốc thời gian nguồn với đầu ra của một chặng."""
    missing = [
        path.relative_to(root).as_posix() if path.is_absolute() and root in path.parents else str(path)
        for path in required_outputs
        if not path.exists()
    ]

    newest_source = _newest(sources, root)
    oldest_output = _oldest([path for path in outputs if _is_relevant(path)], root)

    if not sources:
        return {
            "name": name,
            "label": label,
            "stale": False,
            "reason": "Khong tim thay file nguon nao de so sanh.",
            "newest_source": None,
            "oldest_output": oldest_output,
            "missing_outputs": missing,
        }

    if missing or oldest_output is None:
        return {
            "name": name,
            "label": label,
            "stale": True,
            "reason": "Thieu dau ra: " + (", ".join(missing) if missing else "chua co file nao."),
            "newest_source": newest_source,
            "oldest_output": oldest_output,
            "missing_outputs": missing,
        }

    delta = newest_source["mtime"] - oldest_output["mtime"]
    if delta > TOLERANCE_SECONDS:
        reason = (
            f"Nguon '{newest_source['path']}' ({newest_source['modified_at']}) "
            f"moi hon dau ra '{oldest_output['path']}' ({oldest_output['modified_at']})."
        )
        return {
            "name": name,
            "label": label,
            "stale": True,
            "reason": reason,
            "newest_source": newest_source,
            "oldest_output": oldest_output,
            "missing_outputs": missing,
        }

    return {
        "name": name,
        "label": label,
        "stale": False,
        "reason": "Dau ra moi hon nguon.",
        "newest_source": newest_source,
        "oldest_output": oldest_output,
        "missing_outputs": missing,
    }


def _period_of(path: Path, pattern: re.Pattern[str]) -> tuple[int, int] | None:
    match = pattern.match(path.name)
    if match is None:
        return None
    return int(match.group("year")), int(match.group("month"))


def evaluate_tach_data(
    erp_files: Sequence[Path],
    monthly_files: Sequence[Path],
    master_files: Sequence[Path],
    root: Path,
) -> dict:
    """Tach data chạy tăng dần nên phải so từng kỳ, không so cả thư mục.

    Workbook `Sell in T01_2025.xlsx` có mốc thời gian cũ là chuyện bình thường
    khi tháng đó không đổi. Chỉ coi là cũ khi file ERP của ĐÚNG kỳ đó mới hơn
    workbook của chính kỳ đó, hoặc khi kỳ đó chưa có workbook.
    """
    outputs_by_period: dict[tuple[int, int], Path] = {}
    for path in monthly_files:
        period = _period_of(path, MONTHLY_PATTERN)
        if period is not None:
            outputs_by_period[period] = path

    stale_periods: list[dict] = []
    for path in erp_files:
        period = _period_of(path, ERP_PATTERN)
        if period is None:
            continue
        label = f"T{period[1]:02d}/{period[0]}"
        output = outputs_by_period.get(period)
        if output is None:
            stale_periods.append(
                {
                    "period": label,
                    "reason": f"Chua co workbook Sell In cho ky {label}.",
                    "source": _describe(path, root),
                    "output": None,
                }
            )
            continue
        source_info = _describe(path, root)
        output_info = _describe(output, root)
        if source_info["mtime"] - output_info["mtime"] > TOLERANCE_SECONDS:
            stale_periods.append(
                {
                    "period": label,
                    "reason": (
                        f"ERP '{source_info['path']}' ({source_info['modified_at']}) moi hon "
                        f"'{output_info['path']}' ({output_info['modified_at']})."
                    ),
                    "source": source_info,
                    "output": output_info,
                }
            )

    # Danh mục khách hàng dùng chung cho mọi kỳ: chỉ cần so với workbook mới
    # nhất, vì lần chạy Tach data gần nhất đã áp dụng bản DMKH tại thời điểm đó.
    newest_output = _newest(monthly_files, root)
    newest_master = _newest(master_files, root)
    master_stale = (
        newest_master is not None
        and newest_output is not None
        and newest_master["mtime"] - newest_output["mtime"] > TOLERANCE_SECONDS
    )
    if master_stale:
        stale_periods.append(
            {
                "period": "master",
                "reason": (
                    f"Danh muc '{newest_master['path']}' ({newest_master['modified_at']}) moi hon "
                    f"workbook Sell In moi nhat '{newest_output['path']}' ({newest_output['modified_at']})."
                ),
                "source": newest_master,
                "output": newest_output,
            }
        )

    stale = bool(stale_periods)
    if not erp_files:
        reason = "Khong tim thay file ERP nao de so sanh."
    elif stale:
        reason = " ".join(item["reason"] for item in stale_periods[:3])
        if len(stale_periods) > 3:
            reason += f" (+{len(stale_periods) - 3} ky khac)"
    else:
        reason = "Moi ky ERP deu da duoc tach sang workbook Sell In."

    return {
        "name": "tach_data",
        "label": "Tach data (ERP -> Sell in T*.xlsx)",
        "stale": stale and bool(erp_files),
        "reason": reason,
        "newest_source": _newest(list(erp_files) + list(master_files), root),
        "oldest_output": newest_output,
        "missing_outputs": [],
        "stale_periods": stale_periods,
    }


def build_report(root: Path) -> dict:
    erp_dir = root / "Data" / "Data ERP"
    monthly_dir = root / "Data" / "out put" / "Sell in hang  thang"
    target_dir = root / "Data" / "Target"
    dmkh_dir = root / "Data" / "Danh muc KH"
    dmsp_file = root / "Data" / "Danh muc SP" / "Danh Muc San Pham.xlsx"
    sales_dir = root / "Data" / "Danh Sach Sales"

    work = root / "Data" / "Work" / "bao_cao"
    staging_files = [
        work / "data" / "staging" / "sell_in_data.json",
        work / "target" / "staging" / "target_records.json",
        work / "dmkh" / "staging" / "dmkh_data.json",
    ]

    excel_file = root / "Data" / "File bao cao" / "Excel" / "Bao_Cao_Sell_in.xlsx"
    powerbi_dir = root / "Data" / "File bao cao" / "PowerBI"
    powerbi_data = powerbi_dir / "Data"
    powerbi_outputs = [
        powerbi_data / f"{name}.csv"
        for name in (
            "DimDate",
            "DimCustomer",
            "DimProduct",
            "DimTerritory",
            "FactSellIn",
            "FactTarget",
        )
    ]
    model_bim = powerbi_dir / "Vikoda_SellIn_PowerBI.SemanticModel" / "model.bim"
    model_tmdl = powerbi_dir / "Vikoda_SellIn_PowerBI.SemanticModel" / "definition" / "model.tmdl"
    model_file = model_bim if model_bim.is_file() else model_tmdl
    powerbi_required = powerbi_outputs + [
        powerbi_dir / "Vikoda_SellIn_PowerBI.pbip",
        model_file,
    ]

    monthly_files = _collect([(monthly_dir, "Sell in T*.xlsx")])
    reference_files = _collect(
        [
            (target_dir, "*.xlsx"),
            (dmkh_dir, "*.xlsx"),
            (sales_dir, "*.xlsx"),
        ]
    )
    if _is_relevant(dmsp_file):
        reference_files.append(dmsp_file)

    tach_data = evaluate_tach_data(
        erp_files=_collect([(erp_dir, "*.xlsm")]),
        monthly_files=monthly_files,
        master_files=_collect([(dmkh_dir, "*.xlsx")]),
        root=root,
    )

    staging = evaluate_stage(
        name="staging",
        label="Trich xuat staging (Sell in + Target + DMKH -> JSON)",
        sources=monthly_files + reference_files,
        outputs=staging_files,
        required_outputs=staging_files,
        root=root,
    )

    excel = evaluate_stage(
        name="excel",
        label="Workbook Bao_Cao_Sell_in.xlsx",
        sources=staging_files,
        outputs=[excel_file],
        required_outputs=[excel_file],
        root=root,
    )

    powerbi = evaluate_stage(
        name="powerbi",
        label="Goi Power BI (CSV + PBIP)",
        sources=staging_files + ([dmsp_file] if _is_relevant(dmsp_file) else []),
        outputs=powerbi_outputs,
        required_outputs=powerbi_required,
        root=root,
    )

    stages = [tach_data, staging, excel, powerbi]

    # Chặng sau luôn phải chạy lại khi chặng trước cũ, kể cả khi mốc thời gian
    # riêng của nó còn mới.
    needs_tach_data = tach_data["stale"]
    needs_staging = needs_tach_data or staging["stale"]
    needs_excel = needs_staging or excel["stale"]
    needs_powerbi = needs_staging or powerbi["stale"]

    return {
        "project_root": str(root),
        "checked_at": datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
        "tolerance_seconds": TOLERANCE_SECONDS,
        "stages": {stage["name"]: stage for stage in stages},
        "stale_stages": [stage["name"] for stage in stages if stage["stale"]],
        "needs_tach_data": needs_tach_data,
        "needs_staging": needs_staging,
        "needs_excel": needs_excel,
        "needs_powerbi": needs_powerbi,
        "up_to_date": not (needs_tach_data or needs_staging or needs_excel or needs_powerbi),
    }


def format_text(report: dict) -> str:
    """In trạng thái từng chặng, phân biệt 'tự cũ' với 'cũ lây từ chặng trước'."""
    needs = {
        "tach_data": report["needs_tach_data"],
        "staging": report["needs_staging"],
        "excel": report["needs_excel"],
        "powerbi": report["needs_powerbi"],
    }
    lines = []
    if report["up_to_date"]:
        lines.append("Toan bo chuoi du lieu da moi nhat.")
    else:
        lines.append("Phat hien du lieu cu, se chay lai cac chang can thiet:")
    for name, stage in report["stages"].items():
        if stage["stale"]:
            mark = "CU"
        elif needs.get(name):
            mark = "KE"  # kế thừa: chính nó còn mới nhưng chặng trước đã cũ
        else:
            mark = "OK"
        lines.append(f"  [{mark}] {stage['label']}")
        if stage["stale"]:
            lines.append(f"       {stage['reason']}")
        elif mark == "KE":
            lines.append("       Phai dung lai vi chang truoc do da cu.")
    return "\n".join(lines)


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--project-root",
        required=True,
        help="Thu muc goc du an, vi du D:\\Vikoda\\Bao cao Sell in",
    )
    parser.add_argument(
        "--format",
        choices=("json", "text"),
        default="json",
        help="Dinh dang ket qua (mac dinh json de script khac doc).",
    )
    arguments = parser.parse_args(argv)

    root = Path(arguments.project_root).expanduser().resolve()
    if not root.is_dir():
        print(f"Khong tim thay thu muc du an: {root}", file=sys.stderr)
        return 2

    report = build_report(root)
    if arguments.format == "text":
        print(format_text(report))
    else:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
