---
title: JSON records
description: How Mapshaper reads and writes plain JSON arrays of objects (no geometry), useful for tabular data exchange.
---

# JSON records

A JSON-records file is a plain JSON array of objects, one per record, with no geometry.

**File extension:** `.json` &middot; **Read:** &check; &middot; **Write:** &check; &middot; **Geometry:** none

A JSON-records file looks like this:

```json
[
  { "id": 1, "name": "Alice", "city": "Toronto" },
  { "id": 2, "name": "Bob",   "city": "Vancouver" }
]
```

### Format-specific input options

- `json-path=` &mdash; for files where the array is nested inside a larger object, e.g. `json-path=data/records` for `{"data": {"records": [...]}}`.

### Format-specific output options

- `ndjson` &mdash; emit newline-delimited JSON instead of an array. One record per line. Often easier to process with line-oriented tools.

### Practical notes

- When exporting non-tabular layers as JSON records, the geometry is dropped &mdash; you get just the attribute table as JSON.

## External resources

- [JSON Lines (jsonlines.org)](https://jsonlines.org/) &mdash; the spec for the newline-delimited JSON variant emitted by Mapshaper's `ndjson` option.
