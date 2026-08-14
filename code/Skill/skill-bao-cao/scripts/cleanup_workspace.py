"""Dọn rác tái tạo được trong dự án Bao cao Sell in.

Thiết kế theo nguyên tắc **chặn mặc định**: chỉ những mẫu nằm trong
`CLEANUP_RULES` mới bị xóa, và mọi ứng viên còn phải vượt qua hàng rào
`PROTECTED_PATHS` trước khi được đụng tới. Thêm một quy tắc mới mà vô tình
chạm vào dữ liệu nguồn thì script dừng ngay với lỗi, thay vì xóa nhầm.

Hai thứ tuyệt đối không được mất, đã ghi trong README:

* `Data/Logs/Tach data logs/incremental_state.json` — mốc so sánh tăng dần.
* `Data/Work/sell_in/new_customers/` — quyết định duyệt khách hàng mới.

Dùng:
    python cleanup_workspace.py --project-root .            # chạy thử, chỉ liệt kê
    python cleanup_workspace.py --project-root . --confirm  # xóa thật
"""

from __future__ import annotations

import argparse
import shutil
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Sequence


@dataclass(frozen=True)
class CleanupRule:
    """Một nhóm rác: mô tả để in ra, và các mẫu glob tính từ gốc dự án."""

    name: str
    reason: str
    patterns: tuple[str, ...]
    directories: bool = False
    # Mac dinh chot chan thu hai tu choi moi file co duoi thuoc
    # NEVER_TOUCH_SUFFIXES. Mot so rac tai tao duoc lai dung chinh nhung duoi do
    # (.csv, .json trong Data/Work), nen phai bat co nay thi quy tac moi cham
    # duoc. Bat co la hanh dong co y, doc code thay ngay, khong the vo tinh.
    allow_data_suffix: bool = False


CLEANUP_RULES: tuple[CleanupRule, ...] = (
    CleanupRule(
        name="Sandbox Power BI cu",
        reason="Ban nhap cua phien lam viec truoc, dung lai duoc bang launcher.",
        patterns=("Data/Work/bao_cao/powerbi_sandbox_*",),
        directories=True,
    ),
    CleanupRule(
        name="Anh chup man hinh go loi",
        reason="Anh debug roi o goc thu muc lam viec, khong script nao doc.",
        patterns=("Data/Work/bao_cao/*.png",),
    ),
    CleanupRule(
        name="Bytecode Python",
        reason="Tu sinh lai khi chay; con giu ca .pyc cua module da xoa.",
        patterns=("**/__pycache__",),
        directories=True,
    ),
    CleanupRule(
        name="Bytecode Python roi",
        reason="File .pyc/.pyo nam ngoai __pycache__.",
        patterns=("**/*.pyc", "**/*.pyo"),
    ),
    CleanupRule(
        name="File tam cua Excel",
        reason="Sinh ra khi workbook dang mo, sot lai khi Excel dong dot ngot.",
        patterns=("**/~$*", "**/*.tmp", "**/.*.tmp.xlsx"),
    ),
    CleanupRule(
        name="Rac cua he dieu hanh",
        reason="Windows/macOS tu tao khi duyet thu muc.",
        patterns=("**/Thumbs.db", "**/desktop.ini", "**/.DS_Store"),
    ),
    CleanupRule(
        name="Ban chup PBIX loi thoi",
        reason="Quy trinh moi chi dung PBIP; PBIX khong tu cap nhat theo du lieu.",
        patterns=("Data/File bao cao/**/*.pbix",),
    ),
    CleanupRule(
        name="Thu muc Power bi trung ten",
        reason="Thu muc rong viet thuong, de nham voi PowerBI that.",
        patterns=("Data/File bao cao/Power bi",),
        directories=True,
    ),
    CleanupRule(
        name="CSV gop nguon Looker",
        reason=(
            "Dung xuat ra Looker, dung lai duoc tu Data/out put trong ~30 giay. "
            "Chiem ~19 MB nen khong nen giu khi sao chep du an."
        ),
        patterns=("Data/Work/sell_in/looker/*.csv",),
        allow_data_suffix=True,
    ),
    CleanupRule(
        name="Staging JSON cua thang Sell In",
        reason=(
            "Ban trung gian trong cung mot lan chay: extract_sources ghi ra, "
            "build_outputs doc xong la het viec. Workbook trong Data/out put "
            "moi la ban chinh thuc."
        ),
        # Chi lay sell_in_*.json. `audit.json` cung thu muc thi verify_outputs
        # con doc, va staging cua bao_cao la dau vao cua pipeline bao cao —
        # test_cleanup_workspace.py khoa ca hai thu do.
        patterns=("Data/Work/sell_in/staging/sell_in_*.json",),
        allow_data_suffix=True,
    ),
    CleanupRule(
        name="Anh va report preview Sell In",
        reason=(
            "Chi de soi mat thuong sau khi dung file, khong script nao doc lai. "
            "Can Node moi render lai duoc."
        ),
        patterns=(
            "Data/Work/sell_in/previews/*.png",
            "Data/Work/sell_in/previews/*.json",
        ),
        allow_data_suffix=True,
    ),
    CleanupRule(
        name="Report doi soat cua lan chay truoc",
        reason=(
            "Moi lan chay ghi de lai. Giu lai ban cu chi gay nham khi doi soat, "
            "vi khong biet so nao thuoc lan chay nao."
        ),
        patterns=(
            "Data/Work/sell_in/verification/verification_report_canonical.json",
            "Data/Work/sell_in/verification/looker_report.json",
        ),
        allow_data_suffix=True,
    ),
)

# Hàng rào cứng. Bất kỳ ứng viên nào nằm trong (hoặc chính là) các đường dẫn
# này đều bị từ chối, kể cả khi một quy tắc ở trên khớp phải nó.
PROTECTED_PATHS: tuple[str, ...] = (
    "Data/Logs/Tach data logs/incremental_state.json",
    "Data/Work/sell_in/new_customers",
    # Cau hinh dich Drive rieng cua may nay. Xoa di thi lan chay sau day file
    # len sai thu muc.
    "Chay CT/drive.conf",
    # rclone.exe va cau hinh remote: mat thi phai tai lai va dang nhap lai.
    ".runtime/rclone",
    "Data/Data ERP",
    "Data/Target",
    "Data/Danh muc KH",
    "Data/Danh muc SP",
    "Data/Danh Sach Sales",
    "Data/out put",
    "Data/Logs/Danh muc KH backups",
    ".git",
)

# Thư viện vendored: bytecode trong đó cũng là rác, nhưng KHÔNG được xóa mã
# nguồn. Quy tắc bytecode ở trên đã đủ hẹp; ghi ra đây để người đọc yên tâm.
NEVER_TOUCH_SUFFIXES = (".py", ".ps1", ".cmd", ".md", ".json", ".xlsx", ".xlsm", ".csv")


@dataclass
class Candidate:
    path: Path
    rule: CleanupRule
    size: int
    is_dir: bool


@dataclass
class CleanupReport:
    candidates: list[Candidate] = field(default_factory=list)
    refused: list[tuple[Path, str]] = field(default_factory=list)
    deleted: list[Path] = field(default_factory=list)
    failed: list[tuple[Path, str]] = field(default_factory=list)

    @property
    def total_size(self) -> int:
        return sum(item.size for item in self.candidates)


def directory_size(path: Path) -> int:
    total = 0
    for child in path.rglob("*"):
        if child.is_file():
            try:
                total += child.stat().st_size
            except OSError:
                pass
    return total


def is_protected(path: Path, root: Path) -> str | None:
    """Trả về lý do từ chối, hoặc None nếu được phép xóa."""
    for protected in PROTECTED_PATHS:
        guard = (root / protected).resolve()
        try:
            resolved = path.resolve()
        except OSError:
            return "Khong phan giai duoc duong dan."
        if resolved == guard or guard in resolved.parents:
            return f"Nam trong vung bao ve '{protected}'."
    return None


def collect(root: Path) -> CleanupReport:
    report = CleanupReport()
    seen: set[Path] = set()

    for rule in CLEANUP_RULES:
        for pattern in rule.patterns:
            for path in sorted(root.glob(pattern)):
                if path in seen:
                    continue
                if rule.directories and not path.is_dir():
                    continue
                if not rule.directories and not path.is_file():
                    continue

                reason = is_protected(path, root)
                if reason is not None:
                    report.refused.append((path, reason))
                    continue

                # Chốt chặn thứ hai: quy tắc xóa file không được nhắm vào mã
                # nguồn hay dữ liệu, trừ khi chính quy tắc đó nói rõ là PBIX.
                if (
                    not rule.directories
                    and not rule.allow_data_suffix
                    and path.suffix.lower() in NEVER_TOUCH_SUFFIXES
                    and ".tmp" not in path.name
                    and not path.name.startswith("~$")
                ):
                    report.refused.append(
                        (path, "Duoi file thuoc nhom ma nguon/du lieu, khong xoa.")
                    )
                    continue

                seen.add(path)
                size = directory_size(path) if path.is_dir() else path.stat().st_size
                report.candidates.append(
                    Candidate(path=path, rule=rule, size=size, is_dir=path.is_dir())
                )

    report.candidates = drop_nested(report.candidates)
    return report


def drop_nested(candidates: list[Candidate]) -> list[Candidate]:
    """Bỏ ứng viên nằm trong một thư mục đã bị chọn xóa.

    Không có bước này thì mỗi file `.pyc` bên trong `__pycache__` lại được liệt
    kê riêng, dù cả thư mục cha sắp bị xóa — báo cáo phình lên hàng trăm dòng
    vô nghĩa và tổng dung lượng bị đếm hai lần.
    """
    selected_dirs = [item.path.resolve() for item in candidates if item.is_dir]
    if not selected_dirs:
        return candidates

    kept: list[Candidate] = []
    for item in candidates:
        resolved = item.path.resolve()
        if any(parent in selected_dirs for parent in resolved.parents):
            continue
        kept.append(item)
    return kept


def human(size: int) -> str:
    value = float(size)
    for unit in ("B", "KB", "MB", "GB"):
        if value < 1024 or unit == "GB":
            return f"{value:.1f} {unit}" if unit != "B" else f"{int(value)} B"
        value /= 1024
    return f"{value:.1f} GB"


def apply(report: CleanupReport) -> None:
    for item in report.candidates:
        try:
            if item.is_dir:
                shutil.rmtree(item.path)
            else:
                item.path.unlink()
            report.deleted.append(item.path)
        except OSError as error:
            report.failed.append((item.path, str(error)))


MAX_EXAMPLES_PER_RULE = 6


def render(report: CleanupReport, root: Path, confirmed: bool, verbose: bool = False) -> str:
    lines: list[str] = []
    if not report.candidates:
        lines.append("Khong tim thay rac nao. Du an da sach.")
    else:
        header = "DA XOA" if confirmed else "SE XOA (chay thu, chua dong gi)"
        lines.append(f"{header} — {len(report.candidates)} muc, {human(report.total_size)}:")

        # Gom theo quy tắc rồi chỉ in vài ví dụ: danh sách phẳng hàng trăm dòng
        # thì người vận hành không đọc, mà không đọc thì việc chạy thử vô nghĩa.
        grouped: dict[str, list[Candidate]] = {}
        for item in report.candidates:
            grouped.setdefault(item.rule.name, []).append(item)

        for rule_name, items in grouped.items():
            total = sum(item.size for item in items)
            lines.append(f"\n  {rule_name} — {len(items)} muc, {human(total)}")
            lines.append(f"    ly do: {items[0].rule.reason}")
            shown_items = items if verbose else items[:MAX_EXAMPLES_PER_RULE]
            for item in shown_items:
                try:
                    shown = item.path.relative_to(root).as_posix()
                except ValueError:
                    shown = str(item.path)
                suffix = "/" if item.is_dir else ""
                lines.append(f"    - {shown}{suffix}  ({human(item.size)})")
            if len(items) > len(shown_items):
                lines.append(
                    f"    ... va {len(items) - len(shown_items)} muc tuong tu "
                    "(them --verbose de xem het)"
                )

    if report.refused:
        lines.append(f"\nDA TU CHOI {len(report.refused)} muc nam trong vung bao ve:")
        for path, reason in report.refused[:10]:
            try:
                shown = path.relative_to(root).as_posix()
            except ValueError:
                shown = str(path)
            lines.append(f"    - {shown}: {reason}")
        if len(report.refused) > 10:
            lines.append(f"    (+{len(report.refused) - 10} muc khac)")

    if report.failed:
        lines.append(f"\nKHONG XOA DUOC {len(report.failed)} muc:")
        for path, error in report.failed:
            lines.append(f"    - {path}: {error}")

    if report.candidates and not confirmed:
        lines.append("\nThem --confirm de xoa that.")

    return "\n".join(lines)


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-root", required=True, help="Thu muc goc du an.")
    parser.add_argument(
        "--confirm",
        action="store_true",
        help="Xoa that. Khong co tham so nay thi chi liet ke.",
    )
    parser.add_argument(
        "--verbose",
        action="store_true",
        help="Liet ke day du thay vi chi vai vi du moi nhom.",
    )
    arguments = parser.parse_args(argv)

    root = Path(arguments.project_root).expanduser().resolve()
    if not root.is_dir():
        print(f"Khong tim thay thu muc du an: {root}", file=sys.stderr)
        return 2
    if not (root / "Data").is_dir() or not (root / "code").is_dir():
        print(
            f"'{root}' khong giong thu muc du an Bao cao Sell in "
            "(thieu 'Data' hoac 'code'). Dung sai thu muc thi dung lai cho chac.",
            file=sys.stderr,
        )
        return 2

    report = collect(root)
    if arguments.confirm:
        apply(report)
    print(render(report, root, confirmed=arguments.confirm, verbose=arguments.verbose))
    return 1 if report.failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
