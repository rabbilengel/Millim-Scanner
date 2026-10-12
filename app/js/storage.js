/*
 * Storage: remembers settings in this browser (localStorage).
 * If the browser blocks storage, the app still works — it just won't remember.
 */
(function (root) {
  'use strict';
  const M = (root.Millim = root.Millim || {});
  const PREFIX = 'millim.';

  function load(key, fallback) {
    try {
      const raw = root.localStorage.getItem(PREFIX + key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function save(key, value) {
    try {
      root.localStorage.setItem(PREFIX + key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  function remove(key) {
    try { root.localStorage.removeItem(PREFIX + key); } catch (e) { /* ignore */ }
  }

  M.storage = { load, save, remove };
})(typeof window !== 'undefined' ? window : globalThis);
