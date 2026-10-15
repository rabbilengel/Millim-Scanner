/*
 * ACCOUNT — signing in and out, and choosing where data is saved.
 *
 *  - Online accounts set up (app/js/firebase-config.js) and opened as a website:
 *      show the sign-in screen; after signing in, data comes from your account.
 *  - Otherwise: no sign-in; data is saved in this browser only.
 */
(function () {
  'use strict';
  const M = window.Millim;
  const D = M.dataStore;
  const $ = (id) => document.getElementById(id);

  function ready() { document.dispatchEvent(new CustomEvent('millim:ready')); }

  function message(text, isError) {
    $('signin-message').textContent = text || '';
    $('signin-message').classList.toggle('error', !!isError);
  }

  async function startLocal(note) {
    $('footer-mode').textContent = note || 'Everything runs in this browser window. Results are saved in this browser only.';
    await D.start('local');
    ready();
  }

  async function start() {
    if (!M.cloud.available()) {
      const configured = window.MILLIM_FIREBASE_CONFIG && window.MILLIM_FIREBASE_CONFIG.apiKey;
      return startLocal(configured
        ? 'Opened from a file, so you can\'t sign in here — results are saved in this browser only. Use the website address to reach your account.'
        : undefined);
    }
    M.cloud.init();
    document.body.classList.add('signed-out');
    M.cloud.onAccountChange(async (user) => {
      if (!user) {
        $('signin').hidden = false;
        $('account').hidden = true;
        document.body.classList.add('signed-out');
        setTimeout(() => $('signin-email').focus(), 0);
        return;
      }
      $('signin').hidden = true;
      $('account').hidden = false;
      $('account-email').textContent = user.email;
      document.body.classList.remove('signed-out');
      $('footer-mode').textContent = 'Signed in as ' + user.email + '. Results are saved to your account and can be opened from any computer.';
      try {
        await D.start('cloud');
      } catch (err) {
        console.error(err);
        alert('Signed in, but your saved quizzes could not be loaded: ' + M.cloud.explain(err));
      }
      ready();
    });
  }

  $('signin-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('signin-button').disabled = true;
    message('Signing in…');
    try {
      await M.cloud.signIn($('signin-email').value, $('signin-password').value, $('signin-remember').checked);
      message('');
      $('signin-password').value = '';
    } catch (err) {
      message(M.cloud.explain(err), true);
    } finally {
      $('signin-button').disabled = false;
    }
  });

  $('signin-forgot').addEventListener('click', async () => {
    const email = $('signin-email').value.trim();
    if (!email) { message('Type your email address above first, then click "Forgot password?" again.', true); return; }
    try {
      await M.cloud.resetPassword(email);
      message('If that email has an account, a link to choose a new password is on its way. Check your inbox (and spam folder).');
    } catch (err) {
      message(M.cloud.explain(err), true);
    }
  });

  $('sign-out').addEventListener('click', async () => {
    if (!confirm('Sign out? Unsaved work on the Grade scans tab will be lost.')) return;
    await M.cloud.signOut();
    // Start fresh so nothing from this account stays on the screen.
    location.reload();
  });

  start();
})();
