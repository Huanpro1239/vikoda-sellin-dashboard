"""Chạy toàn bộ test của skill.

Dùng:  python run_tests.py
Trả mã thoát khác 0 khi có test trượt, để gọi được từ script khác.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
TESTS_DIR = SCRIPT_DIR / "tests"

sys.path.insert(0, str(SCRIPT_DIR))
vendor = SCRIPT_DIR.parents[1] / "skill-bao-cao" / "scripts" / "vendor"
if (vendor / "openpyxl" / "__init__.py").is_file():
    sys.path.append(str(vendor))


def main() -> int:
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    for path in sorted(TESTS_DIR.glob("test_*.py")):
        spec = loader.discover(
            start_dir=str(TESTS_DIR),
            pattern=path.name,
            top_level_dir=str(TESTS_DIR),
        )
        suite.addTests(spec)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    raise SystemExit(main())
