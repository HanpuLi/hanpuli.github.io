#!/usr/bin/env python3
"""Regenerate only changed script mirrors from the canonical poetry library."""
from pathlib import Path
import hashlib
import json
from opencc import OpenCC
from poetry_library import materialize

root=Path(__file__).resolve().parents[1]
source=root/'content/poetry/library.json'
target=root/'content/poetry/simplified.json'
data=json.loads(source.read_text(encoding='utf-8'))
previous=json.loads(target.read_text(encoding='utf-8')) if target.exists() else {}
converter=OpenCC('t2s')
texts={}; hashes={}
for text in data['texts']:
    tid=text['id']; original=text['editions']['zh']
    digest=hashlib.sha256((original['title']+'\0'+original['body']).encode()).hexdigest()
    hashes[tid]=digest
    if previous.get('originals_sha256',{}).get(tid)==digest and tid in previous.get('texts',{}):
        texts[tid]=previous['texts'][tid]
    else:
        texts[tid]={key:converter.convert(original[key]) for key in ('title','body')}
result={'schema':1,'source_sha256':hashlib.sha256(source.read_bytes()).hexdigest(),
        'originals_sha256':hashes,'texts':texts}
target.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
changed=materialize()
print(f'poetry: {len(texts)} script mirrors; {len(changed)} compatibility projections refreshed')
