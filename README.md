# Millim Scanner

A bubble-sheet grading program (like ZipGrade) that runs in your web browser. Nothing to install.
Sign in from any computer to see all your quizzes and results.

**Status**
- ✅ Phase 1 — print answer sheets (blank or pre-filled per student)
- ✅ Phase 2 — read scanned sheets, review, grade, save, download results as CSV
- ✅ Phase 3 — results by class, item analysis, answer-key fixes, backup
- ✅ Online accounts — sign in from any computer (Google Firebase); see [docs/firebase-setup.md](docs/firebase-setup.md)

---

## How to open the app

**From the website (recommended):** open **https://rabbilengel.github.io/Millim-Scanner/** on any computer,
tablet or phone, and sign in with your email and password. Your quizzes and results are saved to your account.

**From a downloaded copy (works without internet, but no account — results stay in that browser):**
1. On the repository's GitHub page, click the green **Code** button → **Download ZIP**.
2. Open the downloaded ZIP and choose **Extract all** (don't just double-click inside the ZIP).
3. In the extracted folder, double-click **`index.html`**. Chrome or Edge recommended.

## Using it

**Answer sheets tab**
- Set the title, number of questions (up to 100), choices per question (2–6), and labels (1 2 3, A B C, or א ב ג).
- Some questions can have a different number of choices (e.g. questions 16–20 are true/false with 2).
- Choose blank sheets, pre-filled sheets for one class, or pre-filled sheets for a whole grade.
  Pre-filled sheets have the student's name, class and ID printed, with the ID bubbles already filled in.
- Click **Create PDF**, then **Download PDF**. **Print at 100% / "Actual size"**, not "Fit to page".

**Grade scans tab**
1. **Choose PDF or photos…** — pick the PDF from the copier (one sheet per page; upside-down or crooked is fine).
   The app reads each page and works out the sheet layout by itself.
2. **Answer key** — give the quiz a name and click the correct answer for each question, or **Import key from CSV**
   (one line per question like `1,B`, or all answers in one line like `B,C,A,D`). Keys are saved and offered again next time.
   To accept two answers for a question, click both. To drop a question, leave it empty.
3. **Check the sheets** — every sheet is listed with the student and score. Sheets marked ⚠ need a look:
   click **Review** to see the scanned sheet with the reading drawn on it, plus a close-up of each unclear question.
   Choose the right answer, fix the student if the ID was unclear, then click **This sheet is correct ✓**.
4. **Save results**, and/or **Download results as CSV** (opens in Excel with Hebrew names).

What gets flagged for review (never guessed): two answers marked, a very light mark, a possible erasure,
an unclear or unknown student ID, the same ID on two sheets, and pages that aren't answer sheets.

Scanning tips: grayscale (or color), 200–300 dpi. One sheet per page.

**Results tab**
- Pick a quiz. See how many students were graded, the average, highest and lowest score.
- Pick a class to see **every student in it, sorted by Hebrew last name** — including who hasn't been graded yet.
  Click a student to see their answers (wrong answers in red). Delete a result if it was saved by mistake.
- **Item analysis:** for each question, the percent who got it right and how many chose each answer — the correct
  answer in green, the most-chosen wrong answer in orange. Questions most students missed are marked in red.
- **Answer key:** fix the key after grading (accept a second answer, drop a bad question) — everyone is re-scored at once.
- **Download** results or item analysis as CSV (for the whole quiz or one class).
- **Backup:** download one file with all your quizzes and results, and restore it on any computer.

**Roster tab** — shows each class, sorted by Hebrew last name; add, edit and remove students (see below).

**Signing in and out** — when you open the website you'll be asked for your email and password. On a shared
computer, untick "Keep me signed in", or click **Sign out** (top right) when you're done; signing out also erases the
copy of your data kept on that computer. Forgot your password? Type your email and click **Forgot password?**.

## Updating the roster

The roster lives **in your account** (Firebase), so every computer you sign in on has the same, latest list.
(The first time you signed in, the app copied `data/roster.csv` from this project into your account.)

Everything is done in the **Roster** tab:
- **+ Add a student** — Hebrew and English names, 7-digit ID, class (or a new class like `4_6`).
- **Edit** (next to each student) — fix a name, move to another class, change the ID, or **remove** a student who left.
- **Replace the whole roster from a CSV file** — e.g. a new list at the start of the year
  (columns: `Last Name, First Name, Zipgrade ID, Class, Hebrew First Name, Hebrew Last Name`).
- **Download the roster (CSV)** — opens in Excel with Hebrew names; also a handy backup.

Saved quiz results are kept when a student is removed or moved.
Without an account (a downloaded copy opened from a file), the roster is kept in that browser instead.

## How the project is organized

```
index.html            ← the app (open this)
app/
  js/
    hebrew.js         ← class codes (4_1 ↔ ד-א) and right-to-left text in PDFs
    roster.js         ← reads the roster CSV, sorts by Hebrew last name
    sheet-layout.js   ← THE MAP: where every marker and bubble sits on a sheet
    sheet-pdf.js      ← draws answer sheets as PDFs, using the map
    test-sheets.js    ← the test packet and its correct answers
    storage.js        ← remembers your settings in this browser
    reader/           ← THE SCAN READER
      image.js          basic picture tools
      find-sheet.js     finds the four corner squares (and which way is up)
      homography.js     the math that straightens a tilted or angled sheet
      read-sheet.js     straightens the page, evens out lighting, reads the sheet code, ID and every bubble
    scan-input.js     ← opens PDFs (with pdf.js) and photos in the browser
    grading.js        ← answer keys, CSV import, scoring
    results.js        ← class lists, averages, item analysis, results CSV
    firebase-config.js← which Firebase project holds your account and results
    cloud.js          ← signing in, and reading/writing your data in Firebase
    data-store.js     ← the one place screens save/load (your account, or this browser if not signed in)
    app.js            ← the screens: tabs, answer sheets, roster
    grade-ui.js       ← the Grade scans screen and the review screen
    results-ui.js     ← the Results screen and backup
    account-ui.js     ← the sign-in screen
    key-grid.js, ui-util.js ← small shared screen pieces
  css/style.css       ← how the screens look
  data/roster-data.js ← copy of the roster for when the app is opened from a file (generated)
  vendor/             ← tools stored in the project: pdf-lib (makes PDFs), pdf.js (reads PDFs), fontkit, Heebo font,
                        Firebase (accounts and online storage)
data/roster.csv       ← your roster
firestore.rules       ← Firebase security rules: each account can only see its own data
test-sheets/          ← printable test packet
test-scans/           ← your scans of the test packet (used by the tests)
tests/                ← automated tests
tools/                ← helper scripts (for Claude/developers; you don't need these)
docs/                 ← step-by-step guides
```

**Why "the map" matters:** the sheet printer and the scan reader both use `sheet-layout.js`, so they always agree on
where the bubbles are. Every sheet also prints a row of small squares at the top (the "sheet code") that tells the
reader the number of questions, choices and labels, so it can rebuild the exact layout from a scan.

## Automated tests

Every time changes are pushed, GitHub runs the tests automatically (green ✓ or red ✗ next to the commit).
They check, among other things:
- every printed bubble is exactly where the map says;
- **your real scans in `test-scans/`** read exactly as the test packet's instructions say;
- the same scans still read correctly when tilted, turned sideways, photographed at an angle, at low resolution,
  with a shadow, or grainy (preparing for phone photos);
- computer-filled sheets of other layouts (6 choices, Hebrew letters, 100 questions, pre-filled) read correctly.

To add more test scans, fill in the test packet again (`test-sheets/test-packet.pdf`) and upload the PDF to `test-scans/`.
To run them yourself (developers): `npm test` (needs Node.js 22+; `pdftoppm` from poppler for the PDF checks).

## Guides

- [Getting Claude's changes into your main branch](docs/merging-changes.md)
- [Turning on GitHub Pages](docs/github-pages.md)
- [Setting up your online account (Firebase)](docs/firebase-setup.md)

## Privacy

Reading scans, grading and making PDFs all happen in your browser; scanned images are never uploaded.
When you're signed in, your **answer keys and results** (student names, IDs, answers, scores) are saved to your own
Google Firebase project, where security rules let only your account read or change them. The page includes a security
setting that blocks it from sending data anywhere except its own website and Google Firebase.
Without an account (e.g. a downloaded copy opened from a file), everything is saved only in that browser.

## Credits

[pdf-lib](https://pdf-lib.js.org) and fontkit (MIT license). [pdf.js](https://mozilla.github.io/pdf.js/) and the
[Firebase](https://firebase.google.com) JavaScript SDK (Apache 2.0 license). [Heebo](https://github.com/OdedEzer/heebo) font
(SIL Open Font License, see `app/vendor/Heebo-OFL-LICENSE.txt`).
