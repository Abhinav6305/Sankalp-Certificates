# SANKALP '26 — Certificate Portal

A participant enters the email address they registered with, sees their details,
and downloads their Certificate of Appreciation as a PNG or a PDF.

Everything runs in the browser. No backend, no database, no build step required,
no CDN — the fonts, the certificate template and the participant list are all
part of the project.

---

## Run it

```bash
npm start
```

Then open **http://localhost:5173**.

`npm start` runs `server.js`, a ~40-line static file server with zero
dependencies — there is nothing to `npm install`.

**Alternatives**

- VS Code **Live Server** extension → right-click `index.html` → *Open with Live Server*.
  (The extension is already listed in `.vscode/extensions.json`, so VS Code will offer to install it.)
- `python3 -m http.server 5173`

> Don't open `index.html` with `file://` — Chrome blocks locally-loaded fonts,
> and the certificate paragraph will render in the wrong typeface. Use a server.
> (The one exception is `dist/index.html`, which is self-contained and works
> from anywhere — see *Deploy*.)

---

## Project layout

```
sankalp26-certificates/
├── index.html                    page markup
├── css/styles.css                all styling + @font-face declarations
├── js/
│   ├── data.js                   GENERATED — the participant list
│   ├── certificate.js            canvas rendering + PNG/PDF export
│   └── app.js                    lookup UI wiring
├── assets/
│   ├── certificate-template.jpg  3000px template, blanks removed
│   ├── origin-logo.png
│   ├── fonts/                    Poppins (UI) + Tinos (certificate)
│   └── source/
│       └── certificate-template-6250px.png   full-resolution master
├── data/
│   ├── participants.csv          THE source of truth — edit this
│   └── missing-email.csv         registrations with no email address
├── build/
│   ├── build_data.py             participants.csv  ->  js/data.js
│   └── bundle.py                 whole site        ->  dist/index.html
├── dist/index.html               GENERATED — single-file build for deploying
└── server.js                     local dev server
```

---

## Editing the participant list

`data/participants.csv` is the only file you should edit. Columns:

| Name | Email | Year | Department |
|------|-------|------|------------|
| Vishal | vishal01sonu@gmail.com | III | CSE |

After editing:

```bash
npm run build:data     # regenerates js/data.js
```

The script prints a warning for any row with a missing/invalid year, department
or email, and lists any email address shared by two different people.

**Two known data issues carried over from the registration forms:**

1. **5 participants registered without an email address** — listed in
   `data/missing-email.csv`. They cannot look themselves up until you add their
   addresses to `participants.csv`.
2. **2 email addresses are shared by two different people**
   (`25bk5a040@stpetershyd.com`, `gy4153631@gmail.com`) — someone entered a
   teammate's address. The site handles this with a *"which one are you?"*
   picker, but it's worth correcting at the source.

---

## Deploy

```bash
npm run build          # regenerates js/data.js, then bundles dist/index.html
```

`dist/index.html` is a single ~700 KB file with everything inlined as base64 —
zero external requests. Deploy whichever way suits you:

- **Netlify** — drag `dist/index.html` onto <https://app.netlify.com/drop>
- **Vercel** — `vercel deploy` from the project root (serves the multi-file version)
- **GitHub Pages** — push the repo, enable Pages on the root
- Anything else — copy `dist/index.html` to any web server

> **Privacy note:** the participant list is embedded in the page, so anyone who
> views the page source can read all 231 names and email addresses. That is a
> deliberate trade-off for having no backend. If that isn't acceptable, the fix
> is to store SHA-256 hashes of the emails instead of the plaintext and look up
> by hash — names would still be visible, so a real backend is the only complete
> answer.

---

## How the certificate is drawn

The original design had the participant's details as fixed-width underscore
blanks inside a flowing paragraph. Long names would never have fit.

So the paragraph was removed from the template image — using a grayscale
morphological close, which erases thin dark strokes (the text) while leaving
thick light ones (the `SANKALP'26` watermark) intact — and is now re-typeset at
render time in **Tinos Bold**, which is metrically identical to the Times New
Roman used in the original.

All the geometry lives in one object at the top of `js/certificate.js`, in the
coordinate space of the 6250 × 4419 master file:

```js
const GEO = {
  left:     560  * S,   // paragraph left edge
  right:    5885 * S,   // paragraph right edge
  baseline: 2198 * S,   // first line baseline
  lineHeight: 145 * S,
  fontSize:   107 * S,
  maxLines:   5         // font shrinks 4% per step if a name overflows this
};
```

`RENDER_WIDTH` (3000 px, ≈256 DPI on A4 landscape) is the only thing you need to
change to alter output resolution — every coordinate scales with it.

### The filled-in blanks

The name, year and department are treated as *values filled into the design's
blanks*, so each is drawn sitting on the same rule the original underscores
used — measured from the source file at 15 px below the baseline, 6.5 px thick.
A multi-word name keeps one continuous rule through its spaces, and a trailing
comma or full stop stays off the rule where it belongs to the sentence.

Tune it with the `BLANK` object in `js/certificate.js`:

```js
const BLANK = {
  underline:  true,     // false -> filled values read as plain body text
  offset:     15  * S,  // baseline to top of the rule
  thickness:  6.5 * S,
  padding:    12  * S,  // rule overhang on each side of the value
  nameScale:  1.0       // >1 enlarges the name relative to the body text
};
```

The paragraph is built from `bodySegments()` rather than one string; any segment
given a `blank` id gets a rule.

All 231 participants currently wrap to exactly 4 lines at full size; nothing
shrinks or overflows.

The PDF is written by hand in `makePdf()` — a single-page A4-landscape document
with the canvas embedded as a JPEG. That is ~40 lines and avoids a 360 KB
dependency on jsPDF.

---

## Changing the wording

The certificate sentence is `bodyText()` in `js/certificate.js`. Edit it there;
the wrapping adjusts automatically.

## Changing the design

Replace `assets/certificate-template.jpg` with a new blank template (same aspect
ratio), then re-measure and update `GEO`. `assets/source/` holds the
full-resolution 6250 px master the current template was derived from.
