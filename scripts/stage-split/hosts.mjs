// The closures the split tool works on (docs/refactor-plan.md; B5, 15 Nov 2026). A host is one big factory function in one file; its parts are
// the files the tool wrote for it, named by the specs in its spec directory (scripts/stage-split/<specDir>/<part>.json).
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SPECS = join(ROOT, 'scripts/stage-split');

export const HOSTS = {
  stage: { file: 'stage.js', fn: 'createStage', label: 'stage.js', specDir: 'parts', family: 'src/ui/stage*', boot: 'tests/warm-alloc.test.js' },
  presenter: { file: 'presenter.js', fn: 'createPresenter', label: 'presenter.js', specDir: 'parts-presenter', family: 'src/ui/presenter*', boot: null, extra: ['presenter-words.js', 'presenter-cards.js'] },
  lobule: { file: 'lobule-zoom.js', fn: 'createLobuleZoom', label: 'lobule-zoom.js', specDir: 'parts-lobule', family: 'src/ui/lobule-zoom*', boot: null },
};

/** The part files of a host, from its spec directory ('stage' also takes every stage-*.js already there, as before the specs held them all). */
export function partFiles(name) {
  const h = HOSTS[name], dir = join(SPECS, h.specDir);
  const fromSpecs = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')).file) : [];
  const there = (f) => existsSync(join(ROOT, 'src/ui', f));   // (a spec whose part is not written yet is no part yet)
  if (name !== 'stage') return fromSpecs.filter(there).sort();
  return [...new Set([...fromSpecs.filter(there), ...readdirSync(join(ROOT, 'src/ui')).filter((n) => /^stage-.+\.js$/.test(n))])].sort();
}
/** The family: the host's file first, then the modules moved out by hand (extra), then the tool's parts. */
export const familyFiles = (name) => [HOSTS[name].file, ...(HOSTS[name].extra || []), ...partFiles(name)];
/** For lib.mjs useHost(): does an import's source name one of this host's parts? */
export const hostConfig = (name) => {
  const h = HOSTS[name], parts = new Set(partFiles(name).map((f) => './' + f));
  return { fn: h.fn, label: h.label, isPart: name === 'stage' ? (s) => /^\.\/stage-[^/]+\.js$/.test(s) : (s) => parts.has(s) };
};
