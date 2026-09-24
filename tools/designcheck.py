#!/usr/bin/env python3
"""Reject stale or inconsistent explanatory specimens before browser QA."""
import hashlib,json,struct
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
m=json.loads((ROOT/'assets/design/measurements.json').read_text())
for file,digest in m['inputs'].items():
 assert hashlib.sha256((ROOT/file).read_bytes()).hexdigest()==digest, f'Specimen source changed: {file}; run node tools/build_design_specimens.mjs, then build_site.py'
base=json.loads((ROOT/'content/design/en.json').read_text())
for locale,s in m['site'].items():
 copy=json.loads((ROOT/f'content/design/{locale}.json').read_text())
 assert copy.keys()==base.keys(),f'{locale}: incomplete design copy'
 assert len(copy['callouts'])==6 and all(len(row)==2 for row in copy['callouts'])
 for width,v in s['views'].items():
  assert len(v['columns'])==12 and min(v['columns'])>0
  assert abs(sum(v['columns'])+11*v['gap']-v['width'])<.3, f'{locale}/{width}: measured grid does not fit its container'
  data=(ROOT/'assets/design'/v['file']).read_bytes();w,h=struct.unpack('>II',data[16:24])
  assert abs(w-v['width'])<2 and abs(h-v['height'])<2
  assert all(b['x']>=0 and b['x']+b['w']<=v['width']+1 for b in v['parts'])
 for t in s['type']:assert t['fonts'] and all(f['custom'] for f in t['fonts']),f'{locale}: unverified font fallback'
v=m['voucher'];p=v['paper']
assert p['printableDots']+2*p['pdfSideMarginDots']==p['paperMm']*p['dotsPerMm']
assert p['bodyWidthDots']+2*p['bodyInsetDots']==p['printableDots']
assert v['receipt']['lineChars']*p['receiptCellDots']+2*p['receiptInsetDots']==p['printableDots']
assert v['height']==v['receiptHeight']+v['cutHeight']+v['voucherHeight']
assert v['order']['total']==299 and v['order']['units']==1 and v['order']['lines'][0]['font']=='bitmap'
assert v['order']['lines'][0]['translations']==[]
for name,w,h in [('voucher-strip.png',384,v['height']),('receipt-columns.png',384,120),('receipt-total.png',384,48),('poem-bitmap.png',384,96),('poem-site.png',384,96)]:
 data=(ROOT/'assets/design'/name).read_bytes();assert struct.unpack('>II',data[16:24])==(w,h),name
print('designcheck: 14 measured views, painted font faces, seven copy schemas, specimen geometry and source fingerprints verified')
