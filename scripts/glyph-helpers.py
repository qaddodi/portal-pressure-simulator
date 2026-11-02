# Shared by scripts/glyphs.py and scripts/glyph-metrics.py: Inter's GPOS pair kerning and its tabular-figure substitutions.
def kerning(font, names):
    gpos = font['GPOS'].table if 'GPOS' in font else None
    out = {}
    if not gpos: return out
    want = set(names)
    lookups = set()
    for fr in gpos.FeatureList.FeatureRecord:
        if fr.FeatureTag == 'kern': lookups.update(fr.Feature.LookupListIndex)
    for li in sorted(lookups):
        lk = gpos.LookupList.Lookup[li]
        for st in lk.SubTable:
            if lk.LookupType == 9: st = st.ExtSubTable
            if getattr(st, 'LookupType', 2) != 2 and lk.LookupType not in (2, 9): continue
            if not hasattr(st, 'Format'): continue
            cov = st.Coverage.glyphs
            if st.Format == 1:
                for i, first in enumerate(cov):
                    if first not in want: continue
                    for pvr in st.PairSet[i].PairValueRecord:
                        v = pvr.Value1.XAdvance if pvr.Value1 and hasattr(pvr.Value1, 'XAdvance') else 0
                        if v and pvr.SecondGlyph in want: out.setdefault(first, {}).setdefault(pvr.SecondGlyph, v)
            elif st.Format == 2:
                c1 = st.ClassDef1.classDefs; c2 = st.ClassDef2.classDefs
                for first in cov:
                    if first not in want: continue
                    k1 = c1.get(first, 0)
                    for second in want:
                        k2 = c2.get(second, 0)
                        rec = st.Class1Record[k1].Class2Record[k2]
                        v = rec.Value1.XAdvance if rec.Value1 and hasattr(rec.Value1, 'XAdvance') else 0
                        if v: out.setdefault(first, {}).setdefault(second, v)
    return out

def tnum_map(font):
    gsub = font['GSUB'].table
    m = {}
    for fr in gsub.FeatureList.FeatureRecord:
        if fr.FeatureTag != 'tnum': continue
        for li in fr.Feature.LookupListIndex:
            for st in gsub.LookupList.Lookup[li].SubTable:
                if hasattr(st, 'ExtSubTable'): st = st.ExtSubTable
                if hasattr(st, 'mapping'): m.update(st.mapping)
    return m

