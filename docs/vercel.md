# Where the app is published (Vercel)

The app's address is **https://millim-scanner.vercel.app**.

[Vercel](https://vercel.com) publishes the app from this GitHub repository. You signed in to Vercel with your GitHub
account, so there's no separate password.

## How updates reach the website

1. Claude opens a pull request on GitHub.
2. Vercel automatically builds a **preview** of that pull request and posts a link on it (look for "Visit Preview").
   You can open it to try the change before merging. (You'll need to sign in there, too.)
3. When you **merge** the pull request into `main`, Vercel publishes it to **millim-scanner.vercel.app** within about
   a minute.

## Settings worth knowing

- **Vercel project → Settings → Domains:** the address. To use your own domain later (e.g. `millim-scanner.com`),
  buy it in Vercel → Domains (it then sets itself up), or buy it elsewhere and add the DNS record Vercel shows.
- **Firebase → Authentication → Settings → Authorized domains:** every address the app is opened from must be listed
  here (currently `millim-scanner.vercel.app`, and `rabbilengel.github.io` if GitHub Pages is still on).
  Add any new domain here as well.
- **GitHub Pages** (the old address, `rabbilengel.github.io/Millim-Scanner/`) can stay on as a spare, or be turned
  off in GitHub → Settings → Pages. Your data is the same at both addresses, because it lives in your account.
