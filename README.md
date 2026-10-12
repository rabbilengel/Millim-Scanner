# Millim Scanner

A bubble-sheet grading program (like ZipGrade) that runs entirely in your web browser.
Nothing to install, and student data never leaves your computer.

**Status**
- ✅ Phase 1 — print answer sheets (blank or pre-filled per student)
- ⏳ Phase 2 — read scanned sheets and grade them
- ⏳ Phase 3 — results by class, item analysis, CSV export

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
    app.js            ← the screens (buttons, forms, tabs)
  css/style.css       ← how the screens look
  data/roster-data.js ← copy of the roster for when the app is opened from a file (generated)
  vendor/             ← tools stored in the project: pdf-lib (makes PDFs), fontkit, Heebo Hebrew font
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
They check, among other things, that every printed bubble is exactly where the map says.
To run them yourself (developers): `npm test` (needs Node.js 22+; `pdftoppm` from poppler for the PDF checks).

## Guides

- [Getting Claude's changes into your main branch](docs/merging-changes.md)
- [Turning on GitHub Pages](docs/github-pages.md)

## Privacy

All processing happens in your browser. The page includes a security setting that blocks it from sending data to
any other website. Settings are remembered only in your browser on your computer.

## Credits

[pdf-lib](https://pdf-lib.js.org) and fontkit (MIT license). [Heebo](https://github.com/OdedEzer/heebo) font
(SIL Open Font License, see `app/vendor/Heebo-OFL-LICENSE.txt`).
