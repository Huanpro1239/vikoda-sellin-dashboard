from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from incremental import (
    build_incremental_plan,
    commit_incremental_plan,
    write_plan,
)

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(errors="replace")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Lập kế hoạch và ghi trạng thái tách dữ liệu tăng dần.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    plan_parser = subparsers.add_parser("plan")
    plan_parser.add_argument("--source-dir", required=True)
    plan_parser.add_argument("--output-dir", required=True)
    plan_parser.add_argument("--state-file", required=True)
    plan_parser.add_argument("--plan-file", required=True)
    plan_parser.add_argument("--force-period", action="append", default=[])
    plan_parser.add_argument("--force-all", action="store_true")

    commit_parser = subparsers.add_parser("commit")
    commit_parser.add_argument("--plan-file", required=True)
    commit_parser.add_argument("--state-file", required=True)
    return parser.parse_args()


def print_summary(plan: dict) -> None:
    for item in plan["periods"]:
        reason = "; ".join(item["reasons"])
        print(f"{item['period']} | {item['action']} | {reason}")
    print(
        "Tổng: "
        f"{len(plan['rebuild_periods'])} tháng REBUILD, "
        f"{len(plan['skipped_periods'])} tháng SKIP."
    )


def main() -> None:
    args = parse_args()
    if args.command == "plan":
        plan = build_incremental_plan(
            Path(args.source_dir),
            Path(args.output_dir),
            Path(args.state_file),
            force_periods=args.force_period,
            force_all=args.force_all,
        )
        write_plan(plan, Path(args.plan_file))
        print_summary(plan)
        if plan["problems"]:
            for problem in plan["problems"]:
                print(f"LỖI: {problem}")
            raise SystemExit(1)
        return

    plan = json.loads(Path(args.plan_file).read_text(encoding="utf-8"))
    state = commit_incremental_plan(plan, Path(args.state_file))
    print(
        f"Đã ghi trạng thái {len(state['outputs'])} tháng: "
        f"{Path(args.state_file).resolve()}"
    )


if __name__ == "__main__":
    main()
