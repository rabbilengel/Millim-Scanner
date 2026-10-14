# Setting up your online account (Firebase)

This is done **once**. It takes about 15–20 minutes. After this you can sign in to the app from any computer
with your email and password, and see all your quizzes and results.

Firebase is a free Google service. It will hold your **login** and your **results** (not your scanned PDFs).
Google's Firebase screens change from time to time. If something below looks different, look for the closest
matching button, or send Claude a screenshot.

---

## 1. Create a Firebase project

1. Go to **https://console.firebase.google.com** and sign in with a Google account.
   A personal Gmail is usually easiest; school Google accounts are sometimes not allowed to create projects.
2. Click **Create a project** (or **Get started with a Firebase project**).
3. Project name: **Millim Scanner** → **Continue**.
4. If it asks about **Gemini** or **Google Analytics**, you can turn them **off** (not needed) → **Create project**.
5. Wait for "Your project is ready" → **Continue**.

You're now on the project's home page ("Project Overview").

## 2. Register the app and copy its settings

1. On the Project Overview page, click the **Web** button — it looks like **`</>`**
   (it may be under **+ Add app**).
2. App nickname: **Millim Scanner**. Leave "Firebase Hosting" **unticked**. Click **Register app**.
3. You'll see a box of code containing something like:

   ```
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "millim-scanner-xxxx.firebaseapp.com",
     projectId: "millim-scanner-xxxx",
     storageBucket: "...",
     messagingSenderId: "...",
     appId: "..."
   };
   ```

4. **Copy that whole `firebaseConfig = { ... }` part and paste it into your chat with Claude.**
   These values are not secret — they only say which project to use. (Your password and the security
   rules in step 5 protect your data.)
5. Click **Continue to console**.

## 3. Turn on email-and-password sign-in, and create your account

1. In the left menu: **Build → Authentication** (or **Security → Authentication**) → **Get started**.
2. **Sign-in method** tab → choose **Email/Password** → switch on the **first** switch (Email/Password)
   → **Save**. (Leave "Email link" off.)
3. **Users** tab → **Add user** → type **your email** and a **password** (at least 6 characters; a strong
   one is better) → **Add user**. This is the login you'll use in the app.
4. **Settings** tab → **User actions** → **untick "Enable create (sign-up)"** → **Save**.
   This stops anyone else from creating an account in your project.
5. Still in **Settings** → **Authorized domains** → **Add domain** → type `rabbilengel.github.io` → **Add**.

## 4. Create the database

1. Left menu: **Build → Firestore Database** → **Create database**.
2. If asked for an edition, choose **Standard**.
3. **Location**: pick one near you (for example `eur3 (europe-west)` or `nam5 (United States)`).
   This can't be changed later, but any choice works.
4. Choose **Start in production mode** → **Create**.

## 5. Lock the database so only you can use it

1. In **Firestore Database**, open the **Rules** tab.
2. Delete everything in the box and paste this instead (it's also in the project as `firestore.rules`):

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{userId}/{document=**} {
         allow read, write: if request.auth != null && request.auth.uid == userId;
       }
     }
   }
   ```

3. Click **Publish**.

## 6. Tell Claude

Paste the `firebaseConfig` from step 2 into the chat. Claude will connect the app to your project.
Then, after you merge the change, open **https://rabbilengel.github.io/Millim-Scanner/** and sign in with the
email and password from step 3.

---

## Good to know

- **Cost:** the free plan ("Spark") is plenty. Don't upgrade or add billing — nothing here needs it.
- **Forgot your password?** Type your email on the sign-in screen and click **Forgot password?**.
  Or change it in Firebase: Authentication → Users → ⋮ next to your account → Reset password.
- **Shared computers:** untick "Keep me signed in" when you sign in, or click **Sign out** when done.
  Signing out also erases the copy of your data kept on that computer.
- **Seeing your raw data:** Firebase console → Firestore Database → Data. You don't need to touch it;
  the app's Results tab and backup file are the easy way.
