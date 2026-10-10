"""Chinese paraphrases and annotations tied to reviewed classical originals."""
from __future__ import annotations

import hashlib
from typing import Any
from urllib.parse import urlsplit

from poetry_library import Library, read


class ReadingAids:
    def __init__(self, library: Library):
        self.data = read(library.content / 'poetry/reading-aids.json')
        if self.data.get('schema') != 1:
            raise ValueError('Unsupported Chinese reading-aid source')
        self.labels = self.data['labels']
        self.references = self.data['references']
        self.texts: dict[str, Any] = self.data['texts']
        expected = {tid for tid in library.texts
                    if library.work_for_text(tid)['form'] in ('ci', 'shi', 'qu')}
        if set(self.texts) != expected:
            raise ValueError('Chinese reading aids must cover exactly the classical text versions')
        for ref in self.references.values():
            url = urlsplit(ref['url'])
            if url.scheme != 'https' or not url.netloc:
                raise ValueError('Reading-aid references require an HTTPS source URL')
        for locale in ('zh', 'zh-hans'):
            if not all(self.labels[locale].get(key, '').strip()
                       for key in ('paraphrase', 'notes')):
                raise ValueError('Missing Chinese reading-aid labels: ' + locale)
            if any(not ref['label'][locale].strip() for ref in self.references.values()):
                raise ValueError('Missing Chinese reference title: ' + locale)
        shape = lambda body: [len(stanza.splitlines()) for stanza in body.split('\n\n')]
        for tid, reading in self.texts.items():
            source = library.edition(tid, 'zh')['body']
            if reading['source_body_sha256'] != hashlib.sha256(source.encode()).hexdigest():
                raise ValueError('Review Chinese reading aids after an original-text change: ' + tid)
            for locale in ('zh', 'zh-hans'):
                edition = reading[locale]
                body = edition['body']
                if not body.strip() or any(not line.strip() for line in body.splitlines()
                                           if line != ''):
                    raise ValueError('Empty Chinese paraphrase or line: ' + tid)
                if shape(body) != shape(source):
                    raise ValueError('Chinese paraphrases must preserve lines and stanzas: ' + tid)
                if not edition['notes']:
                    raise ValueError('Missing Chinese annotations: ' + tid)
                for note in edition['notes']:
                    if not note['lemma'].strip() or not note['body'].strip():
                        raise ValueError('Empty Chinese annotation: ' + tid)
                    if any(ref not in self.references for ref in note['refs']):
                        raise ValueError('Unknown Chinese annotation reference: ' + tid)
            if len(reading['zh']['notes']) != len(reading['zh-hans']['notes']):
                raise ValueError('Chinese annotation mirrors differ: ' + tid)
            if [n['refs'] for n in reading['zh']['notes']] != [n['refs'] for n in reading['zh-hans']['notes']]:
                raise ValueError('Chinese annotation source mirrors differ: ' + tid)

    def edition(self, tid: str, locale: str) -> dict[str, Any]:
        return self.texts[tid][locale]
