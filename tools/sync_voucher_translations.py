#!/usr/bin/env python3
"""Build shop and legacy literary projections from content/poetry/library.json."""
import argparse
from poetry_library import materialize, Library

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check',action='store_true')
    args=parser.parse_args()
    changed=materialize(check=args.check)
    if args.check and changed:
        parser.error('poetry projections are stale: '+', '.join(str(p) for p in changed))
    print(f'voucher catalogue: {len(Library().offers)} paper editions, 6 paired languages')
if __name__=='__main__': main()
