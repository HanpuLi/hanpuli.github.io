"""Rhyme positions (谱定韵位) tied to reviewed classical originals."""
from __future__ import annotations

import hashlib
from typing import Any

from poetry_library import Library, read


class Rhymes:
    def __init__(self, library: Library):
        self.library = library
        self.data = read(library.content / 'poetry/rhymes.json')
        if self.data.get('schema') != 1 or not self.data.get('basis'):
            raise ValueError('Unsupported rhyme source')
        self.texts: dict[str, Any] = self.data['texts']
        expected = {tid for tid in library.texts
                    if library.work_for_text(tid)['form'] in ('ci', 'shi', 'qu')}
        if set(self.texts) != expected:
            raise ValueError('Rhyme marks must cover exactly the classical text versions')
        self.offsets: dict[str, list[int]] = {}
        for tid, entry in self.texts.items():
            source = library.edition(tid, 'zh')['body']
            if entry.get('source_body_sha256') != hashlib.sha256(source.encode()).hexdigest():
                raise ValueError('Review rhyme marks after an original-text change: ' + tid)
            if set(entry) - {'source_body_sha256', 'form', 'rhyme_group', 'rhymes', 'note'}:
                raise ValueError('Unknown rhyme field: ' + tid)
            stanzas = [stanza.split('\n') for stanza in source.split('\n\n')]
            starts, offset = [], 0
            for stanza in stanzas:
                row = []
                for line in stanza:
                    row.append(offset)
                    offset += len(line) + 1
                starts.append(row)
                offset += 1
            offsets = []
            for mark in entry['rhymes']:
                line = stanzas[mark['stanza']][mark['line']]
                if line[mark['index']] != mark['char']:
                    raise ValueError(f'Rhyme mark does not match the original: {tid} {mark}')
                offsets.append(starts[mark['stanza']][mark['line']] + mark['index'])
            if not offsets or offsets != sorted(set(offsets)):
                raise ValueError('Rhyme marks must be ordered and distinct: ' + tid)
            # The Simplified mirror is a character-for-character conversion; the
            # same offsets apply only while its line and stanza shape is identical.
            simplified = library.edition(tid, 'zh-hans')['body']
            if len(simplified) != len(source) or [i for i, c in enumerate(simplified) if c == '\n'] != \
                    [i for i, c in enumerate(source) if c == '\n']:
                raise ValueError('Simplified original no longer aligns with rhyme marks: ' + tid)
            self.offsets[tid] = offsets

    def attribute(self, tid: str) -> str:
        """Code-point offsets into the original body, as read by poetry-layout.js."""
        offsets = self.offsets.get(tid)
        return f' data-poetry-rhymes="{",".join(map(str, offsets))}"' if offsets else ''
