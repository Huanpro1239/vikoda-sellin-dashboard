"""Chạy test của mọi skill trong dự án bằng một lệnh.

Trước khi triển khai hoặc chuyển giao, cần một câu trả lời duy nhất cho câu hỏi
"dự án còn chạy đúng không". Hai skill có runner riêng nên phải gọi cả hai; script
này gom lại và trả mã thoát khác 0 nếu bất kỳ skill nào trượt.

Mỗi runner chạy trong **tiến trình con riêng**, không import chung. Hai skill đều
có thư mục `tests/` và đều tự thêm `scripts/` của mình vào `sys.path`; gộp vào một
tiến trình thì tên module trùng nhau và test này sẽ nạp mã của skill kia.

Dùng:
    python code/run_all_tests.py           # chạy hết, in tóm tắt
    python code/run_all_tests.py --quiet   # chỉ in dòng tổng kết mỗi skill
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SKILL_RUNNERS = (
    ("sell-in-monthly", "code/Skill/sell-in-monthly/scripts/run_tests.py"),
    ("skill-bao-cao", "code/Skill/skill-bao-cao/scripts/run_tests.py"),
    ("production-hardening", "code/tests/run_tests.py"),
)
COUNT_PATTERN = re.compile(r"^Ran (\d+) tests?", re.MULTILINE)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Chỉ in dòng tổng kết của mỗi skill, bỏ danh sách từng test.",
    )
    return parser.parse_args()


def run_skill(name: str, relative: str, quiet: bool) -> tuple[bool, int]:
    runner = PROJECT_ROOT / relative
    if not runner.is_file():
        print(f"[{name}] KHONG TIM THAY runner: {runner}")
        return False, 0

    print(f"\n=== {name} ===")
    completed = subprocess.run(
        [sys.executable, str(runner)],
        capture_output=True,
        text=True,
        cwd=str(PROJECT_ROOT),
    )
    # unittest in ket qua ra stderr, khong phai stdout.
    output = completed.stderr + completed.stdout
    match = COUNT_PATTERN.search(output)
    count = int(match.group(1)) if match else 0

    if quiet and completed.returncode == 0:
        print(f"[{name}] OK — {count} test")
    else:
        print(output.rstrip())

    return completed.returncode == 0, count


def main() -> int:
    args = parse_args()
    results: list[tuple[str, bool, int]] = []
    for name, relative in SKILL_RUNNERS:
        ok, count = run_skill(name, relative, args.quiet)
        results.append((name, ok, count))

    total = sum(count for _, _, count in results)
    failed = [name for name, ok, _ in results if not ok]

    print("\n" + "=" * 52)
    for name, ok, count in results:
        print(f"  {'OK  ' if ok else 'FAIL'}  {name}: {count} test")
    print(f"  Tong: {total} test")

    if failed:
        print(f"\nCO SKILL TRUOT: {', '.join(failed)}")
        return 1
    print("\nTat ca test dat. San sang trien khai.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
