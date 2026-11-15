// An SVG transform list read as one matrix, without writing to the element (15 Nov 2026, app review OG-1).
//
// `list.consolidate()` returns the list's one matrix, but it also REPLACES the list on the element by a single matrix() item, which
// rewrites the `transform` attribute and fires every attribute observer on the page. Nine readers called it on organ groups: the group's
// own writer put translate() back, so the next reading rewrote it again, and the organ stack's change observer could be woken by the
// painter's own reads (a plausible root cause of the "17 times a second" note). This reads the items and multiplies them here: the same
// matrix, the attribute left alone. One item (the usual case, a bare matrix() or translate()) allocates nothing but the item's own matrix.

/** The list's matrix written into `out` ({ a, b, c, d, e, f } of the caller's, rewritten at each call), or null for an empty or absent list. */
export function listMatrix(list, out) {
  const n = list ? list.numberOfItems : 0;
  if (!n) return null;
  let m = list.getItem(0).matrix;
  let a = m.a, b = m.b, c = m.c, d = m.d, e = m.e, f = m.f;
  for (let i = 1; i < n; i++) {
    m = list.getItem(i).matrix;   // (the list's items apply left to right: M0 · M1 · …, the product consolidate() would have made)
    const A = a * m.a + c * m.b, B = b * m.a + d * m.b, C = a * m.c + c * m.d, D = b * m.c + d * m.d;
    const E = a * m.e + c * m.f + e, F = b * m.e + d * m.f + f;
    a = A; b = B; c = C; d = D; e = E; f = F;
  }
  out.a = a; out.b = b; out.c = c; out.d = d; out.e = e; out.f = f;
  return out;
}
