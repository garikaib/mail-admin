import logging
import subprocess
from collections.abc import Sequence

logger = logging.getLogger(__name__)


def sudo_cmd(argv: Sequence[str], preserve_env: Sequence[str] = ()) -> list[str]:
    """Build a non-interactive sudo command from an argv list."""
    cmd = ["/usr/bin/sudo", "-n"]
    if preserve_env:
        cmd.append(f"--preserve-env={','.join(preserve_env)}")
    cmd.extend(argv)
    return cmd


def run_sudo(argv: Sequence[str], **kwargs) -> subprocess.CompletedProcess:
    """
    Run sudo without allowing an interactive password prompt.

    Missing sudoers coverage should fail fast with a clear log entry instead of
    blocking a request or generating repeated password prompt notifications.
    """
    preserve_env = kwargs.pop("preserve_env", ())
    cmd = sudo_cmd(argv, preserve_env=preserve_env)
    result = subprocess.run(cmd, shell=False, **kwargs)
    if result.returncode != 0:
        stderr = getattr(result, "stderr", "") or ""
        if "a password is required" in stderr.lower() or "password is required" in stderr.lower():
            logger.error("Sudoers rule missing for command: %s", " ".join(cmd))
    return result


def popen_sudo(argv: Sequence[str], **kwargs) -> subprocess.Popen:
    """Open a non-interactive sudo process."""
    preserve_env = kwargs.pop("preserve_env", ())
    return subprocess.Popen(sudo_cmd(argv, preserve_env=preserve_env), shell=False, **kwargs)
