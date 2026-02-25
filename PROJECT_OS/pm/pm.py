#!/usr/bin/env python3
"""Lightweight local project manager for PROJECT_OS backlog orchestration.

Commands:
- status
- next [--start]
- start <TASK_ID> [--force]
- close [TASK_ID]
- review [TASK_ID] [--quick]
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Tuple

VALID_STATUSES = {"TODO", "IN_PROGRESS", "BLOCKED", "DONE"}

ROOT = Path(__file__).resolve().parents[2]
PROJECT_OS_DIR = ROOT / "PROJECT_OS"
BACKLOG_PATH = PROJECT_OS_DIR / "02-BACKLOG.md"
REVIEWER_RULES_PATH = PROJECT_OS_DIR / "pm" / "REVIEWER_RULES.md"


@dataclass
class Task:
    task_id: str
    status: str
    start: int
    end: int
    block: str


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def write_text(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8")


def iter_task_blocks(text: str) -> List[Task]:
    heading_matches = list(re.finditer(r"(?m)^###\s+([A-Za-z0-9_-]+)\s*$", text))
    tasks: List[Task] = []

    for idx, match in enumerate(heading_matches):
        start = match.start()
        end = heading_matches[idx + 1].start() if idx + 1 < len(heading_matches) else len(text)
        block = text[start:end]
        task_id = match.group(1).strip()

        status_match = re.search(r"(?m)^-\s*Status:\s*`([^`]+)`\s*$", block)
        status = status_match.group(1).strip() if status_match else "UNKNOWN"

        tasks.append(Task(task_id=task_id, status=status, start=start, end=end, block=block))

    return tasks


def task_field(block: str, field_name: str) -> str:
    m = re.search(rf"(?m)^-\s*{re.escape(field_name)}:\s*(.+)$", block)
    return m.group(1).strip() if m else "-"


def update_task_status(text: str, task_id: str, new_status: str) -> Tuple[str, Optional[str]]:
    if new_status not in VALID_STATUSES:
        raise ValueError(f"Invalid status: {new_status}")

    tasks = iter_task_blocks(text)
    selected = next((t for t in tasks if t.task_id == task_id), None)
    if not selected:
        return text, None

    old_status = selected.status
    block = selected.block

    if re.search(r"(?m)^-\s*Status:\s*`[^`]+`\s*$", block):
        updated_block = re.sub(
            r"(?m)^-\s*Status:\s*`[^`]+`\s*$",
            f"- Status: `{new_status}`",
            block,
            count=1,
        )
    else:
        heading_end = block.find("\n")
        insertion = f"\n- Status: `{new_status}`"
        updated_block = block[: heading_end + 1] + insertion + block[heading_end + 1 :]

    updated_text = text[: selected.start] + updated_block + text[selected.end :]
    return updated_text, old_status


def print_task_summary(task: Task) -> None:
    print(f"Task: {task.task_id}")
    print(f"Status: {task.status}")
    print(f"Owner: {task_field(task.block, 'Owner')}")
    print(f"Scope: {task_field(task.block, 'Scope')}")
    print(f"Dependencies: {task_field(task.block, 'Dependencies')}")
    print(f"Next action: {task_field(task.block, 'Next action')}")


def cmd_status(_: argparse.Namespace) -> int:
    text = read_text(BACKLOG_PATH)
    tasks = iter_task_blocks(text)

    if not tasks:
        print("No tasks found in backlog.")
        return 1

    counts: Dict[str, int] = {k: 0 for k in VALID_STATUSES}
    counts["UNKNOWN"] = 0

    for task in tasks:
        if task.status in counts:
            counts[task.status] += 1
        else:
            counts["UNKNOWN"] += 1

    print(f"Backlog: {BACKLOG_PATH}")
    print(
        "Counts: "
        + ", ".join(
            [
                f"TODO={counts['TODO']}",
                f"IN_PROGRESS={counts['IN_PROGRESS']}",
                f"BLOCKED={counts['BLOCKED']}",
                f"DONE={counts['DONE']}",
                f"UNKNOWN={counts['UNKNOWN']}",
            ]
        )
    )

    for task in tasks:
        scope = task_field(task.block, "Scope")
        if len(scope) > 80:
            scope = scope[:77] + "..."
        print(f"- {task.task_id:8} {task.status:12} {scope}")

    return 0


def cmd_next(args: argparse.Namespace) -> int:
    text = read_text(BACKLOG_PATH)
    tasks = iter_task_blocks(text)

    in_progress = [t for t in tasks if t.status == "IN_PROGRESS"]
    candidate: Optional[Task] = in_progress[0] if in_progress else None

    if candidate is None:
        candidate = next((t for t in tasks if t.status == "TODO"), None)

    if candidate is None:
        print("No next task available. Backlog has no TODO or IN_PROGRESS tasks.")
        return 1

    if args.start and candidate.status != "IN_PROGRESS":
        updated_text, old_status = update_task_status(text, candidate.task_id, "IN_PROGRESS")
        if old_status is None:
            print(f"Task not found: {candidate.task_id}")
            return 1
        write_text(BACKLOG_PATH, updated_text)
        candidate.status = "IN_PROGRESS"
        print(f"Started {candidate.task_id} ({old_status} -> IN_PROGRESS)")

    print_task_summary(candidate)
    return 0


def cmd_start(args: argparse.Namespace) -> int:
    text = read_text(BACKLOG_PATH)
    tasks = iter_task_blocks(text)
    current = next((t for t in tasks if t.status == "IN_PROGRESS" and t.task_id != args.task_id), None)

    if current and not args.force:
        print(
            f"Another task is already IN_PROGRESS: {current.task_id}. "
            "Use 'start <TASK_ID> --force' to switch."
        )
        return 1

    if current and args.force:
        text, old = update_task_status(text, current.task_id, "TODO")
        if old:
            print(f"Switched out {current.task_id} ({old} -> TODO)")

    text, old_status = update_task_status(text, args.task_id, "IN_PROGRESS")
    if old_status is None:
        print(f"Task not found: {args.task_id}")
        return 1

    write_text(BACKLOG_PATH, text)
    print(f"Started {args.task_id} ({old_status} -> IN_PROGRESS)")
    return 0


def cmd_close(args: argparse.Namespace) -> int:
    text = read_text(BACKLOG_PATH)
    tasks = iter_task_blocks(text)

    task_id = args.task_id
    if not task_id:
        current = next((t for t in tasks if t.status == "IN_PROGRESS"), None)
        if not current:
            print("No TASK_ID provided and no IN_PROGRESS task found.")
            return 1
        task_id = current.task_id

    updated_text, old_status = update_task_status(text, task_id, "DONE")
    if old_status is None:
        print(f"Task not found: {task_id}")
        return 1

    write_text(BACKLOG_PATH, updated_text)
    print(f"Closed {task_id} ({old_status} -> DONE)")
    return 0


def run_cmd(cmd: List[str], cwd: Path) -> Tuple[int, str, str]:
    proc = subprocess.run(cmd, cwd=str(cwd), text=True, capture_output=True)
    return proc.returncode, proc.stdout, proc.stderr


def print_output_tail(text: str, max_lines: int = 20) -> None:
    lines = [ln for ln in text.strip().splitlines() if ln.strip()]
    if not lines:
        return
    tail = lines[-max_lines:]
    print("\n".join(tail))


def changed_files(root: Path) -> List[str]:
    rc, out, err = run_cmd(["git", "-C", str(root), "status", "--porcelain"], root)
    if rc != 0:
        print("Could not read git status:")
        print_output_tail(err or out)
        return []

    files: List[str] = []
    for line in out.splitlines():
        if not line.strip():
            continue
        path = line[3:].strip()
        if " -> " in path:
            path = path.split(" -> ", 1)[1].strip()
        files.append(path)
    return files


def package_scripts(root: Path) -> Dict[str, str]:
    package_json = root / "package.json"
    if not package_json.exists():
        return {}
    try:
        payload = json.loads(package_json.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    scripts = payload.get("scripts") or {}
    return scripts if isinstance(scripts, dict) else {}


def run_npm_script_if_exists(root: Path, script_name: str) -> Tuple[bool, bool]:
    scripts = package_scripts(root)
    if script_name not in scripts:
        print(f"- {script_name}: skipped (script missing)")
        return True, False

    print(f"- {script_name}: running")
    rc, out, err = run_cmd(["npm", "run", "-s", script_name], root)
    if rc == 0:
        print(f"  {script_name}: OK")
        return True, True

    print(f"  {script_name}: FAIL")
    print_output_tail(out)
    print_output_tail(err)
    return False, True


def run_python_compile_checks(root: Path, files: List[str]) -> bool:
    py_files = [f for f in files if f.endswith(".py")]
    if not py_files:
        print("- py_compile: skipped (no changed .py files)")
        return True

    all_ok = True
    for rel in py_files:
        target = root / rel
        if not target.exists():
            continue
        rc, out, err = run_cmd(["python3", "-m", "py_compile", str(target)], root)
        if rc == 0:
            print(f"- py_compile {rel}: OK")
        else:
            all_ok = False
            print(f"- py_compile {rel}: FAIL")
            print_output_tail(out)
            print_output_tail(err)
    return all_ok


def cmd_review(args: argparse.Namespace) -> int:
    print("Reviewer gate: deterministic checks")

    if REVIEWER_RULES_PATH.exists():
        print(f"Rules: {REVIEWER_RULES_PATH}")

    if args.task_id:
        print(f"Task context: {args.task_id}")

    files = changed_files(ROOT)
    print(f"Changed files: {len(files)}")
    for file in files[:20]:
        print(f"- {file}")
    if len(files) > 20:
        print(f"- ... and {len(files) - 20} more")

    ok = True

    if args.quick:
        print("Quick mode enabled: only git + py_compile checks.")
        if not run_python_compile_checks(ROOT, files):
            ok = False
        print("PASS" if ok else "FAIL")
        return 0 if ok else 2

    if not run_python_compile_checks(ROOT, files):
        ok = False

    for script_name in ("lint", "test", "build"):
        script_ok, _ran = run_npm_script_if_exists(ROOT, script_name)
        if not script_ok:
            ok = False

    print("PASS" if ok else "FAIL")
    return 0 if ok else 2


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="PROJECT_OS PM orchestrator")
    sub = parser.add_subparsers(dest="command", required=True)

    sub_status = sub.add_parser("status", help="Show backlog summary")
    sub_status.set_defaults(func=cmd_status)

    sub_next = sub.add_parser("next", help="Show next task")
    sub_next.add_argument("--start", action="store_true", help="Set returned task to IN_PROGRESS")
    sub_next.set_defaults(func=cmd_next)

    sub_start = sub.add_parser("start", help="Set a task to IN_PROGRESS")
    sub_start.add_argument("task_id", help="Task ID, e.g. WP-001")
    sub_start.add_argument("--force", action="store_true", help="Switch from current IN_PROGRESS task")
    sub_start.set_defaults(func=cmd_start)

    sub_close = sub.add_parser("close", help="Set task to DONE")
    sub_close.add_argument("task_id", nargs="?", help="Task ID. If omitted, closes current IN_PROGRESS")
    sub_close.set_defaults(func=cmd_close)

    sub_review = sub.add_parser("review", help="Run reviewer quality gate")
    sub_review.add_argument("task_id", nargs="?", help="Optional task context")
    sub_review.add_argument("--quick", action="store_true", help="Run quick checks only")
    sub_review.set_defaults(func=cmd_review)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    if not BACKLOG_PATH.exists():
        print(f"Missing backlog file: {BACKLOG_PATH}")
        return 1

    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
