---
title: Shapefile
description: How Mapshaper reads and writes ESRI Shapefiles, including encoding and field-name notes.
---

# Shapefile

Shapefile is ESRI's long-standing vector format and remains widely used as an exchange format in desktop GIS workflows. Rather than a single file, a Shapefile is a collection of files — at minimum .shp, .shx, and .dbf, plus commonly .prj (coordinate reference system) and .cpg (character encoding). It has well-known limitations, including a 2 GB size cap per component file, attribute field names limited to 10 characters, attribute values limited to 254 characters, no support for mixed geometry types, and unreliable character encoding declaration. Newer formats like [GeoPackage](/docs/formats/geopackage.html) and [FlatGeobuf](/docs/formats/flatgeobuf.html) solve most of the limitations.

**File extensions:** `.shp` (geometry), `.dbf` (attributes), `.shx` (index), `.prj` (projection), `.cpg` (encoding hint)
&middot; **Read:** &check; &middot; **Write:** &check; &middot; **Multi-layer:** no

### CLI examples

```bash
mapshaper provinces.shp -info
mapshaper provinces.shp -simplify 20% -o provinces.geojson
mapshaper input.geojson -o provinces.shp
```

### Format-specific input options

- `encoding=` &mdash; encoding used by the `.dbf` text fields. If omitted, Mapshaper auto-detects, falling back to the value declared in a `.cpg` file when present. Common values: `latin1`, `utf8`, `gb18030`. Run `mapshaper -encodings` for the full list.

### Format-specific output options

- `encoding=` &mdash; text encoding for the `.dbf`. Defaults to UTF-8 (with a matching `.cpg` sidecar).
- `field-order=ascending` &mdash; sort attribute fields alphabetically (case-insensitive).

### Practical notes

- A Shapefile dataset is a bundle of files sharing a base name. The Mapshaper CLI inputs the `.shp` and picks up any sibling `.dbf`, `.shx`, `.prj` and `.cpg` files automatically. In the [web app](/docs/essentials/web-app.html) you select or drag-drop them together &mdash; see [In the web app](#in-the-web-app) below.
- Field names longer than 10 characters are silently truncated on write, which can produce duplicates. Mapshaper disambiguates by appending digits, or you can rename fields beforehand with [`-rename-fields`](/docs/reference.html#-rename-fields).
- Field values longer than 254 characters are truncated on write.
- Mapshaper does not fully support M (measured) and Z (3D) Shapefiles &mdash; M and Z values are dropped on import.
- When exporting, the Mapshaper CLI produces separate companion files (`.shp`, `.shx`, `.dbf`, `.prj`). In the web app, the component files get bundled in a `.zip` file.
- If the `.prj` file is missing, Mapshaper reads the geometry without coordinate-reference information. Coordinates in the lat-long range are assumed to be WGS-84. You can use the `-proj` command to assign a CRS (e.g. `-proj init=...`).
- A standalone `.dbf` can be imported on its own as a tabular layer &mdash; see the [DBF page](/docs/formats/dbf.html).

### In the web app

Browsers can't read files from the filesystem the CLI can, so you have to supply all the parts of a Shapefile together. Two options are:

1. **Select all the components together.** Click **Add files** and shift- or cmd-click the `.shp`, `.dbf`, `.prj` (and `.shx`/`.cpg` if present) in one go, or drag the whole selection onto the import area.
2. **Drop a `.zip` containing the bundle.** Shapefiles are very commonly distributed this way.

If the import warns about an unknown text encoding, re-import with the **with advanced options** checkbox ticked and pass `encoding=` (e.g. `encoding=win1252`, `encoding=gb18030`). The same `encoding=` values that work on the CLI work here.

### Reading a Shapefile with missing sidecars

Mapshaper will read a `.shp` whose `.dbf` and/or `.shx` companion files are missing &mdash; useful when you're handed an incomplete bundle, or when you only care about geometry:

- **Missing `.dbf`**: the geometry is imported with no attribute table.
- **Missing `.shx`**: Mapshaper recovers feature offsets by reading the `.shp` directly. This works for normal Shapefiles with densely-packed records; it only fails on the rare Shapefiles that contain out-of-order records, where the `.shx` is needed to locate each feature.

### `.dbf` text encoding

The .dbf format is a legacy binary format dating to dBASE III in the early 1980s, predating Unicode. Character encoding is not declared within the file itself, which can cause encoding errors when working with Shapefiles containing non-ASCII characters. In practice, most Shapefiles now come with a `.cpg` file or use UTF-8, which is almost always auto-detected correctly.

Mapshaper handles encoding in the following order:

1. If `encoding=` is set on `-i`, that wins.
2. If a `.cpg` sidecar file is present, Mapshaper uses the encoding it names.
3. Otherwise Mapshaper tries to auto-detect the encoding from the `.dbf` contents.

Auto-detection covers most public datasets, but it can guess wrong on sparsely-populated columns or unusual codepages. If you see mojibake (`Ã©` instead of `é`, `?` characters where accented letters should be), set `encoding=` explicitly:

```bash
mapshaper -i provinces.shp encoding=utf8 -info
mapshaper -i historical.shp encoding=win1252 -o cleaned.geojson
mapshaper -i china.shp encoding=gb18030 -o cleaned.geojson
```

When writing, Mapshaper emits UTF-8 plus a `.cpg` sidecar by default so other tools can decode correctly. Override with `encoding=` on `-o` if a downstream consumer requires a specific codepage.

## External resources

- [Shapefile file extensions (ArcMap docs)](https://desktop.arcgis.com/en/arcmap/latest/manage-data/shapefiles/shapefile-file-extensions.htm) &mdash; ESRI's own practical reference describing what each `.shp`/`.shx`/`.dbf`/`.prj`/`.cpg`/`.sbn` etc. file actually contains. Useful when you encounter unfamiliar sidecar files.
- [Switch from Shapefile](https://switchfromshapefile.org/) &mdash; a long-running campaign cataloguing the format's well-known limitations and pointing to alternatives.
- [ESRI Shapefile Technical Description (PDF)](https://www.esri.com/content/dam/esrisites/sitecore-archive/Files/Pdfs/library/whitepapers/pdfs/shapefile.pdf) &mdash; the original 1998 white paper that defines the format. Dry but authoritative.

## See also

- [DBF format](/docs/formats/dbf.html)
