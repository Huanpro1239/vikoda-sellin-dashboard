"""Lock the generated Power BI star schema, measures and PBIR page structure."""

from __future__ import annotations

import csv
import json
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPT_DIR))

from build_powerbi_package import MONEY_FORMAT, QUANTITY_FORMAT, REPORT_NAME, build_dimensions, build_package  # noqa: E402


class PowerBIPackageTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        sell_in = {
            "current_year": 2026,
            "through_month": 7,
            "as_of_date": "2026-07-28",
            "rows": [
                ["", "", "2026-07-10", "KH1", "KH 1", "SP1", "Vikoda 1.5L", 10, 100, 1000, "Đơn hàng bán", "", 7, 2026],
                ["", "", "2025-07-10", "KH1", "KH 1", "SP1", "Vikoda 1.5L", 8, 100, 800, "Đơn hàng bán", "", 7, 2025],
                ["", "", "2026-06-10", "KH1", "KH 1", "SP2", "KDT 500ml", 9, 100, 900, "Đơn hàng bán", "", 6, 2026],
            ],
        }
        target = {"records": [{
            "Ky": "202607", "Nam": 2026, "Thang": 7,
            "MaKhachHangMoi": "KH1", "TenKhachHang": "KH 1",
            "TargetTong": 1200, "TargetVikoda": 700,
            "MienBaoCao": "Miền Bắc", "VungBaoCao": "Hà Nội",
            "NguonFile": "Target.xlsx",
        }]}
        dmkh = {"rows": [["KH1", "KH 1", "KH 1", "", "GT", "NPP", "", "Miền Bắc", "Hà Nội", "Hà Nội", "", "", "", ""]]}
        self.sell_payload = sell_in
        self.target_payload = target
        self.dmkh_payload = dmkh
        self.sell_path = self.root / "sell.json"
        self.target_path = self.root / "target.json"
        self.dmkh_path = self.root / "dmkh.json"
        for path, payload in ((self.sell_path, sell_in), (self.target_path, target), (self.dmkh_path, dmkh)):
            path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        self.output = self.root / "PowerBI"
        self.manifest = build_package(self.sell_path, self.target_path, self.dmkh_path, self.output)

    def tearDown(self) -> None:
        self.temp.cleanup()

    def test_writes_six_star_schema_tables(self) -> None:
        self.assertEqual(self.manifest["package_version"], "1.9.0")
        self.assertEqual(self.manifest["tables"]["FactSellIn"], 3)
        self.assertEqual(self.manifest["tables"]["FactTarget"], 1)
        self.assertEqual(self.manifest["tables"]["DimTerritory"], 20)
        for name in ("DimDate", "DimCustomer", "DimProduct", "DimTerritory", "FactSellIn", "FactTarget"):
            self.assertTrue((self.output / "Data" / f"{name}.csv").is_file())
        with (self.output / "Data" / "DimDate.csv").open(encoding="utf-8-sig", newline="") as handle:
            date_rows = list(csv.DictReader(handle))
        self.assertIn("MonthAxis", date_rows[0])
        self.assertEqual(date_rows[0]["MonthAxis"], "25/07")
        self.assertEqual(date_rows[-1]["MonthAxis"], "26/12")

    def test_current_period_totals_reconcile(self) -> None:
        totals = self.manifest["totals_vnd"]
        self.assertEqual(totals["actual"], 1000)
        self.assertEqual(totals["target"], 1200)
        self.assertEqual(totals["last_year"], 800)
        self.assertEqual(totals["previous_month"], 900)

    def test_pbir_has_four_management_pages(self) -> None:
        report = self.output / f"{REPORT_NAME}.Report"
        pages = json.loads((report / "definition" / "pages" / "pages.json").read_text(encoding="utf-8"))
        self.assertEqual(
            pages["pageOrder"],
            ["CEO_TongQuan", "KeHoach_DuBao", "Vung_Mien", "KhachHang_SanPham"],
        )
        for page in pages["pageOrder"]:
            page_dir = report / "definition" / "pages" / page
            self.assertTrue((page_dir / "page.json").is_file())
            self.assertTrue(any((page_dir / "visuals").glob("*/visual.json")))

    def test_pbir_uses_executive_1280x720_layout(self) -> None:
        report = self.output / f"{REPORT_NAME}.Report"
        pages_dir = report / "definition" / "pages"
        page = json.loads((pages_dir / "CEO_TongQuan" / "page.json").read_text(encoding="utf-8"))
        self.assertEqual((page["width"], page["height"]), (1280, 720))
        self.assertEqual(page["displayName"], "01. CEO | Tổng quan")

        header = json.loads(
            (pages_dir / "CEO_TongQuan" / "visuals" / "title_overview" / "visual.json").read_text(encoding="utf-8")
        )
        self.assertEqual(header["visual"]["visualType"], "textbox")
        header_color = header["visual"]["visualContainerObjects"]["background"][0]["properties"]["color"]["solid"]["color"]["expr"]["Literal"]["Value"]
        self.assertEqual(header_color, "'#102A43'")

        nav = json.loads(
            (pages_dir / "CEO_TongQuan" / "visuals" / "nav_overview" / "visual.json").read_text(encoding="utf-8")
        )
        self.assertEqual(nav["position"], {"x": 0, "y": 72, "z": 1, "width": 220, "height": 648, "tabOrder": 1})
        slicer = json.loads(
            (pages_dir / "CEO_TongQuan" / "visuals" / "overview_year" / "visual.json").read_text(encoding="utf-8")
        )
        self.assertLess(slicer["position"]["x"] + slicer["position"]["width"], 220)
        self.assertEqual(
            slicer["position"],
            {"x": 12, "y": 260, "z": 10, "width": 196, "height": 60, "tabOrder": 10},
        )
        slicer_container = slicer["visual"]["visualContainerObjects"]
        self.assertEqual(
            slicer_container["background"][0]["properties"]["color"]["solid"]["color"]["expr"]["Literal"]["Value"],
            "'#123A5D'",
        )
        self.assertEqual(
            slicer["visual"]["objects"]["items"][0]["properties"]["fontColor"]["solid"]["color"]["expr"]["Literal"]["Value"],
            "'#7DD3FC'",
        )

        month_slicer = json.loads(
            (pages_dir / "CEO_TongQuan" / "visuals" / "overview_month" / "visual.json").read_text(encoding="utf-8")
        )
        first_card = json.loads(
            (pages_dir / "CEO_TongQuan" / "visuals" / "overview_card_actual" / "visual.json").read_text(encoding="utf-8")
        )
        self.assertEqual(month_slicer["position"]["y"], 328)
        self.assertGreaterEqual(
            first_card["position"]["y"] - (month_slicer["position"]["y"] + month_slicer["position"]["height"]),
            12,
        )
        self.assertEqual(first_card["position"]["height"], 59)

        detail_slicer_paths = sorted((pages_dir / "KhachHang_SanPham" / "visuals").glob("detail_*/visual.json"))
        detail_slicers = [
            json.loads(path.read_text(encoding="utf-8"))
            for path in detail_slicer_paths
            if json.loads(path.read_text(encoding="utf-8"))["visual"]["visualType"] == "slicer"
        ]
        self.assertEqual(len(detail_slicers), 5)
        self.assertTrue(all(item["position"]["height"] == 60 for item in detail_slicers))
        self.assertLessEqual(max(item["position"]["y"] + item["position"]["height"] for item in detail_slicers), 720)

        nav_button = json.loads(
            (pages_dir / "CEO_TongQuan" / "visuals" / "nav_to_CEO_TongQuan" / "visual.json").read_text(encoding="utf-8")
        )
        self.assertEqual(nav_button["visual"]["visualType"], "actionButton")
        self.assertEqual(
            nav_button["position"],
            {"x": 14, "y": 128, "z": 2, "width": 192, "height": 28, "tabOrder": 2},
        )
        nav_link = nav_button["visual"]["visualContainerObjects"]["visualLink"][0]["properties"]
        self.assertEqual(nav_link["type"]["expr"]["Literal"]["Value"], "'PageNavigation'")
        self.assertEqual(nav_link["navigationSection"]["expr"]["Literal"]["Value"], "'CEO_TongQuan'")
        active_fill = nav_button["visual"]["objects"]["fill"][1]["properties"]["fillColor"]
        self.assertEqual(active_fill["solid"]["color"]["expr"]["Literal"]["Value"], "'#0EA5E9'")

        trend = json.loads(
            (pages_dir / "CEO_TongQuan" / "visuals" / "overview_trend" / "visual.json").read_text(encoding="utf-8")
        )
        self.assertEqual(trend["visual"]["visualType"], "lineClusteredColumnComboChart")
        self.assertEqual(trend["position"], {"x": 236, "y": 92, "z": 30, "width": 1028, "height": 294, "tabOrder": 30})
        self.assertIn("categoryAxis", trend["visual"]["objects"])
        self.assertIn("valueAxis", trend["visual"]["objects"])
        self.assertEqual(
            trend["visual"]["objects"]["valueAxis"][0]["properties"]["labelPrecision"]["expr"]["Literal"]["Value"],
            "0L",
        )
        self.assertIn("labels", trend["visual"]["objects"])
        self.assertIn("plotArea", trend["visual"]["objects"])
        self.assertEqual(
            trend["visual"]["query"]["queryState"]["Category"]["projections"][0]["queryRef"],
            "DimDate.MonthAxis",
        )
        self.assertEqual(
            trend["visual"]["objects"]["categoryAxis"][0]["properties"]["axisType"]["expr"]["Literal"]["Value"],
            "'Categorical'",
        )
        self.assertEqual(
            trend["visual"]["objects"]["categoryAxis"][0]["properties"]["labelDensity"]["expr"]["Literal"]["Value"],
            "100D",
        )
        self.assertEqual(
            trend["visual"]["objects"]["labels"][0]["properties"]["show"]["expr"]["Literal"]["Value"],
            "false",
        )

        donut = json.loads(
            (pages_dir / "CEO_TongQuan" / "visuals" / "overview_mix" / "visual.json").read_text(encoding="utf-8")
        )
        self.assertEqual(donut["visual"]["visualType"], "donutChart")
        self.assertEqual(set(donut["visual"]["query"]["queryState"]), {"Category", "Y"})
        self.assertEqual(
            donut["visual"]["query"]["queryState"]["Category"]["projections"][0]["queryRef"],
            "DimProduct.ProductGroup",
        )

        waterfall = json.loads(
            (pages_dir / "CEO_TongQuan" / "visuals" / "overview_gap_region" / "visual.json").read_text(encoding="utf-8")
        )
        self.assertEqual(waterfall["visual"]["visualType"], "waterfallChart")
        self.assertEqual(set(waterfall["visual"]["query"]["queryState"]), {"Category", "Y"})

        detail_table = json.loads(
            (pages_dir / "KhachHang_SanPham" / "visuals" / "detail_matrix" / "visual.json").read_text(encoding="utf-8")
        )
        self.assertEqual(
            detail_table["position"],
            {"x": 236, "y": 92, "z": 30, "width": 1028, "height": 612, "tabOrder": 30},
        )
        self.assertEqual(
            detail_table["visual"]["objects"]["grid"][0]["properties"]["rowPadding"]["expr"]["Literal"]["Value"],
            "7D",
        )
        table_header = detail_table["visual"]["objects"]["columnHeaders"][0]["properties"]
        self.assertEqual(table_header["autoSizeColumnWidth"]["expr"]["Literal"]["Value"], "true")
        self.assertEqual(table_header["columnAdjustment"]["expr"]["Literal"]["Value"], "'growToFit'")

        visuals = list(pages_dir.glob("*/visuals/*/visual.json"))
        self.assertGreaterEqual(len(visuals), 53)
        nav_button_paths = [
            path
            for path in visuals
            if json.loads(path.read_text(encoding="utf-8"))["visual"]["visualType"] == "actionButton"
        ]
        self.assertEqual(len(nav_button_paths), 16)
        card_paths = [
            path
            for path in visuals
            if json.loads(path.read_text(encoding="utf-8"))["visual"]["visualType"] == "card"
        ]
        self.assertEqual(len(card_paths), 4)
        self.assertTrue(all(path.parts[-4] == "CEO_TongQuan" for path in card_paths))
        table_types = [
            json.loads(path.read_text(encoding="utf-8"))["visual"]["visualType"]
            for path in visuals
            if path.parent.name.endswith("matrix")
        ]
        self.assertEqual(table_types, ["tableEx"])

        theme = json.loads(
            (report / "StaticResources" / "RegisteredResources" / "VikodaTheme.json").read_text(encoding="utf-8")
        )
        self.assertEqual(theme["name"], "Vikoda Executive Pro 2026")

    def test_model_has_measures_and_many_to_one_relationships(self) -> None:
        model = json.loads((self.output / f"{REPORT_NAME}.SemanticModel" / "model.bim").read_text(encoding="utf-8"))["model"]
        for table in model["tables"]:
            expression = table["partitions"][0]["source"]["expression"]
            self.assertIn('Table.TransformColumnTypes', expression)
            self.assertIn(', "en-US")', expression)
        fact = next(table for table in model["tables"] if table["name"] == "FactSellIn")
        dim_date = next(table for table in model["tables"] if table["name"] == "DimDate")
        month_start = next(item for item in dim_date["columns"] if item["name"] == "MonthStart")
        self.assertEqual(month_start["formatString"], "yy/MM")
        measure_names = {item["name"] for item in fact["measures"]}
        self.assertIn("Doanh thu Sell In", measure_names)
        self.assertIn("Run-rate dự báo tháng", measure_names)
        self.assertIn("Cần doanh thu mỗi ngày", measure_names)
        self.assertIn("SL Két (K)", measure_names)
        self.assertIn("SL Thùng (T)", measure_names)
        self.assertIn("SL Bình (B)", measure_names)
        self.assertIn("SL Két (K) LY", measure_names)
        self.assertIn("SL Thùng (T) LY", measure_names)
        self.assertIn("SL Bình (B) LY", measure_names)
        self.assertIn("Tăng trưởng Két (K)", measure_names)
        self.assertIn("Tăng trưởng Thùng (T)", measure_names)
        self.assertIn("Tăng trưởng Bình (B)", measure_names)
        self.assertEqual(len(measure_names), 38)
        return_rate = next(item for item in fact["measures"] if item["name"] == "Tỷ lệ trả hàng")
        self.assertIn("COALESCE", return_rate["expression"])
        self.assertEqual(return_rate["formatString"], "0.0%;(0.0%);0.0%")
        actual = next(item for item in fact["measures"] if item["name"] == "Doanh thu Sell In")
        self.assertIn("ISCROSSFILTERED(DimDate[Date])", actual["expression"])
        self.assertIn("LatestPeriod", actual["expression"])
        self.assertIn("1000000", actual["expression"])
        self.assertEqual(actual["formatString"], MONEY_FORMAT)
        self.assertEqual(MONEY_FORMAT, '#,##0 "tr";(#,##0 "tr");-')
        cases = next(item for item in fact["measures"] if item["name"] == "SL Két (K)")
        self.assertEqual(cases["formatString"], QUANTITY_FORMAT)
        self.assertEqual(QUANTITY_FORMAT, "#,##0;(#,##0);-")
        forecast = next(item for item in fact["measures"] if item["name"] == "Run-rate dự báo tháng")
        self.assertIn("DATESBETWEEN", forecast["expression"])
        cases_ly = next(item for item in fact["measures"] if item["name"] == "SL Két (K) LY")
        self.assertIn("SAMEPERIODLASTYEAR", cases_ly["expression"])
        self.assertIn('FactSellIn[PackUnit] = "Két"', cases_ly["expression"])
        self.assertEqual(len(model["relationships"]), 7)
        for relationship in model["relationships"]:
            self.assertEqual(relationship["fromCardinality"], "many")
            self.assertEqual(relationship["toCardinality"], "one")

    def test_dmsp_pack_size_converts_quantity_to_ktb(self) -> None:
        catalog = {
            "SP1": {"ProductNameDMSP": "Vikoda 1.5L", "ProductShortName": "Vikoda 1.5L", "PackSize": 20, "PackUnit": "Két"},
            "SP2": {"ProductNameDMSP": "KDT 500ml", "ProductShortName": "KDT 500ml", "PackSize": 24, "PackUnit": "Thùng"},
        }
        _, _, dim_product, _, facts = build_dimensions(
            self.sell_payload, self.target_payload, self.dmkh_payload, catalog
        )
        product = next(row for row in dim_product if row["ProductCode"] == "SP1")
        self.assertEqual(product["PackSize"], 20)
        self.assertEqual(product["PackUnit"], "Két")
        sell_rows, _ = facts
        converted = next(row for row in sell_rows if row["ProductCode"] == "SP1" and row["PeriodKey"] == "202607")
        self.assertEqual(converted["ConvertedQuantity"], 0.5)

    def test_project_and_platform_files_exist(self) -> None:
        self.assertTrue((self.output / f"{REPORT_NAME}.pbip").is_file())
        self.assertTrue((self.output / f"{REPORT_NAME}.Report" / ".platform").is_file())
        self.assertTrue((self.output / f"{REPORT_NAME}.SemanticModel" / ".platform").is_file())


if __name__ == "__main__":
    unittest.main()
