#!/usr/bin/env python3
"""Stamp a version onto every script and stylesheet address, so a browser never pairs a new page
with an old cached script. Run before each push: python3 tools-stamp.py"""
import re, time, pathlib
v = time.strftime('%Y%m%d%H%M%S')
root = pathlib.Path(__file__).parent
def stamp(path, pattern):
    p = root / path
    s = p.read_text()
    p.write_text(re.sub(pattern, lambda m: m.group(1) + '?v=' + v + m.group(3), s))
stamp('index.html', r'((?:src|href)="(?:src/main\.js|style\.css))(\?v=\d+)?(")')
for f in ['src/main.js', 'src/device.js', 'src/emu.js']:
    stamp(f, r"(from '\.\.?/(?:[\w/]+)\.js)(\?v=\d+)?(')")
print('stamped', v)
