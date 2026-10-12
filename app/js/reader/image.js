/*
 * Basic image tools for the reader.
 * A "gray image" is { width, height, data } where data holds one byte per
 * pixel: 0 = black, 255 = white. Works the same in the browser and in Node.
 */
(function (root) {
  'use strict';
  const M = (root.Millim = root.Millim || {});

  function create(width, height) {
    return { width, height, data: new Uint8ClampedArray(width * height) };
  }

  // From canvas pixels (RGBA) to gray.
  function fromRGBA(rgba, width, height) {
    const img = create(width, height);
    const d = img.data;
    for (let i = 0, j = 0; i < d.length; i++, j += 4) {
      // Use the darkest channel, so colored pen (e.g. blue) counts as dark.
      d[i] = Math.min(rgba[j], rgba[j + 1], rgba[j + 2]);
    }
    return img;
  }

  // Gray to RGBA (for drawing on a canvas).
  function toRGBA(img) {
    const out = new Uint8ClampedArray(img.width * img.height * 4);
    for (let i = 0, j = 0; i < img.data.length; i++, j += 4) {
      out[j] = out[j + 1] = out[j + 2] = img.data[i];
      out[j + 3] = 255;
    }
    return out;
  }

  // Shrink by a whole-number factor, averaging blocks of pixels.
  function downscale(img, factor) {
    if (factor <= 1) return img;
    const w = Math.floor(img.width / factor), h = Math.floor(img.height / factor);
    const out = create(w, h);
    const n = factor * factor;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sum = 0;
        for (let yy = 0; yy < factor; yy++) {
          let p = (y * factor + yy) * img.width + x * factor;
          for (let xx = 0; xx < factor; xx++) sum += img.data[p++];
        }
        out.data[y * w + x] = sum / n;
      }
    }
    return out;
  }

  // Summed-area table, for fast averages over rectangles.
  function integral(img) {
    const w = img.width + 1;
    const sums = new Float64Array(w * (img.height + 1));
    for (let y = 1; y <= img.height; y++) {
      let row = 0;
      for (let x = 1; x <= img.width; x++) {
        row += img.data[(y - 1) * img.width + (x - 1)];
        sums[y * w + x] = sums[(y - 1) * w + x] + row;
      }
    }
    return { sums, w };
  }

  function rectMean(ii, x0, y0, x1, y1) {
    const s = ii.sums, w = ii.w;
    return (s[y1 * w + x1] - s[y0 * w + x1] - s[y1 * w + x0] + s[y0 * w + x0]) / ((x1 - x0) * (y1 - y0));
  }

  /*
   * Mark pixels that are clearly darker than their surroundings.
   * Comparing with the local average (not one fixed level) copes with
   * shadows and uneven lighting in phone photos.
   */
  function adaptiveThreshold(img, windowSize, ratio) {
    const ii = integral(img);
    const out = new Uint8Array(img.width * img.height);
    const r = Math.max(1, Math.floor(windowSize / 2));
    for (let y = 0; y < img.height; y++) {
      const y0 = Math.max(0, y - r), y1 = Math.min(img.height, y + r + 1);
      for (let x = 0; x < img.width; x++) {
        const x0 = Math.max(0, x - r), x1 = Math.min(img.width, x + r + 1);
        const mean = rectMean(ii, x0, y0, x1, y1);
        out[y * img.width + x] = img.data[y * img.width + x] < mean * ratio ? 1 : 0;
      }
    }
    return out;
  }

  /*
   * Group touching dark pixels into "blobs".
   * Returns [{ count, minX, maxX, minY, maxY, sumX, sumY }].
   */
  function connectedComponents(mask, width, height) {
    const labels = new Int32Array(width * height).fill(-1);
    const blobs = [];
    const stack = new Int32Array(width * height);
    for (let start = 0; start < mask.length; start++) {
      if (!mask[start] || labels[start] >= 0) continue;
      const id = blobs.length;
      const b = { count: 0, minX: Infinity, maxX: -1, minY: Infinity, maxY: -1, sumX: 0, sumY: 0 };
      let top = 0;
      stack[top++] = start;
      labels[start] = id;
      while (top) {
        const p = stack[--top];
        const x = p % width, y = (p - x) / width;
        b.count++; b.sumX += x; b.sumY += y;
        if (x < b.minX) b.minX = x; if (x > b.maxX) b.maxX = x;
        if (y < b.minY) b.minY = y; if (y > b.maxY) b.maxY = y;
        for (let dy = -1; dy <= 1; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= width) continue;
            const q = ny * width + nx;
            if (mask[q] && labels[q] < 0) { labels[q] = id; stack[top++] = q; }
          }
        }
      }
      blobs.push(b);
    }
    return { blobs, labels };
  }

  // Pixel value at a fractional position (smoothly blended from the 4 nearest pixels).
  function sample(img, x, y) {
    if (x < 0 || y < 0 || x > img.width - 1 || y > img.height - 1) return 255;
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const x1 = Math.min(x0 + 1, img.width - 1), y1 = Math.min(y0 + 1, img.height - 1);
    const fx = x - x0, fy = y - y0;
    const d = img.data, w = img.width;
    const top = d[y0 * w + x0] * (1 - fx) + d[y0 * w + x1] * fx;
    const bottom = d[y1 * w + x0] * (1 - fx) + d[y1 * w + x1] * fx;
    return top * (1 - fy) + bottom * fy;
  }

  function percentile(values, p) {
    const sorted = Array.from(values).sort((a, b) => a - b);
    if (!sorted.length) return 0;
    return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))))];
  }

  M.image = { create, fromRGBA, toRGBA, downscale, integral, rectMean, adaptiveThreshold, connectedComponents, sample, percentile };
})(typeof window !== 'undefined' ? window : globalThis);
