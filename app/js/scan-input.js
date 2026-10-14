/*
 * SCAN INPUT (browser only) — turns files into gray images for the reader.
 *  - PDF: each page is drawn at about 200 dpi using pdf.js.
 *  - Photos (JPG/PNG): resized so the longest side is at most 2400 pixels.
 *
 *   for await (const page of Millim.scanInput.pages(files)) { ... page.image, page.source ... }
 */
(function (root) {
  'use strict';
  const M = (root.Millim = root.Millim || {});

  const TARGET_DPI = 200;
  const MAX_PHOTO_SIDE = 2400;

  function setupPdfJs() {
    const pdfjs = root.pdfjsLib;
    if (!pdfjs) throw new Error('The PDF reader (pdf.js) did not load.');
    // When the app is opened from a file, browsers block background workers;
    // pdf.js then runs on the page itself (slower, but works).
    pdfjs.GlobalWorkerOptions.workerSrc = 'app/vendor/pdf.worker.min.js';
    return pdfjs;
  }

  function canvasToGray(canvas) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    return M.image.fromRGBA(data, canvas.width, canvas.height);
  }

  async function* pdfPages(file) {
    const pdfjs = setupPdfJs();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const doc = await pdfjs.getDocument({ data: bytes, isEvalSupported: false }).promise;
    try {
      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n);
        const base = page.getViewport({ scale: 1 });
        // Letter size at 200 dpi is about 1700 x 2200 pixels.
        const scale = Math.min(TARGET_DPI / 72, 2600 / Math.max(base.width, base.height));
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport }).promise;
        yield { image: canvasToGray(canvas), source: file.name + ', page ' + n, fileName: file.name, pageNumber: n, pageCount: doc.numPages };
        page.cleanup();
        canvas.width = canvas.height = 0;
      }
    } finally {
      doc.destroy();
    }
  }

  async function photoPage(file) {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, MAX_PHOTO_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close && bitmap.close();
    return { image: canvasToGray(canvas), source: file.name, fileName: file.name, pageNumber: 1, pageCount: 1 };
  }

  function isPdf(file) {
    return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  }

  // Count pages up front (for the progress bar).
  async function countPages(files) {
    let total = 0;
    for (const file of files) {
      if (isPdf(file)) {
        const pdfjs = setupPdfJs();
        const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
        total += doc.numPages;
        doc.destroy();
      } else total += 1;
    }
    return total;
  }

  async function* pages(files) {
    for (const file of files) {
      if (isPdf(file)) yield* pdfPages(file);
      else yield await photoPage(file);
    }
  }

  // Gray image → a small JPEG (for showing the sheet to the teacher without keeping huge images in memory).
  async function grayToJpegUrl(img, maxWidth) {
    const scale = Math.min(1, maxWidth / img.width);
    const full = document.createElement('canvas');
    full.width = img.width; full.height = img.height;
    full.getContext('2d').putImageData(new ImageData(M.image.toRGBA(img), img.width, img.height), 0, 0);
    const small = document.createElement('canvas');
    small.width = Math.round(img.width * scale); small.height = Math.round(img.height * scale);
    const ctx = small.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(full, 0, 0, small.width, small.height);
    full.width = full.height = 0;
    const blob = await new Promise((resolve) => small.toBlob(resolve, 'image/jpeg', 0.85));
    return { url: URL.createObjectURL(blob), width: small.width, height: small.height, scale: scale };
  }

  M.scanInput = { pages, countPages, grayToJpegUrl, isPdf };
})(typeof window !== 'undefined' ? window : globalThis);
