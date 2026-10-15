/*
 * Small helpers shared by the screens.
 */
(function (root) {
  'use strict';
  const M = (root.Millim = root.Millim || {});

  // Make an element: el('button', { class: 'x', text: 'Hi', onclick: fn }, [children])
  function el(tag, attrs, children) {
    const e = document.createElement(tag);
    for (const k in attrs || {}) {
      if (k === 'text') e.textContent = attrs[k];
      else if (k === 'class') e.className = attrs[k];
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== undefined && attrs[k] !== null && attrs[k] !== false) e.setAttribute(k, attrs[k]);
    }
    (children || []).forEach((c) => e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return e;
  }

  // English letters, digits and a few symbols only: some browsers refuse file names with Hebrew.
  function safeName(s) {
    return String(s).replace(/[^A-Za-z0-9 _().-]+/g, ' ').replace(/\s+/g, ' ').trim() || 'quiz';
  }

  function download(text, name, type) {
    const url = URL.createObjectURL(new Blob([text], { type: (type || 'text/plain') + ';charset=utf-8' }));
    const a = el('a', { href: url, download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  // Run fn after `ms` of quiet (e.g. save once after several quick clicks).
  function debounce(fn, ms) {
    let t = null;
    const run = function () { clearTimeout(t); t = setTimeout(fn, ms); };
    run.now = function () { clearTimeout(t); return fn(); };
    return run;
  }

  // 'uploaded' | 'pending' | 'saved' | 'failed' -> words for the teacher
  function saveMessage(status) {
    return {
      uploaded: 'Saved to your account.',
      pending: 'Saved on this computer — it will upload to your account when the internet connection is back.',
      saved: 'Saved in this browser.',
      failed: 'Could not save (the browser blocked storage). Download the CSV instead.',
    }[status] || '';
  }

  M.ui = { el, safeName, download, debounce, saveMessage };
})(typeof window !== 'undefined' ? window : globalThis);
