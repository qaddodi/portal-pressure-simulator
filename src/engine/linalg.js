// Dense Gaussian elimination with partial pivoting. N ≈ 40, so O(N³) per step is trivial.

export function solveInPlace(A, b, n) {
  for (let k = 0; k < n; k++) {
    let p = k, max = Math.abs(A[k * n + k]);
    for (let i = k + 1; i < n; i++) {
      const v = Math.abs(A[i * n + k]);
      if (v > max) { max = v; p = i; }
    }
    if (max < 1e-300) throw new Error('Singular matrix');
    if (p !== k) {
      for (let j = k; j < n; j++) {
        const t = A[k * n + j]; A[k * n + j] = A[p * n + j]; A[p * n + j] = t;
      }
      const t = b[k]; b[k] = b[p]; b[p] = t;
    }
    const pivot = A[k * n + k];
    for (let i = k + 1; i < n; i++) {
      const f = A[i * n + k] / pivot;
      if (f === 0) continue;
      A[i * n + k] = 0;
      for (let j = k + 1; j < n; j++) A[i * n + j] -= f * A[k * n + j];
      b[i] -= f * b[k];
    }
  }
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    for (let j = i + 1; j < n; j++) s -= A[i * n + j] * b[j];
    b[i] = s / A[i * n + i];
  }
  return b;
}
