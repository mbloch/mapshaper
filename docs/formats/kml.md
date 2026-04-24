---
title: KML and KMZ
description: How Mapshaper reads and writes KML and KMZ files for use with Google Earth and similar tools.
---

# KML and KMZ

KML is Google's XML-based format for geographic data, originally created for Google Earth and now an OGC standard. KMZ is a zipped KML. KML emphasises display (icons, styles, balloons) over attributes, so it's most useful for handing files to viewers like Google Earth, mobile mapping apps and Google My Maps &mdash; as a data interchange format it has weaker attribute typing and schema support than [GeoJSON](/docs/formats/geojson.html) or [Shapefile](/docs/formats/shapefile.html).

**File extensions:** `.kml`, `.kmz` &middot; **Read:** &check; &middot; **Write:** &check; &middot; **Multi-layer:** &check;

### CLI examples

```bash
mapshaper places.kml -info
mapshaper places.kmz -o format=geojson places.geojson
mapshaper provinces.shp -proj wgs84 -o provinces.kml
```

### Format-specific input options

There are no KML-specific `-i` options. Encoding is always UTF-8 per the KML spec.

### Format-specific output options

There are no KML-specific `-o` options.

### Practical notes

- KML stores all attribute values as strings, so numeric attributes are imported as strings.
- KML requires WGS84 coordinates, but Mapshaper does **not** reproject on export &mdash; coordinates are written through as-is. If your dataset is in any other CRS, run `-proj wgs84` first, otherwise the output will not be conformant KML and viewers will misplace the geometry.


## External resources

- [OGC KML standard](https://www.ogc.org/standards/kml/) &mdash; the formal OGC specification.
- [Google KML Reference](https://developers.google.com/kml/documentation/kmlreference) &mdash; the practical element-by-element reference; more readable than the OGC spec.
- [Google KML Tutorial](https://developers.google.com/kml/documentation/kml_tut) &mdash; covers how Google Earth interprets the format.
- KML reading and writing in Mapshaper is delegated to two third-party libraries: [`@tmcw/togeojson`](https://github.com/placemark/togeojson) for parsing KML into GeoJSON on import, and [`@placemarkio/tokml`](https://github.com/placemark/tokml) for serialising GeoJSON back to KML on export.
