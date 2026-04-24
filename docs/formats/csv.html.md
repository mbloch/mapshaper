---
title: CSV and TSV
description: How Mapshaper reads and writes CSV/TSV, including encoding, type hints and large-file handling.
---

# CSV and TSV

Plain-text tabular data. Mapshaper treats CSV/TSV as pure attribute data by default, or as a point layer when longitude and latitude columns are present. Combined with [`-join`](/docs/reference.html.md#-join), CSV is the lowest-friction way to attach external attributes (population, election results, anything keyed on a stable id) to a geometry layer.

**File extensions:** `.csv`, `.tsv` &middot; **Read:** &check; &middot; **Write:** &check; &middot; **Multi-layer:** no

### CLI examples

```bash
mapshaper data.csv -info
mapshaper data.csv -points x=lon y=lat -o points.geojson
mapshaper big.csv csv-fields=id,name,pop -info
mapshaper provinces.shp -drop-table -o stats.csv
mapshaper data.csv -o delimiter=";" out.csv
```

### Format-specific input options

- `encoding=` &mdash; text encoding. Default is UTF-8.
- `string-fields=` &mdash; comma-separated list of fields to import as strings even if their values look numeric. Use `string-fields=*` to import every field as a string. Essential for ZIP codes, FIPS codes and anything else where leading zeros matter.
- `field-types=` &mdash; per-field type hints, e.g. `FIPS:str,population:num`. More flexible alternative to `string-fields=`.
- `csv-skip-lines=` &mdash; skip N lines at the top of the file. Useful for spreadsheet exports with notes above the data.
- `csv-lines=` &mdash; import only the first N data rows.
- `csv-field-names=` &mdash; assign explicit field names. Combine with `csv-skip-lines=1` to override existing headers.
- `csv-fields=` &mdash; import only the named columns. Filtering happens during the read, so this option dramatically reduces peak memory for wide CSVs.
- `csv-filter=` &mdash; a JavaScript expression evaluated per row. Rows that return false are dropped before they ever reach the layer.
- `csv-dedup-fields` &mdash; rename duplicate column headers (otherwise Mapshaper errors out).
- `decimal-comma` &mdash; parse numbers using `1.000,01` European convention instead of `1,000.01`.

### Format-specific output options

- `encoding=` &mdash; text encoding for the output. Default is UTF-8.
- `delimiter=` &mdash; override the field delimiter, e.g. `delimiter="|"`.
- `decimal-comma` &mdash; emit numbers using the European decimal-comma convention.
- `field-order=ascending` &mdash; sort columns alphabetically.

### Practical notes

- The delimiter is auto-detected from the extension (`.csv` &rarr; comma, `.tsv` &rarr; tab). Use `-i format=csv` to force CSV parsing for a differently-named file (e.g. `.txt`).
- When exporting non-point geometry to CSV, Mapshaper writes only the attribute table. Use [`-points`](/docs/reference.html.md#-points) first if you want to export point coordinates as `lon`/`lat` columns.
- BOM-prefixed files (typically from Excel) are handled transparently on read.
- Output has no quoting unless a value contains the delimiter, a quote or a newline.

### Importing identifier-like fields (ZIP, FIPS, phone numbers&hellip;)

This is the single biggest CSV footgun. Mapshaper guesses each column's type from its values, so a column of US ZIP codes like `02134`, `90210`, `10001` looks numeric and gets imported as numbers &mdash; silently stripping leading zeros and breaking any subsequent join. The same applies to FIPS codes, phone numbers, account numbers and any other identifier that happens to contain only digits.

Always declare these columns as strings on import:

```bash
mapshaper -i counties.csv string-fields=GEOID,STATEFP,COUNTYFP -info
mapshaper -i zips.csv string-fields=zipcode -join points key=zipcode,zipcode
```

If you don't trust the schema at all, `string-fields=*` imports every column as a string. You can also be precise with `field-types=`:

```bash
mapshaper -i data.csv field-types=GEOID:str,population:num,year:str -info
```

A symptom of getting this wrong is a join silently dropping all rows because `02134` (string) doesn't match `2134` (number).

### Prefiltering large CSVs

For multi-gigabyte CSVs &mdash; election precinct records, OSM extract attribute tables, parcel data &mdash; it usually isn't viable to load the whole file into memory and then filter. Mapshaper has two options that filter **during** the read, before the data lands in a layer:

- `csv-fields=` &mdash; keep only the named columns. Wide CSVs (hundreds of columns, only a few of interest) shrink dramatically.
- `csv-filter=` &mdash; a JavaScript expression evaluated per row. Rows that return false are skipped.

Example (note that numerical fields have not been converted from strings at this point):

```bash
mapshaper -i big.csv \
  csv-fields=GEOID,name,population,state \
  csv-filter='state == "TX" && population > "10000"' \
  -o cities-tx.csv
```

### In the web app

The same import options work in the [web app](/docs/essentials/web-app.html.md). Tick **with advanced options** in the import dialog and pass any of `string-fields=`, `field-types=`, `encoding=`, `csv-fields=`, `csv-filter=` etc. as you would on the CLI:

```
string-fields=GEOID,STATEFP encoding=utf8
```

For very large CSVs, `csv-fields=` and `csv-filter=` are the most useful options for keeping memory under control. If a file is too big for the browser to load, the [`mapshaper-xl` CLI](/docs/essentials/command-line.html.md) is the fallback.

## External resources

- [RFC 4180: Common Format and MIME Type for CSV](https://datatracker.ietf.org/doc/html/rfc4180) &mdash; the closest thing to a CSV specification, though many real-world files diverge from it.
- [Frictionless CSV Dialect spec](https://specs.frictionlessdata.io/csv-dialect/) &mdash; a practical schema for declaring how a particular CSV file is formatted (delimiter, quoting, line terminator).
