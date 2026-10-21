"""Preserve IPA attribution while giving derived font programs distinct names."""
from copy import deepcopy


def rename_ipa_subset(font, original, family, postscript):
    font['name'] = deepcopy(original['name'])
    names = {1: family, 3: family + ': site subset 1.0', 4: family,
             6: postscript, 16: family, 17: 'Regular', 18: family,
             21: family, 22: 'Regular'}
    for record in font['name'].names:
        if record.nameID in names:
            record.string = names[record.nameID].encode(record.getEncoding())
    for ident in (1, 3, 4, 6, 16, 17):
        font['name'].setName(names[ident], ident, 3, 1, 0x409)
    assert font['name'].getDebugName(13) and font['name'].getDebugName(14)


def rename_ofl_subset(font, original, family, postscript):
    """Rename a static, subset instance of an OFL font while keeping its
    copyright, licence and vendor records. Instance names (256+), the
    variations PostScript prefix (25) and the upstream trademark notice (7)
    are dropped because the derived face no longer carries the upstream name."""
    font['name'] = deepcopy(original['name'])
    font['name'].names = [record for record in font['name'].names
                          if record.nameID < 256 and record.nameID not in (7, 25)]
    names = {1: family, 2: 'Regular', 3: family + ': site subset 1.0', 4: family,
             6: postscript, 16: family, 17: 'Regular'}
    font['name'].names = [record for record in font['name'].names if record.nameID not in names]
    for ident, value in names.items():
        font['name'].setName(value, ident, 3, 1, 0x409)
        font['name'].setName(value, ident, 1, 0, 0)
    assert font['name'].getDebugName(13) and font['name'].getDebugName(14)
