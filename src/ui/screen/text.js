// The text form of a screen report: plain sentences grouped by part, for people and for an AI that reads instead of looking (plan section 1, "Two forms").
// Each reader writes its own lines (its `text(part, ctx)`); this puts them under headings in the report's order and ends with the findings.
// The summary stays under SUMMARY_MAX characters (about 2 KB): lines past it are dropped with one line saying how many and how to ask for them.
import { readerList } from './registry.js';
import { findingText } from '../selfcheck/rules.js';

export const SUMMARY_MAX = 2000;

export function screenText(report, { detail = report?.detail || 'summary', only } = {}) {
  const ctx = { detail, env: { detail }, parts: report };
  const sel = only == null ? null : Array.isArray(only) ? only : [only];
  const head = [];
  const body = [];
  for (const r of readerList()) {
    if (!(r.id in report) || (sel && r.id !== 'page' && !sel.includes(r.id))) continue;
    let lines;
    try { lines = r.text ? r.text(report[r.id], ctx) || [] : [`${r.id}: ${JSON.stringify(report[r.id])}`]; } catch (e) { lines = [`(${r.id} text failed: ${e?.message || e})`]; }   // alloc-rare
    (r.id === 'page' ? head : body).push(...lines.filter(Boolean));
  }
  if (report.errors) body.push(`Readers that failed: ${Object.entries(report.errors).map(([k, v]) => `${k} (${v})`).join('; ')}.`);
  const tail = [];
  if (report.findings) {
    if (!report.findings.length) tail.push('Self-checks: nothing wrong found.');
    else { tail.push(`Self-checks found ${report.findings.length} problem${report.findings.length === 1 ? '' : 's'}:`); for (const f of report.findings) tail.push(`  ${findingText(f)}`); }
  }
  let lines = [...head, ...body, ...tail];
  if (detail !== 'full') {
    let n = 0, used = 0;
    const keepTail = tail.join('\n').length + 1;
    for (const l of [...head, ...body]) { if (used + l.length + 1 + keepTail > SUMMARY_MAX) break; used += l.length + 1; n++; }
    const first = [...head, ...body];
    if (n < first.length) lines = [...first.slice(0, n), `(${first.length - n} more lines: pps.screen({ detail: 'full' }) or { only: '<part>' })`, ...tail];
  }
  return lines.join('\n');
}
