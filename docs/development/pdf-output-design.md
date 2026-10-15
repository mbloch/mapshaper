# PDF output: preliminary research

Status: research and prototyping. Nothing here is implemented yet.

Goal: `-o format=pdf`, drawing the same map as SVG output (labels, furniture
and effects included), optionally in CMYK, with an RGB-to-CMYK conversion that
can be overridden per color by a swatch table. Fonts are embedded as subsets.
The first users are NYT graphics editors making newspaper print maps; see
"Print requirements" below.

## Library choice

Candidates evaluated (October 2026):

| Library | Status | CMYK | SVG input | Font subsetting |
|---|---|---|---|---|
| PDFKit 0.20 | active, MIT | DeviceCMYK, CMYK gradients, `addSpotColor()` (Separation) | via svg-to-pdfkit | yes, with fontkit |
| svg-to-pdfkit 0.1.8 | old npm release, repo still active | `colorCallback` hook | yes, own XML parser | uses PDFKit |
| pdf-lib 1.17 | unmaintained since 2022 | `cmyk()` | path data only | buggy fork of fontkit |
| jsPDF 4 + svg2pdf.js | active | limited | needs a DOM | limited |
| resvg / Rust svg2pdf | no JS PDF backend | none | yes | yes |

**Recommendation: PDFKit.** Its dependencies `fontkit` and `fflate` are
already mapshaper dependencies, so it adds little to `node_modules`.
`js/pdfkit.js` is 232 KB. It is the only maintained JS library with real
CMYK, spot colors and font subsetting.

## Prototype results

A scratch script exported a small styled map as SVG through mapshaper and
converted it with svg-to-pdfkit into PDFKit, both as RGB and with a
`colorCallback` that maps to CMYK. Checked with `pdftoppm` and `pdffonts`:

- Paths, dash arrays, opacity, hatch `<pattern>` fills and label halos all
  survive. The CMYK document uses DeviceCMYK for every fill and stroke.
- A swatch override works: `#e41a1c` came out as exactly 0/95/90/0.
- Fonts embed as subsets with a ToUnicode map, so text stays searchable. A
  773 KB Arial became a subset of about 15 KB, measured uncompressed.
- **`<filter>` is silently dropped** (no warning). Polygon glows
  (`svg-glow.mjs`) are lost.
- svg-to-pdfkit hard-codes `/CS /DeviceRGB` on transparency groups, so a
  CMYK document still blends translucent content in RGB.
- svg-to-pdfkit calls `colorCallback` on its built-in default colors
  without a raw string, and overwrites a module-global table with the
  results. A second conversion in the same process converts those defaults
  again.
- `opacityToColor()` in mask mode loops over `color.length` (always 2)
  rather than the channel count. This is a latent bug for masks and CMYK.
- Not yet tested: `textPath` labels, markers and arrowheads, the
  `linearGradient` fade on arrows, `radialGradient` effects, embedded raster
  images.

## Architecture options

1. **Generated SVG → svg-to-pdfkit → PDFKit.** The quickest path, and the
   prototype already works. The cost: we re-parse our own SVG, inherit
   svg-to-pdfkit's gaps (filters, RGB transparency groups, global state), and
   would probably have to vendor and patch it.
2. **Mapshaper's SVG object tree → PDFKit directly.** `renderSVGDocument()`
   builds `{tag, properties, children}` objects before stringifying. A
   renderer for that tree only has to cover the vocabulary mapshaper emits,
   not all of SVG. It can resolve fonts with the same `findFontFace()` that
   measured the labels, apply CMYK, spot colors and overprint natively, and
   choose how to handle glows. This is more work up front but gives better
   control.

Suggested plan: prototype with option 1 to settle color and font questions,
then build option 2. Use svg-to-pdfkit's source as a reference for text,
markers and `textPath`.

## Fonts

- PDFKit's `registerFont(name, path, postscriptName)` accepts the
  `{path, postscriptName}` that `findFontFace()` returns, collections
  included. That means PDF text uses the face the label layout was measured
  with.
- Fallback faces from `findFallbackFaces()` would need per-run font
  switching, which svg-to-pdfkit does not do.
- Without registration, svg-to-pdfkit falls back to the standard-14 PDF fonts
  and embeds nothing. Missing fonts must be an explicit warning.
- Variable fonts: need to check how fontkit subsets a named instance. PDFKit
  may embed the default instance only.
- Browser: the GUI bundle has no fontkit and cannot read system font files.
  There are three options: user-supplied font files, the Local Font Access
  API (`queryLocalFonts()`, Chromium only), or standard-14 fonts as a
  fallback.

## Print requirements (New York Times print maps)

The main users are NYT graphics editors who now make print maps in
Illustrator. Newspaper presses register the four inks poorly, which leads to
these rules:

- **Grayscale lines and text use K only.** RGB black and grays must never
  become four-color (rich) black. Many converters, ICC-based ones included,
  produce rich black by default, so this rule overrides whatever conversion
  is in use.
- **Colors use as few inks as possible.** Editors pick from a palette of
  approved CMYK colors rather than converting arbitrary RGB.
- **Match their Illustrator profile.** CMYK conversion should match the
  color settings the desk uses in Illustrator. We don't have that profile
  yet. It may be a standard newsprint profile (Adobe ships "U.S. Newsprint
  (SNAP 2007)") or an NYT-specific one.
- **A fallback formula** when no profile is available or selected.

## CMYK conversion

Each color is resolved by the first rule that matches:

1. **Swatch table (the print palette).** Exact matches from a normalized
   color string to CMYK, optionally with a spot color name, which becomes a
   PDF Separation. Swatches are defined in CMYK. Their hex value is only the
   screen color, ideally copied from Illustrator, where it is computed under
   the desk's profile.
2. **Neutral colors** (R = G = B, including black and white) become K only.
   This comes before profile conversion and covers all neutrals, not just
   lines and text. That is simpler and matches the intent. Open question: how
   to map gray to K. Options are linear (`K = 1 - v`) or a tone curve that
   compensates for newsprint dot gain, so that a 50% gray on screen doesn't
   print darker.
3. **Profile conversion**, when a profile is configured.
4. **Fallback formula** otherwise.

Data keeps ordinary hex colors rather than storing CMYK in style fields. The
canvas, SVG and PNG renderers stay unchanged, and PDF export looks colors up
in the swatch table. Each swatch therefore needs a unique hex value, and the
loader should reject duplicates. A `device-cmyk()` style syntax could still
be added later for one-off colors.

### Fallback formula

The naive formula (`K = 1 - max(R,G,B)`, then C, M and Y relative to
`1 - K`) suits this use better than its reputation suggests:

- It is full gray-component replacement. One of C, M and Y is always 0, so
  every color uses at most three inks.
- Neutrals already come out K only.

Its weaknesses: it ignores dot gain, so results print darker and duller than
on screen, and near-black colors can reach about 300% total ink. Add a
total-ink limit (newsprint is typically about 240%) that pulls C, M and Y
down. This formula is a safety net. Approved colors belong in the swatch
table.

### Profile conversion

The desk's profile may not be redistributable, so mapshaper should not
depend on shipping it:

- **User-supplied profile** (for example `cmyk-profile=nyt.icc`), converted
  with LittleCMS compiled to WASM. Candidates: `lcms-wasm` (MIT, about
  580 KB unpacked) and `@kittl/little-cms` (MIT, about 410 KB). Load it only
  when a profile is given.
- **Alternatively, a precomputed lookup table**: a small offline or
  `mapshaper -` utility that turns an `.icc` file into a 17³ table (about
  20 KB) for tetrahedral interpolation. This avoids WASM at export time and
  the table can be committed to a project. Generic redistributable profiles,
  such as the ECI profiles, could ship this way.

Either way, the neutral rule above runs first, so a profile's rich-black
rendering never reaches the PDF. Rendering intent and black generation are
set by the profile, or by the lookup table's generation settings.

## Swatches in the color picker

`gui-color-picker.mjs` already takes rows of preset colors (`presetRows`;
see `grayscaleColorPresets` and `layerColorPresetRows` in
`gui-panel-controls.mjs`). A print palette can become one or more preset
rows:

- **Source.** A palette file in JSON or CSV with fields for name, CMYK, hex
  and an optional spot color name. Load it in the GUI by drag-and-drop or a
  menu item, and on the command line with a `-o` option such as
  `swatches=nyt-print.json`. The GUI could remember the last palette, for
  example in IndexedDB, since `idb-keyval` is already loaded.
- **Tooltip.** Show the swatch name and CMYK values, such as
  "Water — 30/0/5/0".
- **Grays.** Grays are always printer-safe under the neutral rule, so the
  existing grayscale row can stay.

## Warnings for off-palette colors

When exporting CMYK PDF with a palette loaded, list every color that is not
in the palette and not neutral, with the layers and fields that use it (for
example: "3 colors not in print palette: #4daf4a (layer roads, stroke)").
Include hatch pattern colors and label colors. Treat raster layers
separately, with one warning for the layer rather than one per pixel.

In the GUI, the same check could run earlier. The color input could mark
off-palette values and the export dialog could summarize them. That can
come after the export-time warning.

Color changes from rendering effects:

- Opacity: a translucent K-only stroke stays K only, but only if
  transparency blends in DeviceCMYK. This is one more reason to fix
  svg-to-pdfkit's RGB transparency groups, or to write our own renderer.
- Glows and gradient fades are translucent versions of a single color, so
  the same applies.
- Black text should probably also overprint. That is standard newspaper
  practice and avoids white gaps when registration slips. PDFKit needs a
  hand-written ExtGState with `/OP /op /OPM` for this.

## Other print concerns

- **Output intent and PDF/X**: PDFKit supports PDF/A but not PDF/X. The
  OutputIntent and ICC stream would have to be written by hand. Ask the desk
  what their print workflow requires.
- **Raster layers** embedded as PNG stay RGB. CMYK output needs per-pixel
  conversion and an image format PDFKit accepts as CMYK (JPEG), or a raw
  image XObject.
- **Glows** have no vector equivalent. Options: rasterize the glow alone with
  resvg and place it as an image under the shape, approximate it with
  stacked translucent strokes, or drop it with a warning.

## Loading in the web UI

PDFKit's standalone browser build includes fontkit, which the GUI bundle
doesn't have. It is about 675 KB minified, or about 250 KB gzipped. For
comparison, `www/geopackage.js` is about 297 KB gzipped and
`www/mapshaper-gui.js` about 458 KB.

Use the same pattern as GeoPackage, GeoParquet and GeoTIFF:

- A rollup entry `src/mapshaper-gui-pdf.mjs` builds `www/pdf.js` and assigns
  `window.modules.pdfkit` (and `fontkit`).
- `loadPdfLib()` in `gui-import-utils.mjs`, or a new export helper, calls
  `loadScript('pdf.js')` the first time PDF is exported.
- Core code reaches PDFKit through `require('pdfkit')`. The shim in
  `mapshaper-require.mjs` resolves that to `window.modules` in the browser,
  so the export code is shared between the CLI and the GUI.
- If a profile is used, LittleCMS loads the same way, on demand.

## Next steps

- Get the desk's Illustrator color settings: the CMYK profile, rendering
  intent, whether they use PDF/X, and their palette with CMYK values and
  Illustrator's hex values.
- Extend the prototype: the neutral rule, a total-ink limit, `textPath`,
  arrows and fades, gradients, raster images, a font collection face
  (Helvetica.ttc), a variable font.
- Decide between architecture options 1 and 2. The DeviceCMYK transparency
  requirement favors option 2.
- Specify the palette file format.
- Prototype the `www/pdf.js` lazy bundle and check its size.
