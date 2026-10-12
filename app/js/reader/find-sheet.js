/*
 * FIND SHEET — locates the four black corner markers in a scan or photo.
 *
 * Steps:
 *  1. Work on a smaller copy of the image (faster).
 *  2. Mark pixels that are darker than their neighbourhood and group them into blobs.
 *  3. Keep blobs that look like solid squares of a sensible size.
 *  4. Of those, pick the four that best form the corners of the sheet.
 *  5. The marker with a white hole is the bottom-left one; that tells us which way is up.
 *
 * Returns { corners: { topLeft, topRight, bottomRight, bottomLeft }, holeFound, candidates }
 * (points in full-image pixels), or { error } in plain words.
 */
(function (root) {
  'use strict';
  const M = (root.Millim = root.Millim || {});
  const I = M.image;

  const WORK_SIZE = 800; // longest side of the reduced image

  function blobInfo(b, mask, width) {
    const w = b.maxX - b.minX + 1, h = b.maxY - b.minY + 1;
    // How dark is the middle of the blob? (the bottom-left marker has a white hole there)
    let centerDark = 0, centerTotal = 0;
    const cx0 = Math.round(b.minX + w * 0.38), cx1 = Math.round(b.maxX - w * 0.38);
    const cy0 = Math.round(b.minY + h * 0.38), cy1 = Math.round(b.maxY - h * 0.38);
    for (let y = cy0; y <= cy1; y++) for (let x = cx0; x <= cx1; x++) { centerDark += mask[y * width + x]; centerTotal++; }
    return {
      x: b.sumX / b.count, y: b.sumY / b.count,
      cx: (b.minX + b.maxX) / 2, cy: (b.minY + b.maxY) / 2,
      w, h, area: b.count,
      fill: b.count / (w * h),
      hole: centerTotal > 0 && centerDark / centerTotal < 0.3,
    };
  }

  function orderClockwise(points) {
    const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
    const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
    return points.slice().sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  }

  function polygonArea(p) {
    let a = 0;
    for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length]; a += p[i].x * q.y - q.x * p[i].y; }
    return a / 2;
  }

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  // How much do these four blobs look like the corners of our sheet? (higher is better, 0 = no)
  function scoreQuad(quad) {
    const q = orderClockwise(quad);
    // must be convex: every turn in the same direction
    for (let i = 0; i < 4; i++) {
      const a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4];
      if ((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) <= 0) return 0;
    }
    const sides = [0, 1, 2, 3].map((i) => dist(q[i], q[(i + 1) % 4]));
    // Opposite sides should be similar in length (allowing for a tilted camera)
    const opp1 = Math.min(sides[0], sides[2]) / Math.max(sides[0], sides[2]);
    const opp2 = Math.min(sides[1], sides[3]) / Math.max(sides[1], sides[3]);
    if (opp1 < 0.6 || opp2 < 0.6) return 0;
    // Marker centres on the sheet are 534 x 714 points apart (ratio 0.75)
    const ratio = Math.min(sides[0] + sides[2], sides[1] + sides[3]) / Math.max(sides[0] + sides[2], sides[1] + sides[3]);
    if (ratio < 0.55 || ratio > 0.95) return 0;
    // The four markers are the same size
    const areas = quad.map((b) => b.area);
    const sizeMatch = Math.min.apply(null, areas) / Math.max.apply(null, areas);
    if (sizeMatch < 0.4) return 0;
    const holes = quad.filter((b) => b.hole).length;
    return Math.abs(polygonArea(q)) * opp1 * opp2 * sizeMatch * (holes === 1 ? 1.5 : 1) * (1 - Math.abs(ratio - 0.75));
  }

  // Find the exact centre of a marker in the full-size image.
  function refineCenter(img, blob, factor) {
    const pad = Math.max(blob.w, blob.h) * factor * 0.35;
    const x0 = Math.max(0, Math.floor(blob.cx * factor - (blob.w * factor) / 2 - pad));
    const x1 = Math.min(img.width - 1, Math.ceil(blob.cx * factor + (blob.w * factor) / 2 + pad));
    const y0 = Math.max(0, Math.floor(blob.cy * factor - (blob.h * factor) / 2 - pad));
    const y1 = Math.min(img.height - 1, Math.ceil(blob.cy * factor + (blob.h * factor) / 2 + pad));
    let lo = 255, hi = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const v = img.data[y * img.width + x]; if (v < lo) lo = v; if (v > hi) hi = v; }
    const t = (lo + hi) / 2;
    // Centre of the dark square's outline box, using only dark pixels near the blob
    let sx = 0, sy = 0, n = 0;
    const rows = [], cols = [];
    for (let y = y0; y <= y1; y++) {
      let c = 0;
      for (let x = x0; x <= x1; x++) if (img.data[y * img.width + x] < t) { c++; sx += x; sy += y; n++; }
      rows.push(c);
    }
    for (let x = x0; x <= x1; x++) {
      let c = 0;
      for (let y = y0; y <= y1; y++) if (img.data[y * img.width + x] < t) c++;
      cols.push(c);
    }
    if (!n) return { x: blob.cx * factor, y: blob.cy * factor };
    // Use the span of rows/columns that are substantially dark: robust to a hole in the middle.
    const span = (arr, offset) => {
      const max = Math.max.apply(null, arr);
      let first = -1, last = -1;
      arr.forEach((c, i) => { if (c > max * 0.5) { if (first < 0) first = i; last = i; } });
      return offset + (first + last) / 2;
    };
    return { x: span(cols, x0) + 0.5, y: span(rows, y0) + 0.5 };
  }

  function findSheet(img) {
    const factor = Math.max(1, Math.ceil(Math.max(img.width, img.height) / WORK_SIZE));
    const small = I.downscale(img, factor);
    const minDim = Math.min(small.width, small.height);
    const mask = I.adaptiveThreshold(small, Math.round(minDim / 6), 0.7);
    const { blobs } = I.connectedComponents(mask, small.width, small.height);

    const candidates = blobs
      .filter((b) => b.count >= 12)
      .map((b) => blobInfo(b, mask, small.width))
      .filter((b) => {
        const side = Math.max(b.w, b.h);
        return side >= minDim * 0.02 && side <= minDim * 0.16 &&
          Math.max(b.w, b.h) / Math.min(b.w, b.h) <= 1.7 && b.fill >= 0.45;
      })
      .sort((a, b) => b.area - a.area)
      .slice(0, 10);

    if (candidates.length < 4) {
      return { error: 'Could not find the four black corner squares. Make sure the whole sheet is in the picture.', candidates };
    }

    let best = null, bestScore = 0;
    for (let a = 0; a < candidates.length; a++)
      for (let b = a + 1; b < candidates.length; b++)
        for (let c = b + 1; c < candidates.length; c++)
          for (let d = c + 1; d < candidates.length; d++) {
            const quad = [candidates[a], candidates[b], candidates[c], candidates[d]];
            const s = scoreQuad(quad);
            if (s > bestScore) { bestScore = s; best = quad; }
          }
    if (!best) {
      return { error: 'Found dark squares, but they don\'t form the corners of an answer sheet.', candidates };
    }

    // Order clockwise; start from the marker with the hole (bottom-left) if there is exactly one.
    let ordered = orderClockwise(best);
    const holes = ordered.filter((b) => b.hole);
    const holeFound = holes.length === 1;
    if (holeFound) {
      const k = ordered.indexOf(holes[0]);
      ordered = ordered.slice(k).concat(ordered.slice(0, k));
    }
    const pts = ordered.map((b) => refineCenter(img, b, factor));
    return {
      holeFound,
      // If holeFound is false, this is just a guess; the caller tries all four turns.
      clockwiseFromBottomLeft: pts,
      corners: { bottomLeft: pts[0], topLeft: pts[1], topRight: pts[2], bottomRight: pts[3] },
      markerSize: best.reduce((s, b) => s + Math.max(b.w, b.h), 0) / 4 * factor,
    };
  }

  M.findSheet = { findSheet, orderClockwise, scoreQuad };
})(typeof window !== 'undefined' ? window : globalThis);
