# Millim Scanner

A bubble-sheet grading program (like ZipGrade) that runs entirely in your web browser.
Nothing to install, and student data never leaves your computer.

**Status**
- ✅ Phase 1 — print answer sheets (blank or pre-filled per student)
- ✅ Phase 2 — read scanned sheets, review, grade, save, download results as CSV
- ⏳ Phase 3 — results by class, item analysis

---

## How to open the app

**Option A — from the website (once GitHub Pages is turned on):**
open `https://rabbilengel.github.io/Millim-Scanner/`. See [docs/github-pages.md](docs/github-pages.md).

**Option B — from your computer:**
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

**Roster tab** — shows each class, sorted by Hebrew last name.

## Updating the roster

The roster is the file `data/roster.csv`, with columns:
`Last Name, First Name, Zipgrade ID, Class, Hebrew First Name, Hebrew Last Name` (class like `4_1`).

To replace it: on GitHub, open the `data` folder → **Add file → Upload files** → upload your new file
**named `roster.csv`** → **Commit changes**. Then ask Claude to "update the built-in roster" (this refreshes the copy
used when the app is opened from a file). The website version reads `roster.csv` directly.

You can also load a different roster just on your own computer: **Roster tab → Load a different roster file…**

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
    app.js            ← the screens: tabs, answer sheets, roster
    grade-ui.js       ← the Grade scans screen and the review screen
  css/style.css       ← how the screens look
  data/roster-data.js ← copy of the roster for when the app is opened from a file (generated)
  vendor/             ← tools stored in the project: pdf-lib (makes PDFs), pdf.js (reads PDFs), fontkit, Heebo font
data/roster.csv       ← your roster
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

## Privacy

All processing happens in your browser. The page includes a security setting that blocks it from sending data to
any other website. Settings, answer keys and saved results are remembered only in this browser on this computer
(clearing the browser's history/site data erases them — download the results CSV to keep a copy).

## Credits

[pdf-lib](https://pdf-lib.js.org) and fontkit (MIT license). [pdf.js](https://mozilla.github.io/pdf.js/) (Apache 2.0 license). [Heebo](https://github.com/OdedEzer/heebo) font
(SIL Open Font License, see `app/vendor/Heebo-OFL-LICENSE.txt`).
