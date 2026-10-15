/*
 * FIREBASE SETTINGS — which Firebase project stores your accounts and results.
 *
 * Fill these in from: Firebase console → Project settings (gear icon) →
 * "Your apps" → the web app → "SDK setup and configuration" → Config.
 * See docs/firebase-setup.md. These values are not secret: they only say
 * which project to use. Your data is protected by your password and by the
 * security rules in firestore.rules.
 *
 * While this is empty (null), the app works without accounts and saves
 * results only in this browser.
 */
(typeof window !== 'undefined' ? window : globalThis).MILLIM_FIREBASE_CONFIG =
  (typeof window !== 'undefined' && window.MILLIM_FIREBASE_CONFIG) || null;
