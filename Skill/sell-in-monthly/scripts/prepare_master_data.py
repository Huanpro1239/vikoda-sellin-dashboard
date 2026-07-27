from __future__ import annotations

import argparse
import json
from pathlib import Path

from master_data import (
    analyze_master_data,
    apply_approved_customers_portable,
    build_approval_plan,
    write_json,
    write_review_workbook_portable,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)

    approvals = subparsers.add_parser("plan-approvals")
    approvals.add_argument("--customer-master", required=True)
    approvals.add_argument("--candidate-dir", required=True)
    approvals.add_argument("--plan-file", required=True)

    analyze = subparsers.add_parser("analyze")
    analyze.add_argument("--output-dir", required=True)
    analyze.add_argument("--source-dir", required=True)
    analyze.add_argument("--customer-master", required=True)
    analyze.add_argument("--product-master", required=True)
    analyze.add_argument("--candidate-dir", required=True)
    analyze.add_argument("--staging-file", required=True)

    # Hai lệnh dưới thay cho apply_approved_customers.mjs và
    # build_master_data_review.mjs; dùng chung mã với luồng chuyển giao.
    apply_approved = subparsers.add_parser("apply-approved")
    apply_approved.add_argument("--plan-file", required=True)
    apply_approved.add_argument("--backup-dir", required=True)
    apply_approved.add_argument("--report-file", required=True)

    review = subparsers.add_parser("build-review")
    review.add_argument("--analysis-file", required=True)

    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.command == "plan-approvals":
        payload = build_approval_plan(
            Path(args.customer_master).resolve(),
            Path(args.candidate_dir).resolve(),
        )
        write_json(Path(args.plan_file).resolve(), payload)
        if payload["errors"]:
            raise SystemExit(1)
        print(args.plan_file)
        return

    if args.command == "apply-approved":
        plan_file = Path(args.plan_file).resolve()
        plan = json.loads(plan_file.read_text(encoding="utf-8"))
        report = apply_approved_customers_portable(
            plan,
            Path(args.backup_dir).resolve(),
        )
        write_json(Path(args.report_file).resolve(), report)
        print(args.report_file)
        return

    if args.command == "build-review":
        analysis_file = Path(args.analysis_file).resolve()
        analysis = json.loads(analysis_file.read_text(encoding="utf-8"))
        write_review_workbook_portable(analysis)
        print(analysis["candidate_file"])
        return

    payload = analyze_master_data(
        Path(args.output_dir).resolve(),
        Path(args.source_dir).resolve(),
        Path(args.customer_master).resolve(),
        Path(args.product_master).resolve(),
        Path(args.candidate_dir).resolve(),
    )
    write_json(Path(args.staging_file).resolve(), payload)
    print(args.staging_file)


if __name__ == "__main__":
    main()
