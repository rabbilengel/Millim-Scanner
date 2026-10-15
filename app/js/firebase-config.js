/*
 * FIREBASE SETTINGS — which Firebase project stores your accounts and results.
 *
 * From: Firebase console → Project settings (gear icon) → "Your apps" → the web app.
 * See docs/firebase-setup.md. These values are not secret: they only say
 * which project to use. Your data is protected by your password and by the
 * security rules in firestore.rules.
 *
 * To turn accounts off (save results only in the browser), set this to null.
 */
(typeof window !== 'undefined' ? window : globalThis).MILLIM_FIREBASE_CONFIG =
  (typeof window !== 'undefined' && window.MILLIM_FIREBASE_CONFIG) || {
    apiKey: 'AIzaSyDxqHhAlBCJCLljKL0jlBPVuCzPSXArDwc',
    authDomain: 'millim-scanner.firebaseapp.com',
    projectId: 'millim-scanner',
    storageBucket: 'millim-scanner.firebasestorage.app',
    messagingSenderId: '824262005993',
    appId: '1:824262005993:web:75aab4d531423aa34d8c78',
  };
