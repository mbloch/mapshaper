---
title: DBF
description: How Mapshaper reads and writes standalone DBF files, the tabular component of Shapefile.
---

# DBF

DBF is the dBase database format. It's best known as the attribute-table half of a Shapefile, but Mapshaper can also import a `.dbf` on its own as a tabular layer with no geometry. [CSV](/docs/formats/csv.html.md) is generally preferred as an exchange format for tabular data.

**File extension:** `.dbf` &middot; **Read:** &check; &middot; **Write:** &check; &middot; **Geometry:** none

### CLI examples

```bash
mapshaper provinces.dbf -info
mapshaper provinces.dbf -filter '"BC,AB,SK".indexOf(prov) > -1' -o subset.csv
mapshaper data.csv -o data.dbf
```

### Format-specific input options

- `encoding=` &mdash; text encoding. If omitted, Mapshaper auto-detects, falling back to a `.cpg` sidecar file if present. Run `mapshaper -encodings` for the list of supported encodings.

### Format-specific output options

- `encoding=` &mdash; output text encoding. Default UTF-8 (with a matching `.cpg` sidecar).
- `field-order=ascending` &mdash; sort columns alphabetically.

### Practical notes

- DBF holds tabular data only &mdash; no geometry.
- DBF files do not declare their text encoding internally. Mapshaper auto-detects against UTF-8, Windows-1252 and a few other common encodings. See the [Shapefile encoding notes](/docs/formats/shapefile.html.md#dbf-text-encoding) for the full picture.
- Field names are limited to 10 ASCII characters. Longer names are truncated on write; duplicate truncated names are disambiguated with numeric suffixes.
- Field values are limited to 254 characters; longer strings will have been truncated when the file was written.

## External resources

- [Wikipedia: .dbf](https://en.wikipedia.org/wiki/.dbf) &mdash; useful overview of the format's history and dialects.
- [Xbase File Format Description](https://www.clicketyclick.dk/databases/xbase/format/) &mdash; Erik Bachmann's reference for the dBase / xBase family. The standard external citation for byte-level DBF details.
