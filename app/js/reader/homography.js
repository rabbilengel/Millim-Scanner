/*
 * Homography: the math that maps points on the flat printed page to points in
 * a photo or scan of it, even when the picture is rotated, skewed or taken at
 * an angle. Four matching points (the corner markers) are enough to work it out.
 */
(function (root) {
  'use strict';
  const M = (root.Millim = root.Millim || {});

  // Solve A x = b (n x n) by Gaussian elimination with partial pivoting.
  function solve(A, b) {
    const n = b.length;
    const m = A.map((row, i) => row.concat([b[i]]));
    for (let c = 0; c < n; c++) {
      let pivot = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[pivot][c])) pivot = r;
      if (Math.abs(m[pivot][c]) < 1e-12) return null;
      [m[c], m[pivot]] = [m[pivot], m[c]];
      for (let r = 0; r < n; r++) {
        if (r === c) continue;
        const f = m[r][c] / m[c][c];
        for (let k = c; k <= n; k++) m[r][k] -= f * m[c][k];
      }
    }
    return m.map((row, i) => row[n] / row[i]);
  }

  /*
   * from, to: arrays of 4 points {x, y}. Returns a function mapping a point
   * in "from" space to "to" space, or null if the points are degenerate.
   */
  function fromPoints(from, to) {
    const A = [], b = [];
    for (let i = 0; i < 4; i++) {
      const { x, y } = from[i], u = to[i].x, v = to[i].y;
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
    }
    const h = solve(A, b);
    if (!h) return null;
    const map = (x, y) => {
      const w = h[6] * x + h[7] * y + 1;
      return { x: (h[0] * x + h[1] * y + h[2]) / w, y: (h[3] * x + h[4] * y + h[5]) / w };
    };
    map.coefficients = h;
    return map;
  }

  M.homography = { solve, fromPoints };
})(typeof window !== 'undefined' ? window : globalThis);
