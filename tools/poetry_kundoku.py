"""Japanese reading aids bound to the Chinese text they interpret."""
from __future__ import annotations

import hashlib
from typing import Any

from poetry_library import Library, read


class Kundoku:
    def __init__(self, library: Library):
        self.data = read(library.content / 'poetry/kundoku.json')
        if self.data.get('schema') != 1 or self.data.get('language') != 'ja':
            raise ValueError('Unsupported Japanese kundoku source')
        self.label = self.data['label']
        self.texts: dict[str, Any] = self.data['texts']
        expected = {tid for tid in library.texts
                    if library.work_for_text(tid)['form'] in ('ci', 'shi', 'qu')}
        if set(self.texts) != expected:
            raise ValueError('Kundoku must cover exactly the classical text versions')
        for tid, reading in self.texts.items():
            source = library.edition(tid, 'zh')['body']
            digest = hashlib.sha256(source.encode()).hexdigest()
            if reading['source_body_sha256'] != digest:
                raise ValueError('Review kundoku after an original-text change: ' + tid)
            body = reading['body']
            if not body.strip() or any(not line.strip() for line in body.splitlines()
                                       if line != ''):
                raise ValueError('Empty kundoku reading or line: ' + tid)
            shape = lambda text: [len(stanza.splitlines()) for stanza in text.split('\n\n')]
            if shape(body) != shape(source):
                raise ValueError('Kundoku must preserve original lines and stanzas: ' + tid)

    def body(self, tid: str) -> str:
        return self.texts[tid]['body']
