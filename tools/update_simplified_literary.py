#!/usr/bin/env python3
"""Refresh registry-derived literary exports; explicitly regenerate script mirrors when requested.

The canonical registry owns the text. No historical version is rewritten merely
because a source compatibility file is rebuilt. --regenerate-script-mirrors is an
explicit authoring operation; the separately approved summer mirror is preserved.
"""
import json
import sys
from poetry_model import load, synchronize, SOURCE

def main():
    if '--regenerate-script-mirrors' in sys.argv:
        from opencc import OpenCC
        cc=OpenCC('t2s');data=load()
        for work in data['works']:
            if work.get('layout')=='mirror':continue
            for version in work['versions']:
                for part in version['parts']:
                    source=part['editions']['zh']
                    part['editions']['zh-hans']={key:cc.convert(source[key]) for key in ('title','body')}
        SOURCE.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    changed=synchronize(check='--check' in sys.argv)
    print('Registry-derived literary exports: '+str(len(changed))+' changed')
    return int('--check' in sys.argv and bool(changed))

if __name__=='__main__':raise SystemExit(main())
