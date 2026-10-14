'use strict';
/*
 * Image helpers for the tests: turn PDFs into gray images (using the free
 * "pdftoppm" program) and make distorted copies (tilted, shadowed, ...) to
 * check that the reader copes with imperfect scans and photos.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const M = require('../../tools/load-app');

function havePdftoppm() {
  try { execFileSync('pdftoppm', ['-v'], { stdio: 'ignore' }); return true; } catch (e) { return false; }
}

function readPgm(buf) {
  let pos = 0;
  const tokens = [];
  while (tokens.length < 4) {
    while (/\s/.test(String.fromCharCode(buf[pos]))) pos++;
    if (buf[pos] === 35) { while (buf[pos] !== 10) pos++; continue; }
    let t = '';
    while (!/\s/.test(String.fromCharCode(buf[pos]))) t += String.fromCharCode(buf[pos++]);
    tokens.push(t);
  }
  pos++;
  return { width: Number(tokens[1]), height: Number(tokens[2]), data: new Uint8ClampedArray(buf.subarray(pos)) };
}

// PDF (file path or bytes) -> array of gray images, one per page.
function renderPdf(pdf, dpi) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'millim-'));
  let file = pdf;
  if (typeof pdf !== 'string') { file = path.join(dir, 'in.pdf'); fs.writeFileSync(file, pdf); }
  execFileSync('pdftoppm', ['-gray', '-r', String(dpi || 200), file, path.join(dir, 'page')]);
  const pages = fs.readdirSync(dir).filter((f) => f.endsWith('.pgm')).sort()
    .map((f) => readPgm(fs.readFileSync(path.join(dir, f))));
  fs.rmSync(dir, { recursive: true, force: true });
  return pages;
}

/*
 * Make a new image of size (width x height) in which the source image's four
 * corners land on `corners` = [topLeft, topRight, bottomRight, bottomLeft].
 * Background is light gray like a desk.
 */
function warp(img, corners, width, height) {
  const src = [{ x: 0, y: 0 }, { x: img.width, y: 0 }, { x: img.width, y: img.height }, { x: 0, y: img.height }];
  const back = M.homography.fromPoints(corners, src);
  const out = M.image.create(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = back(x + 0.5, y + 0.5);
      out.data[y * width + x] = p.x < 0 || p.y < 0 || p.x >= img.width || p.y >= img.height ? 200 : M.image.sample(img, p.x - 0.5, p.y - 0.5);
    }
  }
  return out;
}

function rotate(img, degrees) {
  const a = (degrees * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const w = Math.ceil(Math.abs(img.width * c) + Math.abs(img.height * s)) + 40;
  const h = Math.ceil(Math.abs(img.width * s) + Math.abs(img.height * c)) + 40;
  const pts = [[0, 0], [img.width, 0], [img.width, img.height], [0, img.height]].map(([x, y]) => {
    const dx = x - img.width / 2, dy = y - img.height / 2;
    return { x: w / 2 + dx * c - dy * s, y: h / 2 + dx * s + dy * c };
  });
  return warp(img, pts, w, h);
}

// A photo taken at an angle: the top of the sheet looks narrower than the bottom.
function perspective(img) {
  const W = img.width, H = img.height;
  const w = Math.round(W * 1.15), h = Math.round(H * 1.1);
  return warp(img, [
    { x: W * 0.16, y: H * 0.06 }, { x: W * 0.98, y: H * 0.03 },
    { x: W * 1.1, y: H * 1.05 }, { x: W * 0.04, y: H * 1.02 },
  ], w, h);
}

function scale(img, factor) {
  const w = Math.round(img.width * factor), h = Math.round(img.height * factor);
  return warp(img, [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }], w, h);
}

// Darker towards one corner, like a shadow or a lamp on one side.
function shadow(img, strength) {
  const out = M.image.create(img.width, img.height);
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
    const f = 1 - strength * ((x / img.width + y / img.height) / 2);
    out.data[y * img.width + x] = img.data[y * img.width + x] * f;
  }
  return out;
}

// Random speckle, like a grainy photo. (Fixed seed so the test is repeatable.)
function noise(img, amount) {
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const out = M.image.create(img.width, img.height);
  for (let i = 0; i < img.data.length; i++) out.data[i] = img.data[i] + (rnd() - 0.5) * 2 * amount;
  return out;
}

// Pencil-like marks drawn onto a clean rendered sheet. darkness: 0..1
function fillBubble(img, dpi, xPt, yPt, rPt, darkness) {
  const k = dpi / 72, cx = xPt * k, cy = yPt * k, r = rPt * k * 0.92;
  let seed = Math.round(xPt * 31 + yPt * 17);
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
    if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
    const i = y * img.width + x;
    const target = 255 * (1 - darkness * (0.85 + 0.15 * rnd()));
    img.data[i] = Math.min(img.data[i], target);
  }
}

module.exports = { havePdftoppm, readPgm, renderPdf, warp, rotate, perspective, scale, shadow, noise, fillBubble };
