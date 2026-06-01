#!/usr/bin/env python3
"""Audit live backend sudo subprocess usage.

This is intentionally lightweight: it flags direct sudo argv usage so new code
can be moved to backend.app.core.sudo.run_sudo/popen_sudo and matched in
backend/config/mailadmin_sudoers before deployment.
"""
from __future__ import annotations

import ast
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BACKEND = ROOT / "backend" / "app"
ALLOW_DIRECT = {
    "backend/app/core/sudo.py",
}


def is_subprocess_call(node: ast.Call) -> bool:
    func = node.func
    return (
        isinstance(func, ast.Attribute)
        and func.attr in {"run", "Popen", "check_call", "check_output"}
        and isinstance(func.value, ast.Name)
        and func.value.id == "subprocess"
    )


def literal_first_arg(node: ast.Call):
    if not node.args:
        return None
    arg = node.args[0]
    if isinstance(arg, ast.List) and arg.elts:
        first = arg.elts[0]
        if isinstance(first, ast.Constant):
            return first.value
    if isinstance(arg, ast.Constant):
        return arg.value
    return None


def shell_true(node: ast.Call) -> bool:
    for kw in node.keywords:
        if kw.arg == "shell" and isinstance(kw.value, ast.Constant):
            return kw.value.value is True
    return False


def rel(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def main() -> int:
    findings: list[str] = []
    for path in sorted(BACKEND.rglob("*.py")):
        text = path.read_text()
        tree = ast.parse(text, filename=str(path))
        direct_allowed = rel(path) in ALLOW_DIRECT
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call) or not is_subprocess_call(node):
                continue
            first = literal_first_arg(node)
            uses_sudo = first in {"sudo", "/usr/bin/sudo"} or (isinstance(first, str) and first.startswith("sudo "))
            if uses_sudo and not direct_allowed:
                findings.append(f"{rel(path)}:{node.lineno}: direct sudo subprocess call")
            if shell_true(node):
                findings.append(f"{rel(path)}:{node.lineno}: subprocess shell=True")

    if findings:
        print("Sudo audit findings:")
        for finding in findings:
            print(f"- {finding}")
        return 1

    print("Sudo audit passed: no direct sudo subprocess calls or shell=True in backend/app.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
