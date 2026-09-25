// Build a SCORM 1.2 package of the simulator for an LMS (Moodle, Canvas, Blackboard, D2L…).
// No dependencies: files are stored in a plain ZIP. Inside the LMS, src/ui/lms.js finds the
// SCORM API, reports the best lesson or case score and marks the activity passed or failed.
//
//   node scripts/scorm.mjs                       whole simulator, opens on Home
//   node scripts/scorm.mjs --lesson hvpg         straight into one lesson
//   node scripts/scorm.mjs --case bleed          straight into one case
//   node scripts/scorm.mjs --script ph-ten       a presenter script
//
// Output: dist/portal-pressure-simulator[-<activity>]-scorm12.zip

import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : null; };
const kind = ['lesson', 'case', 'script'].find((k) => opt(k));
const target = kind ? opt(kind) : null;
const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;

const INCLUDE = ['index.html', 'manifest.webmanifest', 'sw.js', 'src', 'styles', 'fonts', 'brand'];
const walk = (p) => (statSync(p).isDirectory() ? readdirSync(p).flatMap((f) => walk(join(p, f))) : [p]);
const files = INCLUDE.flatMap((f) => walk(join(ROOT, f))).map((p) => relative(ROOT, p).split(sep).join('/'));

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const title = kind ? `Portal Pressure Simulator: ${kind} ${target}` : 'Portal Pressure Simulator';
const params = kind ? `?${kind}=${encodeURIComponent(target)}` : '?home=explore';
const manifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="portal-pressure-simulator${kind ? '-' + kind + '-' + target : ''}" version="${esc(version)}"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd http://www.imsglobal.org/xsd/imsmd_rootv1p2p1 imsmd_rootv1p2p1.xsd http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
  <metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata>
  <organizations default="org">
    <organization identifier="org">
      <title>${esc(title)}</title>
      <item identifier="item1" identifierref="sco1" isvisible="true" parameters="${esc(params)}">
        <title>${esc(title)}</title>
        <adlcp:masteryscore>50</adlcp:masteryscore>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="sco1" type="webcontent" adlcp:scormtype="sco" href="index.html">
${files.map((f) => `      <file href="${esc(f)}"/>`).join('\n')}
    </resource>
  </resources>
</manifest>
`;

// ── Minimal ZIP writer (stored entries, CRC-32) ──
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (buf) => { let c = 0xFFFFFFFF; for (const b of buf) c = CRC[(c ^ b) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function zip(entries) {
  const locals = [], centrals = [];
  let offset = 0;
  const now = new Date(), dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1), dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const [name, data] of entries) {
    const nb = Buffer.from(name, 'utf8'), crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(0, 8);
    lh.writeUInt16LE(dosTime, 10); lh.writeUInt16LE(dosDate, 12); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(nb.length, 26); lh.writeUInt16LE(0, 28);
    locals.push(lh, nb, data);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(0, 10);
    ch.writeUInt16LE(dosTime, 12); ch.writeUInt16LE(dosDate, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(nb.length, 28); ch.writeUInt32LE(offset, 42);
    centrals.push(ch, nb);
    offset += 30 + nb.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

const entries = [['imsmanifest.xml', Buffer.from(manifest, 'utf8')], ...files.map((f) => [f, readFileSync(join(ROOT, f))])];
mkdirSync(join(ROOT, 'dist'), { recursive: true });
const out = join(ROOT, 'dist', `portal-pressure-simulator${kind ? '-' + target : ''}-scorm12.zip`);
writeFileSync(out, zip(entries));
console.log(`SCORM 1.2 package: ${relative(ROOT, out)} (${entries.length} files, ${(statSync(out).size / 1024).toFixed(0)} KB)`);
