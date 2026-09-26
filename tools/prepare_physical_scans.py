#!/usr/bin/env python3
"""Reproduce the authorised paper-scan derivatives (Pillow required).

Extract the original embedded JPEG with `pdfimages -j source.pdf /tmp/scan`,
then pass that JPEG to this script. Source PDF/JPEG are not published.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    args = parser.parse_args()
    recipe = json.loads((ROOT/'docs/poetry-voucher-physical-scans.json').read_text())
    if hashlib.sha256(args.source.read_bytes()).hexdigest() != recipe['source_image_sha256']:
        raise ValueError('This geometry is only for the documented source scan')
    source = Image.open(args.source).convert('RGB')
    out = ROOT/'assets/projects/poetry-voucher'
    for name, item in recipe['editions'].items():
        angle = math.radians(item['rotation_ccw_degrees'])
        c, s = math.cos(angle), math.sin(angle)
        x, y = item['source_origin']
        corrected = source.transform(tuple(item['output_size']), Image.Transform.AFFINE,
                                     (c, -s, x, s, c, y), Image.Resampling.BICUBIC, fillcolor='white')
        corrected.save(out/f'physical-{name}.png', optimize=True)
        display = corrected.copy()
        display.thumbnail((620, 6000), Image.Resampling.LANCZOS)
        display.save(out/f'physical-{name}.webp', lossless=True, method=6)


if __name__ == '__main__':
    main()
