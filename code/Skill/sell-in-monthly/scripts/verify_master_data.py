from __future__ import annotations

import argparse
import json
from pathlib import Path

from master_data import verify_master_data_artifacts, write_json


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--analysis-file", required=True)
    parser.add_argument("--apply-report", required=True)
    parser.add_argument("--report-file", required=True)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    analysis = json.loads(
        Path(args.analysis_file).read_text(encoding="utf-8")
    )
    apply_report = json.loads(
        Path(args.apply_report).read_text(encoding="utf-8")
    )
    report = verify_master_data_artifacts(analysis, apply_report)
    write_json(Path(args.report_file).resolve(), report)
    if not report["ok"]:
        raise SystemExit(1)
    print(args.report_file)


if __name__ == "__main__":
    main()
