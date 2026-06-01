#!/usr/bin/env python3
import os
import sys
import json

with open("/tmp/ssh_check_env.log", "a") as f:
    f.write(f"PID={os.getpid()} PPID={os.getppid()} ENV={json.dumps(dict(os.environ))}\n")
sys.exit(0)
