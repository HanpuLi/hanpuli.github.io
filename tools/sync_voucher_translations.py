#!/usr/bin/env python3
"""Refresh registry-derived compatibility exports and the voucher catalogue."""
import sys
from poetry_model import synchronize, load, voucher, read, ROOT
check='--check' in sys.argv
changed=synchronize(check=check)
if check and changed:
    for p in changed: print('Stale registry projection: '+str(p.relative_to(ROOT)),file=sys.stderr)
    raise SystemExit(1)
d=load()
print(f"poetry registry: {len(d['works'])} works; voucher edition-parts generated from the same versions")
