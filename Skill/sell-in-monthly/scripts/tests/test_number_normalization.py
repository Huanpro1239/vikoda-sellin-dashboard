from __future__ import annotations

import sys
import unittest
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPT_DIR))

from normalization import clean_number, quantity_number_format  # noqa: E402


class CleanNumberTests(unittest.TestCase):
    def test_whole_numbers_do_not_keep_decimal_suffix(self) -> None:
        for value in (240.0, "240.0", "240.", "1,200.0"):
            with self.subTest(value=value):
                result = clean_number(value)
                self.assertEqual(result, int(result))
                self.assertIsInstance(result, int)

    def test_real_decimals_are_preserved(self) -> None:
        self.assertEqual(clean_number(1.92), 1.92)
        self.assertEqual(clean_number("1.92"), 1.92)

    def test_quantity_format_only_shows_real_decimals(self) -> None:
        self.assertEqual(quantity_number_format(120), "#,##0")
        self.assertEqual(quantity_number_format(120.0), "#,##0")
        self.assertEqual(quantity_number_format(1.92), "#,##0.##")

    def test_empty_and_invalid_values_are_blank(self) -> None:
        self.assertIsNone(clean_number(None))
        self.assertIsNone(clean_number(""))
        self.assertIsNone(clean_number("not-a-number"))


if __name__ == "__main__":
    unittest.main()
