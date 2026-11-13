// One vocabulary for a gradient's band (unification audit, findings 3 and 16, 13 Nov 2026): the HVPG's and PPG's band words, the maps between
// the rating vocabularies (status ok / caution / danger, table rating ok / mid / hi, colour token --ok / --caution / --danger) and the
// missing-number glyph live once, in src/engine/pressure-cuts.js. These rules fail any other file of src/ that writes them again; what each
// card prints is checked by tests/rating-vocabulary.test.js.
import { readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const HOME = 'src/engine/pressure-cuts.js';
// The pressure-monitor thread's files, which still hold their own copy until that thread moves them onto the table (unification audit 3 and 16:
// hvpg-proc.js SEV, SEV_WORD and its "not measurable" sentence; eus-ppg.js SEV_WORD and NOT). Take a file off this list when it reads the table.
const WAITING = new Set(['src/ui/hvpg-proc.js', 'src/ui/eus-ppg.js']);

// A band word written as a rating's word: { caution: 'Mild' }, mid: tup('mid', 'Mild'), or a chain of comparisons that ends in one.
const BAND = /\b(?:caution|mid|danger|hi)\s*:\s*(?:\w+\(\s*'\w+'\s*,\s*)?'(?:Mild|Mild portal hypertension|Portal hypertension|CSPH|Clinically significant portal hypertension \(CSPH\)|Bleed risk)'|\?\s*'Mild'\s*:|'CSPH · bleed risk'/;
// A map from one rating vocabulary to another: { mid: 'caution' }, { caution: 'mid' }, { hi: '--danger' }, { danger: '--danger' }.
const MAP = /\b(?:mid|hi)\s*:\s*'(?:caution|danger|--caution|--danger)'|\b(?:caution|danger)\s*:\s*'(?:mid|hi|--caution|--danger)'/;
// A missing number written as two hyphens (the FibroScan probe's screen did): the one glyph is NOT_SHOWN, the em dash.
const DASHES = /[?:]\s*'--'\s*[)};,]/;

const files = walk(join(ROOT, 'src')).filter((f) => f.endsWith('.js')).map((f) => relative(ROOT, f).split('\\').join('/'))
  .filter((f) => f !== HOME && !WAITING.has(f) && !f.startsWith('src/ui/decks/') && !f.startsWith('src/ui/test-decks/'));

export default files.flatMap((file) => [
  { file, forbid: [BAND, `a HVPG or PPG band word written as a rating's word: read HVPG_WORDS / PPG_WORDS (or hvpgWord / ppgWord) from ${HOME}`] },
  { file, forbid: [MAP, `a second map between the rating vocabularies: read SEV_OF_RATE, RATE_OF_SEV, TOKEN_OF_SEV or TOKEN_OF_RATE from ${HOME}`] },
  { file, forbid: [DASHES, `a missing number as two hyphens: print NOT_SHOWN (the em dash) from ${HOME}`] },
]);
