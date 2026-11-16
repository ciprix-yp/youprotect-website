#!/usr/bin/env python3
"""Shift-left guard for Claude Code (PreToolUse hook on Bash).

Blocks commands that would bypass the security gates: skipping git hooks,
skipping pre-commit checks, or rewiring the hooks path. Exit code 2 blocks
the tool call and shows the reason to Claude.
"""
import json
import re
import sys

QUOTED = re.compile(r'"((?:\\.|[^"\\])*)"|\'([^\']*)\'')

# Flag rules: matched with quoted text removed (so "-n" in a commit message is not a
# flag), and again inside every quoted string (so `bash -c "git commit -n"` is caught).
FLAG_RULES = [
    (r"\bgit\b[^;&|]*\b(commit|push|merge|rebase|am|cherry-pick)\b[^;&|]*\s--no-verify\b",
     "`--no-verify` skips the shift-left security hooks."),
    (r"\bgit\b[^;&|]*\bcommit\b[^;&|]*\s-[a-zA-Z]*n[a-zA-Z]*(\s|$)",
     "`git commit -n` is `--no-verify` and skips the shift-left security hooks."),
]

# Token rules: specific enough to match on the raw command, quotes included.
TOKEN_RULES = [
    (r"(^|[\s;&|\"'])SKIP=", "`SKIP=` disables pre-commit security hooks."),
    (r"(^|[\s;&|\"'])SHIFT_LEFT_BYPASS=", "`SHIFT_LEFT_BYPASS` is for humans only, not for Claude."),
    (r"\bgit\b.*core\.hooksPath", "Changing `core.hooksPath` disconnects the shift-left hooks."),
    (r"\bgit\b.*shift-left\.exempt", "Exempting a repo from shift-left is a human decision."),
]


def find_violation(command: str, depth: int = 0):
    if depth == 0:
        for pattern, reason in TOKEN_RULES:
            if re.search(pattern, command):
                return reason
    unquoted = QUOTED.sub('""', command)
    for pattern, reason in FLAG_RULES:
        if re.search(pattern, unquoted):
            return reason
    if depth < 3:
        for match in QUOTED.finditer(command):
            inner = match.group(1) if match.group(1) is not None else match.group(2)
            reason = find_violation(inner.replace('\\"', '"'), depth + 1)
            if reason:
                return reason
    return None


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except ValueError:
        return 0
    command = (payload.get("tool_input") or {}).get("command") or ""
    reason = find_violation(command)
    if reason:
        print(
            f"Blocked by shift-left policy: {reason} "
            "Fix the finding instead (or, for a genuine false positive, add an inline "
            "suppression with a justification) and tell the user.",
            file=sys.stderr,
        )
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
