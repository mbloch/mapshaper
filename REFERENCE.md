# COMMAND REFERENCE

This documentation applies to version 0.6.57 of mapshaper's command line program. Run `mapshaper -v` to check your version. For an introduction to the command line tool, read [this page](https://github.com/mbloch/mapshaper/wiki/Introduction-to-the-Command-Line-Tool) first.

## Command line syntax

Mapshaper takes a list of commands and runs them in sequence, from left to right. A command consists of the name of a command prefixed by a hyphen, followed by options for the command. The initial import command `-i` can be omitted.

#### Example

```bash
# Read a Shapefile, simplify using Douglas-Peucker, output as GeoJSON.
mapshaper provinces.shp -simplify dp 20% -o precision=0.00001 output.geojson
```

### Command options can take three forms:

  - Values, like `provinces.shp` and `output.geojson` in the above example

  - Flags, like `dp`

  - Name/value pairs, like `precision=0.00001`

### Common options

The following options are documented here, because they are used by many commands.

`name=` Rename the layer (or layers) modified by a command.

`target=` Specify the layer or layers targeted by a command. Takes the name of a layer, the number of a layer (first layer is 1), or a comma-separated list of layer names or numbers. Names may contain the `*` wildcard.

`+` Use the output of a command to create a new layer or layers instead of replacing the target layer(s). Use together with the `name=` option to assign a name to the new layer(s).

#### Example
```bash
# Make a derived layer containing a subset of features while retaining the original layer
mapshaper states.geojson -filter 'ST == "AK"' + name=alaska -o output/ target=*
```

## Index of commands

**File I/O**

[-i (input)](#-i-input)
[-o (output)](#-o-output)

**Editing**

[-affine](#-affine)
[-classify](#-classify)
[-clean](#-clean)
[-clip](#-clip)
[-colorizer](#-colorizer)
[-dashlines](#-dashlines)
[-dissolve](#-dissolve)
[-dissolve2](#-dissolve2)
[-divide](#-divide)
[-dots](#-dots)
[-drop](#-drop)
[-each](#-each)
[-erase](#-erase)
[-explode](#-explode)
[-filter](#-filter)
[-filter-fields](#-filter-fields)
[-filter-islands](#-filter-islands)
[-filter-slivers](#-filter-slivers)
[-graticule](#-graticule)
[-grid](#-grid)
[-include](#-include)
[-inlay](#-inlay)
[-innerlines](#-innerlines)
[-join](#-join)
[-lines](#-lines)
[-merge-layers](#-merge-layers)
[-mosaic](#-mosaic)
[-point-grid](#-point-grid)
[-points](#-points)
[-polygons](#-polygons)
[-proj](#-proj)
[-rectangle](#-rectangle)
[-rectangles](#-rectangles)
[-rename-fields](#-rename-fields)
[-rename-layers](#-rename-layers)
[-require](#-require)
[-run](#-run)
[-shape](#-shape)
[-simplify](#-simplify)
[-snap](#-snap)
[-sort](#-sort)
[-split](#-split)
[-split-on-grid](#-split-on-grid)
[-subdivide](#-subdivide)
[-style](#-style)
[-symbols](#-symbols)
[-union](#-union)
[-uniq](#-uniq)

**Control Flow**

[-if](#-if)
[-elif](#-elif)
[-else](#-else)
[-endif](#-endif)
[-stop](#-stop)
[-target](#-target)

**Information**

[-calc](#-calc)
[-colors](#-colors)
[-comment](#-comment)
[-encodings](#-encodings)
[-help](#-help)
[-info](#-info)
[-inspect](#-inspect)
[-print](#-print)
[-projections](#-projections)
[-quiet](#-quiet)
[-verbose](#-verbose)
[-version](#-version)


## I/O Commands

### -i (input)

Input one or more files in Shapefile, JSON, DBF or delimited text format.

The `-i` command is assumed if `mapshaper` is followed by an input filename.

JSON files can be GeoJSON, TopoJSON, or an array of data records.

Each named geometry object of a TopoJSON input file is imported as a separate layer.

Mapshaper does not fully support M and Z type Shapefiles. The M and Z data is lost when these files are imported.

By default, multiple input files are processed separately, as if running mapshaper multiple times with the same set of commands. `combine-files` and `merge-files` change this behavior.

**Options**

`<files>` or `files=`  File(s) to input (space-separated list). Use `-` to import TopoJSON or GeoJSON from `/dev/stdin`. Literal JSON data can also be used instead of a file name.

`combine-files` Import multiple files to separate layers with shared topology. Useful for generating a single TopoJSON file containing multiple geometry objects.

`merge-files` (Deprecated) Merge features from multiple input files into as few layers as possible. Preferred method: import files to separate layers using `-i combine-files`, then use the `-merge-layers` command to merge layers. 

`snap`     Snap together vertices within a small distance threshold. This option is intended to fix minor coordinate misalignments in adjacent polygons. The snapping distance is 0.0025 of the average segment length.

`snap-interval=`    Specify snapping distance in source units.

`precision=`     (Deprecated) Round all coordinates to a specified precision, e.g. `0.001`. It is recommended to set coordinate precision on export, using `-o precision=`.

`no-topology`  Skip topology identification to speed up processing of large files. For use with commands like `-filter` that don't require topology.

`encoding=`	Specify encoding used for reading .dbf files and delimited text files. If the `encoding` option is missing, mapshaper will try to detect the encoding of .dbf files. Dbf encoding can also be set using a .cpg file.

`id-field=` (Topo/GeoJSON) Import values of "id" property to this data field.

`string-fields=` (CSV) List of fields to import as strings (e.g. FIPS,ZIPCODE). Using `string-fields=*` imports all fields as strings.

`field-types=` Type hints for importing delimited text. Takes a comma-separated list of field names with type hints appended; e.g. `FIPS:str,zipcode:str`. Recognized type hints include `:str` or `:string`, `:num` or `:number`. Without a type hint, fields containing text data that looks like numeric data, like ZIP Codes, will be converted to numbers.

`csv-skip-lines=` Number of lines to skip at the beginning of a CSV file. Useful when a CSV has been exported from a spreadsheet and there are rows of notes above the data section of the worksheet.

`csv-lines=` Number of data records to import from a CSV file (default is all).

`csv-field-names=` Comma-sep. list of names to assign each field. Can be used in conjunction with `csv-skip-lines=1` to replace names from an existing set of field headers.

`csv-fields=` Comma-sep. list of fields to import from a CSV-formatted input file. Fields are filtered as the file is read, which reduces the memory needed to import very large CSV files.

`decimal-comma`  Import numbers formatted with decimal commas, not decimal points. Accepted formats: `1.000,01`  `1 000,01` (both imported as as 1000.01).

`csv-dedup-fields` Assign unique names to CSV fields with duplicate names.

`csv-filter=` A JavaScript expression for importing a subset of the records in a CSV file. Records are filtered as the file is read, which reduces the memory needed to import very large CSV files.

`json-path=` [JSON] Path to an array of data records or a GeoJSON object. For example, `json-path=data/counties` expects a JSON object with the following structure `{"data": {"counties": []}}`.

`name=`  Rename the imported layer (or layers).

**Example** 

```bash
# Input a Shapefile with text data in the latin1 encoding and see what kind of data it contains
mapshaper countries_wgs84.shp encoding=latin1 -info
```

### -o (output)

Save content of the target layer(s) to a file or files.

**Options**

`<file>|<directory>|-`  Name of output file or directory. Use `-` to export text-based formats to `/dev/stdout`.

`format=shapefile|geojson|topojson|json|dbf|csv|tsv|svg` Specify output format. If the `format=` option is missing, Mapshaper tries to infer the format from the output filename. If no filename is given, Mapshaper uses the input format. The `json` format is an array of objects containing data properties for each feature.

`target=` Specify layer(s) to export (comma-separated list). The default target is the output layer(s) of the previous command. Use `target=*` to select all layers.

`force`  Allow output files to overwrite input files (without this option, overwriting input files is not allowed).

`gzip`  Apply gzip compression to output files.

`zip`  Save output files in a single .zip archive.

`cut-table`  Detach attribute data from shapes and save as a JSON file.

`drop-table`  Remove attribute data from output.

`precision=`  Round all coordinates to a specified precision, e.g. `precision=0.001`. Useful for reducing the size of GeoJSON files.

`bbox-index`  Export a JSON file containing bounding boxes of each output layer.

`encoding=` (Shapefile/CSV) Encoding of input text (by default, Shapefile encoding is auto-detected and CSV files are assumed to be UTF-8).

`field-order=` (Shapefile/CSV) `field-order=ascending` sorts data fields in alphabetical order of field names (A-Z, case-insensitive).

`id-field=`  (Topo/GeoJSON/SVG) Specify one or more data fields to use as the "id" property of GeoJSON, TopoJSON or SVG features (comma-separated list). When exporting multiple layers, you can pass a list of field names. The first listed name that is present in a layer's attribute table will be used as the id field for that layer.

`bbox`  (Topo/GeoJSON) Add bbox property to the top-level object.

`extension=`  (Topo/GeoJSON) set file extension (default is ".json").

`prettify`  (Topo/GeoJSON) Format output for readability.

`singles`  (TopoJSON) Save each output layer as a separate file. Each output file and the TopoJSON object that it contains are named after the corresponding data layer. 

`quantization=`     (TopoJSON) Specify quantization as the maximum number of differentiable points along either dimension. Equivalent to the quantization parameter used by the [topoquantize](https://github.com/topojson/topojson-client#topoquantize) command line program. By default, mapshaper applies quantization equivalent to 0.02 of the average segment length.

`no-quantization`  (TopoJSON) Arc coordinates are encoded at full precision and without delta-encoding.

`presimplify` (TopoJSON) Add a threshold value to each arc vertex in the z position (i.e. [x, y, z]). Useful for dynamically simplifying paths using vertex filtering. Given W as the width of the map viewport in pixels, S as the ratio of content width to viewport width, and pz as the presimplify value of a point, the following expression tests if the point should be excluded from the output path: `pz > 0 && pz < 10000 / (W * S)`.

`topojson-precision=`	(TopoJSON) Set quantization as a fraction of the average segment length.

`ndjson`  (GeoJSON/JSON) Output newline-delimited records.

`gj2008`  (GeoJSON) Generate output that is consistent with the pre-RFC 7946 GeoJSON spec (dating to 2008). Polygon rings are CW and holes are CCW, which is the opposite of the default RFC 7946-compatible output. Mapshaper's default GeoJSON output is now compatible with the current specification (RFC 7946).

`combine-layers`  (GeoJSON) Combine multiple output layers into a single GeoJSON file.

`geojson-type=`   (GeoJSON) Overrides the default output type. Possible values: "FeatureCollection", "GeometryCollection", "Feature" (for a single feature).

`hoist=`  (GeoJSON) Move one or more properties to the root level of each Feature. Hoisting a field named "id" creates an id for each Feature. This option can also be used to create non-standard Feature attributes (as used by the tippecanoe program).

`width=`    (SVG/TopoJSON) Set the width of the output dataset in pixels. When used with TopoJSON output, this option switches the output coordinates from geographic units to pixels and flips the Y axis. SVG output is always in pixels (default SVG width is 800).

`height=`    (SVG/TopoJSON) Similar to the `width` option. If both `height` and `width` are set, content is centered inside the `[0, 0, width, height]` bounding box.

`max-height=` (SVG/TopoJSON) Limit output height (units: pixels).

`margin=`   (SVG/TopoJSON) Set the margin between coordinate data and the edge of the viewport (default is 1). To assign different margins to each side, pass a list of values in the order `<left,bottom,right,top>` (similar to the `bbox=` option found in other commands).

`pixels=`  (SVG/TopoJSON) Output area in pixels (alternative to width=).

`id-prefix=` Prefix for namespacing layer and feature ids.

`svg-data=` (SVG) Export a comma-seperated list of data fields as SVG data-* attributes. Attribute names should match the following regex pattern: `/^[a-z_][a-z0-9_-]*$/`. Non-conforming fields are skipped.

`svg-scale=`   (SVG) Scale SVG output using geographical units per pixel (an alternative to the `width=` option).

`svg-bbox=<xmin,ymin,xmax,ymax>` (SVG)  Bounding box of SVG map in projected map units. By default, the extent of SVG output fits the content; this option lets you provide a custom extent. This could be useful when aligning the SVG output with other content layers, such as images or videos.

`point-symbol=square`  (SVG) Use squares instead of circles to symbolize point data.


`delimiter=`  (CSV) Set the field delimiter for CSV/delimited text output; e.g. `delimiter=|`.

`decimal-comma`  (CSV) Export numbers with decimal commas instead of decimal points (common in Europe and elsewhere).

**Example**
```bash
# Convert all the Shapefiles in one directory into GeoJSON files in a different directory.
mapshaper shapefiles/*.shp -o geojson/ format=geojson
```

## Editing Commands


### -affine

Transform coordinates by shifting, scaling and rotating. Not recommended for unprojected datasets.

`shift=`  X,Y shift in source units (e.g. 5000,-5000)

`scale=`  Scale (default is 1)

`rotate=`  Angle of rotation in degrees (default is 0)

`anchor=`  Center of rotation/scaling (default is center of the bounding box of the selected content)

`where=`  Use a JS expression to select a subset of features.

Common options: `target=`

### -classify

Assign colors or data values to each feature using one of several classification methods. Methods for sequential data include `quantile`, `equal-interval`, `hybrid` and `nice` or categorical classification to a data field.

`<field>` or `field=` Name of the data field to classify.

`save-as=`     	Name of a (new or existing) field to receive the output of classification. The default output field for colors is `fill` or `stroke` (depending on geometry type) and `class` for non-color output.

`values=`       List of values to assign to data classes. If the number of values differs from the number of classes given by the (optional) `classes` or `breaks` option, then interpolated values will be calculated. Mapshaper uses d3 for interpolation.

`colors=` Takes a list of CSS colors, the name of a predefined color scheme, or `random`. Run the [-colors](#-colors) command to list all of the built-in color schemes. Similar to the `values=` option, if the number of listed colors is different from the number of requested classes, interpolated colors are calculated.

`non-adjacent`  Assign colors to a polygon layer in a randomish pattern, trying not to assign the same color to adjacent polygons. Mapshaper's algorithm balances performance and quality. Usually it can find a solution with four or five colors. If mapshaper is unable to avoid giving the same color to neighboring polygons, it will print a warning. You can resolve the problem by increasing the number of colors.

`stops=` A pair of comma-separated numbers (0-100) for limiting the output range of a color ramp.


`null-value=`   Value (or color) to use for invalid or missing data.

`classes=`      Number of data classes. This number can also be inferred from the `breaks=` or `values=` options.

`breaks=`       Specify user-defined sequential class breaks (an alternative to automatic classification using `quantile`, `equal-interval`, etc.).

`outer-breaks=`  A pair of comma-separated numbers setting min and max breakpoints to use when computing class breaks. This setting overrides the default behavior, which is to use the min and max values of the data field being classified. This setting can be used to prevent extreme data values (outliers) from affecting equal-interval classification. Also useful for setting outside breakpoints for continuous color ramps (when using the `continuous` option).

`method=`       Classification method. One of: `quantile`, `equal-interval`, `nice`, `hybrid` (sequential data), `categorical`, `non-adjacent` and `indexed`. This parameter is not required if the classification method can be inferred from other options. For example, the `index-field=` parameter implies indexed classification, the `categories=` parameter implies categorical classification.

`quantile`      Use quantile classification. Shortcut for `method=quantile`.

`equal-interval` Use equal interval classification. Shortcut for `method=equal-interval`.

`nice`          Same as `method=nice`. This scheme finds equally spaced, round breakpoints that roughly divide the dataset into equal parts (similar to quantile classification).

`invert`        Reverse the order of colors/values.

`continuous`    Output continuously interpolated values (experimental). Uses linear interpolation between class breaks, which may give poor results with some distributions of data. This option is for creating unclassed/continuous-color maps.

`index-field=`  Use class ids that have been precalculated and assigned to this field. Values should be integers from `0 ... n-1` (where n is the number of classes). `-1` is the null value.

`precision=`    Round data values before classification (e.g. `precision=0.1`).

`categories=`   List of values in the source data field. Using this option triggers categorical classification.

`other=`  Default value for categorical classification. This value is used when the value of the source data field is not present in the list of values given by `categories=`. Defaults to `null-value=` or null.

**Options for generating SVG keys**

`key-style=`         One of: simple, gradient, dataviz

`key-name= `         Name of output SVG file

`key-width=`         Width of key in pixels

`key-font-size=`     Font size of tic labels in pixels

`key-tile-height=`   Height of color tiles in pixels

`key-tic-length=`    Length of tic mark in pixels

`key-label-suffix=`  String to append to each label

`key-last-suffix=`   String to append to the last label


**Examples**

```bash
# Apply a sequential color ramp to a polygon dataset using quantiles.
mapshaper covid_cases.geojson -classify save-as=fill quantile color-scheme=Oranges classes=6 -o out.geojson
```

### -clean

This command attempts to repair various kinds of abnormal geometry that might cause problems when running other mapshaper commands or when using other software.

Features with null geometries are deleted, unless the `allow-empty` flag is used.

Polygon features are cleaned by removing overlaps and filling small gaps between adjacent polygons. Only gaps that are completely enclosed can be filled. Areas that are contained by more than one polygon (overlaps) are assigned to the polygon with the largest area. Similarly, gaps are assigned to the largest-area polygon. This rule may give undesired results and will likely change in the future.

Line features are cleaned by removing self-intersections within the same path. Self-intersecting paths are split at the point of intersection and converted into multiple paths within the same feature. When two separate paths intersect in-between segment endpoints, new vertices are inserted at the point of intersection.

Point features are cleaned by removing duplicate coordinates within the same feature.

`gap-fill-area=`  (polygons) Gaps smaller than this area will be filled; larger gaps will be retained as holes in the polygon mosaic. Example values: 2km2 500m2 0. Defaults to a  dynamic value calculated from the geometry of the dataset.

`sliver-control=` (polygons) Preferentially remove slivers (polygons with a high perimeter-area ratio). Accepts values from 0-1, default is 1. Implementation: multiplies the area of gap areas by the "Polsby Popper" compactness metric before applying area threshold.

`overlap-rule=` (polygons) Assign overlapping polygon areas to one of the overlapping features based on this rule. Possible options are: min-id, max-id, min-area, max-area (default is max-area).

`allow-overlaps` Allow features to overlap each other. The default behavior is to remove overlaps.

`snap-interval=` Snap vertices within a given threshold before performing other kinds of geometry repair. Defaults to a very small threshold. Uses source units.

`rewind` Fix errors in the winding order of polygon rings.

`allow-empty`  Allow null geometries, which are removed by default.

Common options: `target=`


### -clip

Remove features or portions of features that fall outside a clipping area.

`<source>` or `source=` Clip to a set of polygon features. Takes the filename or layer id of the clip polygons.

`bbox=<xmin,ymin,xmax,ymax>` Delete features or portions of features that fall outside a bounding box.

`bbox2=` Faster bounding box clipping than `bbox=` (experimental).

`remove-slivers` Remove tiny sliver polygons created by clipping.

Common options: [`name=` `+` `target=`](#common-options)

```bash
# Example: Clip a polygon layer using another polygon layer.
mapshaper usa_counties.shp -clip land-area.shp -o clipped.shp
```

### -colorizer

Define a function for converting data values to colors that can be used in subsequent calls to the `-style` command.

`name=`  Name of the colorizer function.

`colors=`  List of CSS colors.

`random`  Randomly assign colors. Uses `colors=` list if given.

`breaks=`  Ascending-order list of breaks (thresholds) for creating a sequential color scheme.

`categories=`  List of data values (keys) for creating a categorical color scheme.

`other=`  Default color for categorical scheme (defaults to `nodata` color).

`nodata=` Color to use for invalid or missing data (default is white).

`precision=` Rounding precision to apply to numerical data before converting to a color (e.g. 0.1).

```bash
# Example: define a function for a sequential color scheme and assign colors based on data values
mapshaper data.json \
	-colorizer name=getColor colors='#f0f9e8,#bae4bc,#7bccc4,#2b8cbe' breaks=25,50,75 \
	-each 'color = getColor(PCT)' \
	-o output.json

# Example: define a function for a categorical color scheme and use it to assign fill colors
mapshaper data.json \
	-colorizer name=calcFill colors='red,blue,green' categories='Republican,Democrat,Other' \
	-style fill='calcFill(PARTY)' \
	-o output.svg
```

### -dashlines

Split lines into sections, with or without a gap.

`dash-length=`  Length of split-apart lines (e.g. 200km)
`gap-length=`   Length of gaps between dashes (default is 0)
`scaled`        Scale dashes and gaps to prevent partial dashes
`planar`        Use planar geometry
`where=`        Use a JS expression to select a subset of features.

### -dissolve

Aggregate groups of features using a data field, or aggregate all features if no field is given. For polygon layers, `-dissolve` merges adjacent polygons by erasing shared boundaries. For point layers, `-dissolve` replaces a group of points with their centroid. For polyline layers, `-dissolve` tries to merge contiguous polylines into as few polylines as possible.

`<fields>` or `fields=` (optional) Name of a data field or fields to dissolve on. Accepts a comma-separated list of field names.

`group-points`   [points] Group the points from each dissolved group of features into a multi-point feature instead of converting multiple points into a single-point centroid feature.

`weight=`  [points] Name of a field or a JS expression for generating weighted centroids. For example, the following command estimates the "center of mass" of the U.S. population: ` mapshaper census_tracts.shp -points -dissolve weight=POPULATION -o out.shp`

`planar`   [points] Treat decimal degree coordinates as planar cartesian coordinates when calculating dissolve centroids. (By default, mapshaper calculates the centroids of lat-long point data in 3D space.)

`calc=` Use built-in JavaScript functions to create data fields in the dissolved layer. See example below; see [-calc](#-calc) for a list of supported functions.

`sum-fields=` Fields to sum when dissolving (comma-sep. list).
          
`copy-fields=`  Fields to copy when dissolving (comma-sep. list). Copies values from the first feature in each group of dissolved features.

`multipart`  Group features from the target layer into multipart features, without otherwise modifying geometry.

`where=`   Use a JS expression to select a subset of features to dissolve.

Common options: `name=` `+` `target=`

```bash
# Example: Aggregate county polygons to states
mapshaper counties.shp -dissolve STATE -o states.shp

# Example: Use the calc= option to count the number of dissolved features and perform other calculations
mapshaper counties.shp -dissolve STATE calc='n = count(), total_pop = sum(POP), max_pop = max(POP), min_pop = min(POP)'
```


### -dissolve2

Similar to `-dissolve`, but able to handle polygon datasets containing overlaps and gaps between adjacent polygons.

`gap-fill-area=`  (polygons) Gaps smaller than this area will be filled; larger gaps will be retained as holes in the polygon mosaic. Example values: 2km2 500m2 0. Defaults to a dynamic value calculated from the geometry of the dataset.

`sliver-control=` (polygons) Preferentially remove slivers (polygons with a high perimeter-area ratio). Accepts values from 0-1, default is 1. Implementation: multiplies the area of gap areas by the "Polsby Popper" compactness metric before applying area threshold.

`allow-overlaps` Allow dissolved groups of features to overlap each other. The default behavior is to remove overlaps.

Other options: `<fields>` `calc=` `sum-fields=` `copy-fields=` `name=` `+` `target=`

### -divide

Divide a polyline layer by a polygon layer. Line features that cross polygon boundaries are divided into separate features. Data fields from the polygon layer are copied to the line layer, as in the `-join` command.

`<file|layer>` or `source=` File or layer containing polygon features.

`fields=`  A comma-separated list of fields to copy from the polygon layer (see `-join` command).

`calc=` Use JS assignments and built-in functions to convert values from the polygon layer to (new) fields the target table (see `-join` command).

Other options: `target=`

### -dots

Fill polygons with random points, for making dot density maps. This command should be applied to projected layers.

`<fields>` or `fields=`  List of one or more data fields containing data for the number of dots to place in each polygon.

`colors=`	List of dot colors (one color for each field  in the `fields=` parameter). Dots of different colors are placed in random sequence, so dots of one color do not consistently cover up dots of other colors in the densest areas.

`values=` List of values to assign to dots (alternative to `colors=`).

`save-as=`  Name of a (new or existing) field to receive the assigned colors or values. (By default, colors are assigned to the `fill` field.)

`r=`	Dot radius in pixels.

`evenness=`	A value from 0-1. 0 corresponds to purely random placement, 1 maintains (fairly) even spacing between the dots within each polygon. The default is 1.

`per-dot=` A number for scaling data values. For example, use `per-dot=100` to make a map that displays one dot per 100 people (or whatever entity is being visualized).

`copy-fields=` List of fields to copy from the original polygon layer to each dot feature.

`multipart` Combine groups of same-color dots into multi-part features.

Other options: `name=` `+` `target=`


### -drop

Delete the target layer(s) or elements within the target layer(s).

`fields=`  Delete a (comma-separated) list of attribute data fields. To delete all fields, use `fields=*`.

`geometry`  Delete all geometry.

`holes`  Delete any holes from a polygon layer.

`target=`  Layer(s) to target.


### -each

Apply a JavaScript expression to each feature in a layer. Data properties are available as local variables. Additional feature-level properties are available as read-only properties of the `this` object.

**Tip:** Enclose JS expressions in single quotes when using the bash shell (Mac and Linux) to avoid shell expansion of "!" and other special characters. Using the Windows command interpreter, enclose JS expressions in double quotes.

`<expression>` or `expression=`  JavaScript expression to apply to each feature.

`where=`  Secondary boolean JS expression for targetting a subset of features.

`target=`  Layer to target.


**Utility functions**
Several utility functions are available within expressions.

- `format_dms(coord [, fmt])` Format a latitude or longitude coordinate as a DMS string (degrees, minutes, seconds). The optional second argument lets you specify a custom format. Example format strings:
  - `[+-]DDDMM.MMMMM`
  - `DdMmSs [EW]`
  - `DD° MM′ SS.SSSSS″ [NS]`
  - `[-]DD.DDDDD°`
- `parse_dms(string [, fmt])` Parse a DMS string to a numerical coordinate. The optional second argument gives the format to use for parsing. Example (given DMS-formatted fields `latDMS` and `lonDMS`): `-each 'lat = parse_dms(latDMS, "DDDMMSS.SSS[NS]"), lon = parse_dms(lonDMS, "DDDMMSS.SSS[EW]")'`.
- `round(number [, decimals])` Optional second argument gives the number of decimals to use.


**Properties of `this`**

The `this` object, available within expressions, has properties relating to the geometry and attribute data of a feature.

*Properties are read-only unless otherwise indicated.*

All layer types
- `this.id` Numerical id of the feature (0-based)
- `this.layer_name` Name of the layer, or `""` if layer is unnamed.
- `this.properties`  Data properties (also available as local variables) (read/write)
- `this.layer`   Object with "name" and "data" properties
- `this.geojson` (getter) Returns each feature as a GeoJSON Feature object.
- `this.geojson=` (setter) Update target layer with GeoJSON.

Point layers
- `this.coordinates` An array of [x, y] coordinates with one or more members, or null (read/write)
- `this.x`  X-coordinate of point, or `null` if geometry is empty. Refers to the first point of multi-point features. (read/write)
- `this.y`  Y-coordinate of point or `null`. (read/write)

Polygon layers
- `this.area` Area of polygon feature, after any simplification is applied. For lat-long datasets, returns area on a sphere in units of square meters.
- `this.planarArea` Calculates the planar area of lat-long datasets, as though latitude and longitude were cartesian coordinates.
- `this.originalArea` Area of polygon feature without simplification
- `this.centroidX` X-coord of centroid
- `this.centroidY` Y-coord of centroid
- `this.innerX` X-coord of an interior point (for anchoring symbols or labels)
- `this.innerY` Y-coord of an interior point
- `this.perimeter` Perimeter of each feature. For lat-long datasets, returns length in meters.

Polyline layers
- `this.length` Length of each polyline feature. For lat-long datasets, returns length in meters.

Polygon, polyline and point layers
- `this.partCount` 1 for single-part features, >1 for multi-part features, 0 for null features
- `this.isNull` True if feature has null geometry
- `this.bounds` Bounding box as array [xmin, ymin, xmax, ymax]
- `this.width` Width of bounding box
- `this.height` Height of bounding box

**Note:** Centroids are calculated for the largest ring of multi-part polygons, and do not account for holes.

**Note:** Most geometric properties are calculated using planar geometry. Exceptions are the areas of unprojected polygons and the lengths of unprojected polylines. These calculations use spherical, not ellipsoidal geometry, so are not as accurate as the equivalent calculations in a GIS application.

**Examples**

```bash
# Create two fields
mapshaper counties.shp -each 'STATE_FIPS=COUNTY_FIPS.substr(0, 2), AREA=this.area' -o out.shp

# Delete two fields
mapshaper states.shp -each 'delete STATE_NAME, delete GEOID' -o out.shp

# Rename a field
mapshaper states.shp -each 'STATE_NAME=NAME, delete NAME' -o out.shp

# Print the value of a field to the console
mapshaper states.shp -each 'console.log(NAME)'

# Assign a new data record to each feature
mapshaper states.shp -each 'this.properties = {FID: this.id}' -o out.shp
```


### -erase

Remove features or portions of features that fall inside an area.

`<source>` or `source=` File or layer containing erase polygons. Takes the filename or layer id of the erase polygons.

`bbox=<xmin,ymin,xmax,ymax>` Delete features or portions of features that fall inside a bounding box. Similar to `-clip bbox=`.

`bbox2=` Faster bounding box erasing than `bbox=` (experimental).

`remove-slivers` Remove tiny sliver polygons created by erasing.

Common options: [`name=` `+` `target=`](#common-options)

```bash
# Example: Erase a polygon layer using another polygon layer.
mapshaper usa_counties.shp -erase lakes.shp -o out.shp
```


### -explode

Divide each multi-part feature into several single-part features.

Common options: `target=`


### -filter

Apply a boolean JavaScript expression to each feature, removing features that evaluate to false.

`<expression>` or `expression=`  JS expression evaluating to `true` or `false`. Uses the same execution context as [`-each`](#-each).

`bbox=` Retains features that intersect the given bounding box (xmin,ymin,xmax,ymax).

`invert`  Invert the filter -- retain only those features that would have been deleted.

`remove-empty` Delete features with null geometry. May be used by itself or in combination with an `<expression>`.

Common options: [`name=` `+` `target=` ](#common-options)

```bash
# Example: Select counties from New England states
mapshaper usa_counties.shp -filter '"ME,VT,NH,MA,CT,RI".indexOf(STATE) > -1' -o ne_counties.shp
```


### -filter-fields

Delete fields in an attribute table, by listing the fields to retain. If no files are given, then all attributes are removed.

`<fields>` or `fields=`   Comma-separated list of data fields to retain.

`invert`  Invert the filter -- delete the listed fields instead of retaining them.

Common options: `target=`

```bash
# Example: Retain two fields
mapshaper states.shp -filter-fields FID,NAME -o out.shp
```

### -filter-islands

Remove small detached polygon rings (islands).

`min-area=` Remove small-area islands using an area threshold (e.g. 10km2).

`min-vertices=` Remove low-vertex-count islands.

`remove-empty` Delete features with null geometry.

[`target=`](#common-options)


### -filter-slivers

Remove small polygon rings.

`min-area=` Area threshold for removal (e.g. 10km2).

`sliver-control=` (polygons) Preferentially remove slivers (polygons with a high perimeter-area ratio). Accepts values from 0-1, default is 1. Implementation: multiplies the area of polygon rings by the "Polsby Popper" compactness metric before applying area threshold.

`remove-empty` Delete features with null geometry.

[`target=`](#common-options)


### -graticule

Create a graticule layer appropriate for a world map centered on longitude 0.

`polygon` Create an polygon enclosing the entire area of the graticule. Useful for creating background or outline shapes for clipped projections, like Robinson or Stereographic.

`interval=` Specify the spacing of graticule lines (in degrees). Options include:  5, 10, 15, 30, 45. Default is 10.

### -grid

Create a continuous grid of square or hexagonal polygons.

The `-grid` command should have a projected layer as its target. The cells of the grid will completely enclose the bounding box of the target layer.

This command is intended for visualizing data in a grid. Typically, you would use the `-join` command to join data from a polygon or point layer to a grid layer. Use `-join interpolate=<fields>` to interpolate data values (typically count data) from the polygon layer to the grid layer based on area. Use `-join calc='<field> = sum(<field>)'` or `-join calc='<field> = count()'` to aggregate point data values.

`type=`  Supported values: `square` `hex` `hex2`. The `hex` and `hex2` types have different rotations.

`interval=` The length of one side of a grid cell. Example values: `500m` `2km`.

Other options: `name=` `+` `target=`


### -include

`<file>` or `file=` Path to the external .js file to load. The file should contain a single JS object. The properties of this object are converted to variables in the JS expression used by the `-each` command.

### -inlay

Inscribe a polygon layer within another polygon layer.

`<source>` or `source=`  File or layer containing polygons to inlay

Other options: `target=`

### -innerlines

Create a polyline layer consisting of shared boundaries with no attribute data.

`where=`   Filter lines using a JS expression (see the `-lines where=` option).

Other options: `name=` `+` `target=`

```bash
# Example: Extract the boundary between two states.
mapshaper states.shp -filter 'STATE=="OR" || STATE=="WA"' -innerlines -o out.shp
```


### -join

Join attribute data from a source layer or file to a target layer. If the `keys=` option is used, Mapshaper will join records by matching the values of key fields. If the `keys=` option is missing, Mapshaper will perform a polygon-to-polygon, point-to-polygon, polygon-to-point or point-to-point spatial join.

`<file|layer>` or `source=` File or layer containing data records to join.

`keys=`  Names of two fields to use as join keys, separated by a comma. The key field from the destination table is followed by the key field from the source table. If the `keys=` option is missing, mapshaper performs a spatial join.

`calc=` Use JS assignments and built-in functions to convert values from the source table to (new) fields the target table. See the [`-calc` command reference](#-calc) for a list of supported functions. Useful for handling many-to-one joins. See example below.

`where=`  Use a boolean JS expression to filter records from the source table. The expression has the same syntax as the expression used by the `-filter` command. The functions `isMax(<field>)` `isMin(<field>)` and `isMode(<field>)` can be used in many-to-one joins to select among source records.

`fields=`  A comma-separated list of fields to copy from the external table. If the `fields` option and `calc` options are both absent, all fields are copied except the key field (if joining on keys) unless the. Use `fields=*` to copy all fields, including any key field. Use `fields=` (empty list) to copy no fields.

`prefix=` Add a prefix to the names of fields joined from the external attribute table.

`interpolate=`  (polygon-to-polygon joins only) A list of fields to interpolate/reaggregate based on area of overlap. Intended for fields containing count data, such as population counts or vote counts. Treats data as being uniformly distributed within polygon areas.

`point-method` (polygon-to-polygon joins only) Use an alternate method for joining two polygon layers. The default polygon-polygon join method detects areas of overlap between two polygon layers by compositing the two layers internally. This method is simpler -- it generates a temporary point layer from the source layer with the greater number of features (using the same inner-point method as the `-points inner` command), and then performs a point-to-polygon or polygon-to-point join. This method does not support the `interpolate=` option.

`largest-overlap` (polygon-to-polygon joins only) selects a single polygon to join when multiple source polygons overlap a target polygon, based on largest area of overlap.

`max-distance=` (point-to-point joins only) Join source layer points within this distance of a target layer point.

`duplication`  Create duplicate features in the target layer on many-to-one joins.

`sum-fields=` (deprecated) A comma-separated list of fields to sum when several source records match the same target record. This option is equivalent to using the `sum()` function inside a `calc=` expression like this: `calc='FIELD = sum(FIELD)'`.

`string-fields=` A comma-separated list of fields in source CSV file to import as strings (e.g. FIPS,ZIPCODE).

`field-types=` A comma-separated list of type hints (when joining a CSV file or other delimited text file). See `-i field-types=` above.

`force`  Allow values in the target data table to be overwritten by values in the source table when both tables contain identically named fields.

`unjoined`  Copy unjoined records from the source table to a layer named "unjoined".

`unmatched`  Copy unmatched records from the destination table to a layer named "unmatched".

Other options: `encoding=` `target=`

**Examples**

Join a point layer to a polygon layer (spatial join), using the `calc=` option to handle many-to-one matches.

```bash
mapshaper states.shp -join points.shp calc='median_score = median(SCORE), mean_score = average(SCORE), join_count = count()' -o out.shp
```

Copy data from a csv file to the attribute table of a Shapefile by matching values from the *STATE_FIPS* field of the Shapefile and the *FIPS* field of the csv file. (The string-fields=FIPS argument prevents FIPS codes in the CSV file from being converted to numbers.)

```bash
mapshaper states.shp -join demographics.txt keys=STATE_FIPS,FIPS string-fields=FIPS -o out.shp
```

### -lines

Converts points and polygons to lines. Polygons are converted to topological boundaries. Without the `<fields>` argument, external (unshared) polygon boundaries are attributed as `TYPE: "outer", RANK: 0` and internal (shared) boundaries are `TYPE: "inner", RANK: 1`. 

`<fields>` or `fields=` (Optional) comma-separated list of attribute fields for creating a hierarchy of polygon boundaries. A single field name adds an intermediate level of hierarchy with attributes: `TYPE: <field name>, RANK: 1`, and the lowest-level internal boundaries are given attributes `TYPE: "outer", RANK: 2`. A comma-separated list of fields adds additional levels of hierarchy.

`where=`  Use a JS expression for filtering polygon boundaries using properties of adjacent polygons. The expression context has objects named A and B, which represent features on eather side of a path. B is null if a path only belongs to a single feature.

`each=`   Apply a JS expression to each line (using A and B, like the `where=` option).

`groupby=`  Convert a point layer into multiple lines, using a field value for grouping.

Common options: `name=` `+` `target=`

```bash
# Example: Classify national, state and county boundaries.
mapshaper counties.shp -lines STATE_FIPS -o boundaries.shp
```

```bash
# Example: add the names of neighboring countries to each section of border
mapshaper countries.geojson \
  -lines each='COUNTRIES = A.NAME + (B ? "," + B.NAME : "")' \
  -o borders.geojson
```


### -merge-layers

Merge features from several layers into a single layer. Layers can only be merged if they have compatible geometry types. Target layers should also have compatible data fields, unless the `force` option is used.

`force`  Allow merging layers with inconsistent fields. When a layer is missing a particular field, the field will be added, with the values set to `undefined`. Using this option, you are still prevented from merging fields with different data types (e.g. a field containing numbers in one layer and strings in another). You are also still prevented from merging layers containing different geometry types.

`flatten` (polygon layers) Remove polygon overlaps by assigning overlapping areas to the last overlapping polygon (the topmost feature if features are rendered in sequence).

Common options: `name=` `target=`

```bash
# Example: Combine features from several Shapefiles into a single Shapefile.
# -i combine-files is used because files are processed separately by default.
mapshaper -i OR.shp WA.shp CA.shp AK.shp combine-files \
	-merge-layers \
	-o pacific_states.shp
```

### -mosaic

Flatten a polygon layer by converting overlapping areas to separate polygons.

`calc=` Use a JavaScript expression to handle many-to-one aggregation (similar to the `calc=` option of the`-join` and `-dissolve` functions). See [-calc](#-calc) for a list of supported functions.

Common options: `name=` `+` `target=`


### -point-grid

Create a rectangular grid of points.

`<cols,rows>`  Size of the grid, e.g. `-point-grid 100,100`.

`interval=`    Distance between adjacent points, in source units (alternative to setting the number of cols and rows).

`bbox=`        Fit the grid to a bounding box (xmin,ymin,xmax,ymax). Defaults to the bounding box of the other data layers, or of the world if no other layers are present.

`name=`        Set the name of the point grid layer

### -points

Create a point layer, either from polygon or polyline geometry or from values in the attribute table. By default, polygon features are replaced by a single point located at the centroid of the polygon ring, or the largest ring of a multipart polygon. By default, polyline features are replaced by a single point located at the polyline vertex that is closest to the center of the feature's bounding box (this can be used to join polylines to polygons using a point-to-polygon spatial join).

`x=` Name of field containing x coordinate values. Common X-coordinate names are auto-detected (e.g. longitude, LON).

`y=` Name of field containing y coordinate values. Common Y-coordinate names are auto-detected (e.g. latitude, LAT).

`centroid` Create points at the centroid of the largest ring of each polygon feature. Point placement is currrently not affected by holes.

`inner` Create points in the interior of the largest ring of each polygon feature. Inner points are located away from polygon boundaries.

`vertices` Convert polygon and polyline features into point features containing the unique vertices in each shape.

`vertices2` Convert all the vertices in polygon and polyline features into points, including duplicate coordinates (e.g. the duplicate endpoint coordinates of polygon rings).

`endpoints` Capture the unique endpoints of polygon and polyline arcs.

`midpoints`  Find the midpoint of each path in a polyline layer.

`interpolated` Interpolate points along polylines. Requires the `interval=` option to be set. Original vertices are replaced by interpolated vertices.

`interval=` Distance between interpolated points (in meters if coordinates are unprojected, or projected units).

Common options: `name=` `+` `target=`

```bash
# Example: Create points in the interior of each polygon 
mapshaper counties.shp -points inner -o points.shp

# Example: Create points in the interior of each polygon (alternate method) 
mapshaper counties.shp -each 'cx=this.innerX, cy=this.innerY' -points x=cx y=cy -o points.shp
```

### -polygons

Convert a polyline layer to a polygon layer by linking together intersecting polylines to form rings.

`gap-tolerance=`  Close gaps ("undershoots") between polylines up to the distance specified by this option.

`from-rings`  Convert a layer of closed polyline rings into polygons. Nested rings in multipart features are converted into holes.

Common options: `target=`

### -proj

Project a dataset using a PROJ string, EPSG code or alias. This command affects all layers in the dataset(s) containing the targeted layer or layers. Information on PROJ string syntax can be found on the (PROJ website)[https://proj.org/usage/index.html#].

`<crs>` or `crs=`  Target CRS, given as a Proj.4 definition or an alias. Use the [`-projections`](#-projections) command to list available projections and aliases.  In projections which require additional parameters, such as a zone in UTM, you can pass a Proj4 string enclosed in quotes.  For example, `crs='+proj=utm +zone=27'`.

`densify` Interpolate vertices along long line segments as needed to approximate curved lines.

`match=` Match the projection of the given layer or .prj file.

`init=` Define the pre-projected coordinate system, if unknown. This option is not needed if the source coordinate system is defined by a .prj file, or if the source CRS is WGS84. As with `crs`, you can pass a Proj4 string enclosed in quotes if the selected projection requires extra parameters, for example `init='+proj=utm +zone=33'`.

`target=` Layer(s) to target. All layers belonging to the same dataset as a targeted layer will be reprojected. To reproject all datasets, use `target=*`.

**Examples**
```bash
# Convert a GeoJSON file to New York Long Island state plane CRS, using a Proj.4 string
mapshaper nyc.json -proj +proj=lcc +lat_1=41.03333333333333 +lat_2=40.66666666666666 \
+lat_0=40.16666666666666 +lon_0=-74 +x_0=300000 +y_0=0 +ellps=GRS80 +datum=NAD83 +units=m \
-o out.json

# Apply the same projection using an EPSG code
mapshaper nyc.json -proj EPSG:2831 -o out.json

# Convert a projected Shapefile to WGS84 coordinates
mapshaper area.shp -proj wgs84 -o out.shp

# Use the Winkel Tripel projection with a custom central meridian
mapshaper countries.shp -proj +proj=wintri +lon_0=10 -o out.shp

# Shortcut notation for the above projection
mapshaper countries.shp -proj wintri +lon_0=10 -o out.shp

# Convert an unprojected U.S. Shapefile into a composite projection with Alaska
# and Hawaii repositioned and rescaled to fit in the lower left corner.
# Show Puerto Rico and the U.S. Virgin Islands
# Override the default central meridian and scale of the Alaska inset
mapshaper us_states.shp -proj albersusa +PR +VI +AK.lon_0=-141 +AK.scale=0.4 -o out.shp
```

### -rectangle

Create a new layer containing a rectangular polygon.

`bbox=<xmin,ymin,xmax,ymax>`  Give the coordinates of the rectangle.

`source=` Create a bounding box around a given layer.

`aspect-ratio=`  Aspect ratio as a number or range (e.g. 2 0.8,1.6 ,2).

`offset=` Padding as a distance or percentage of width/height (single value or list).

`name=` Assign a name to the newly created layer.

### -rectangles

Create a new layer containing a rectangular polygon for each feature in the layer.

`aspect-ratio=`  Aspect ratio as a number or range (e.g. 2 0.8,1.6 ,2).

`offset=` Padding as a distance or percentage of width/height (single value or list).

`name=` Assign a name to the newly created layer.

### -rename-fields

Rename data fields. To rename a field from A to B, use the assignment operator: B=A.

`<fields>` or `fields=`  List of fields to rename as a comma-separated list. 

Common options: `target=`

```bash
# Example: rename STATE_FIPS to FIPS and STATE_NAME to NAME
mapshaper states.shp -rename-fields FIPS=STATE_FIPS,NAME=STATE_NAME -o out.shp
```


### -rename-layers

Assign new names to layers. If fewer names are given than there are layers, the last name in the list is repeated with numbers appended (e.g. layer1, layer2).

`<names>` or `names=`  One or more layer names (comma-separated).

`target=`  Rename a subset of all layers.

```bash
# Example: Create a TopoJSON file with sensible object names.
mapshaper ne_50m_rivers_lake_centerlines.shp ne_50m_land.shp combine-files \
  -rename-layers water,land -o target=* layers.topojson 
```

### -require

Require a Node module or ES module for use in commands like `-each` and `-run`. Modules are added to the expression context. When the `alias=` option is given, modules are accessed via their aliases. Modules that are imported by name (e.g. `-require d3`) are accessed via their name, or by their alias if the `alias=` option is used. Module files without an alias name have their exported functions and data added directly to the expression context.

`<module>` or `module=`  Name of an installed module or path to a module file.

`alias=` Import the module as a custom-named variable.

```bash
# Example: use the underscore module (which has been installed locally)
$ mapshaper data.json \
	-require underscore alias=_ \
	-each 'id = _.uniqueId()' \
	-o data2.json
```

```bash
# Example: import a module file containing a user-defined function 
$ mapshaper data.json \
  -require scripts/includes.mjs \
  -each 'displayname = getDisplayName(d)' \
  -o data2.json
```

### -run

Create mapshaper commands on-the-fly and run them.

`<expression>` or `expression=`  A JS expression or template containing embedded expressions, for generating one or more mapshaper commands.

* Embedded expressions are enclosed in curly braces (see below).
* Expressions can access `target` and `io` objects.
* Expressions can also access functions and data loaded with the `-require` command.
* Functions can be async.

Expression context:

`target` object provides data and information about the command's target layer
- `target.layer_name`  Name of layer
- `target.geojson`  (getter) Returns a GeoJSON FeatureCollection for the layer
- `target.geometry_type` One of: polygon, polyline, point, `undefined`
- `target.feature_count` Number of features in the layer
- `target.null_shape_count` Number of features with null geometry
- `target.null_data_count` Number of features with no attribute data
- `target.bbox` GeoJSON-style bounding box
- `target.proj4` PROJ-formatted string giving the CRS (coordinate reference system) of the layer

`io` object has a method for passing data to the `-i` command.
- `io.ifile(<filename>, <data>)` Create a temp file to use as input in a `-run` command (see example 2 below)

**Example 1:** Apply a custom projection based on the layer extent.

```bash
$ mapshaper -i country.shp -require projection.js -run '-proj {tmerc(target.bbox)}' -o
```

```javascript
// contents of projection.js file
module.exports.tmerc = function(bbox) {
  var lon0 = (bbox[0] + bbox[2]) / 2,
      lat0 = (bbox[1] + bbox[3]) / 2;
  return `+proj=tmerc lat_0=${lat0} lon_0=${lon0}`;
};
```

**Example 2:** Convert points to a Voronoi diagram using a template expression
together with an external script.

```bash
$ mapshaper points.geojson \
  -require script.js \
  -run '-i {io.ifile("voronoi.json", voronoi(target.geojson, target.bbox))}' \
  -o
```

```javascript
// contents of script.js file
module.exports.voronoi = async function(points, bbox) {
  const d3 = await import('d3-delaunay'); // installed locally
  const coords = points.features.map(feat => feat.geometry.coordinates);
  const voronoi = d3.Delaunay.from(coords).voronoi(bbox);
  const features = Array.from(voronoi.cellPolygons()).map(function(ring, i) {
    return {
      type: 'Feature',
      properties: points.features[i].properties,
      geometry: {
        type: 'Polygon',
        coordinates: [ring]
      }
    };
  });
  return {type: 'FeatureCollection', features: features};
};
```


### -shape

Create a new layer containing a single polyline or polygon shape.

`coordinates=<x,y,...>`  Specify vertex coordinates as a comma-separated list.

`offsets=<dx,dy,...>`   Specify vertex coordinates as a list of offsets from the previous vertex. The first vertex in the list is offset from the last coordinate in the `coordinates=` list.

`closed`  Close an open path to form a polygon shape.

`name=` Assign a name to the newly created layer.


### -simplify

Mapshaper supports Douglas-Peucker simplification and two kinds of Visvalingam simplification.

Douglas-Peucker (a.k.a. Ramer-Douglas-Peucker) produces simplified lines that remain within a specified distance of the original line. It is effective for thinning dense vertices but tends to form spikes at high simplification.

Visvalingam simplification iteratively removes the least important point from a polyline. The importance of points is measured using a metric based on the geometry of the triangle formed by each non-endpoint vertex and the two neighboring vertices. The `visvalingam` option uses the "effective area" metric &mdash; points forming smaller-area triangles are removed first.

Mapshaper's default simplification method uses Visvalingam simplification but weights the effective area of each point so that smaller-angle vertices are preferentially removed, resulting in a smoother appearance.

When working with multiple polygon and polyline layers, the `-simplify` command is applied to all of the layers.

**Options**

`<percentage>` or `percentage=`  Percentage of removable points to retain. Accepts values in the range `0%-100%` or `0-1`.

`dp` `rdp`	Use Douglas-Peucker simplification.

`visvalingam`   Use Visvalingam simplification with the "effective area" metric.

`weighted`   Use weighted Visvalingam simplification (this is the default). Points located at the vertex of more acute angles are preferentially removed, for a smoother appearance.

`weighting=`  Coefficient for weighting Visvalingam simplification (default is 0.7). Higher values produce smoother output. `weighting=0` is equivalent to unweighted Visvalingam simplification.

`resolution=`  Use an output resolution (e.g. `1000x800`) to control the amount of simplification.

`interval=`	 Specify simplification amount in units of distance. Uses meters when simplifying unprojected datasets in 3D space (see `planar` option below), otherwise uses the same units as the source data.

`variable`  Apply a variable amount of simplification to the paths in a polygon or polygon layer. This flag changes the `interval=`, `percentage=` and `resolution=` options to accept JavaScript expressions instead of literal values. (See the `-each` command for information on mapshaper JS expressions).

`planar`  By default, mapshaper simplifies decimal degree coordinates in 3D space (using geocentric x,y,z coordinates). The `planar` option treats lng,lat coordinates as x,y coordinates on a Cartesian plane.

`keep-shapes`   Prevent polygon features from disappearing at high simplification. For multipart features, mapshaper preserves the part with the largest original bounding box.

`no-repair`	By default, mapshaper rolls back simplification along pairs of intersecting line segments by re-introducing removed points until either the intersection disappears or there are no more points to add. This option disables intersection repair.

`stats`  Display summary statistics relating to the geometry of simplified paths.

**Examples**
```bash
# Simplify counties.shp using the default algorithm, retaining 10% of removable vertices.
mapshaper counties.shp -simplify 10% -o simplified.shp

# Use Douglas-Peucker simplification with a 100 meter threshold.
mapshaper states.shp -simplify dp interval=100 -o simplified/
```

### -snap

Snap together nearby vertices

`interval` Snap tolerance (default is small).

`endpoints` Only snap endpoints of polyline features.

`precision=`  Tound all coordinates to a given decimal precision (e.g. 0.000001).

[`target=`](#common-options)

### -sort

Sort features in a data layer using a JavaScript expression.

`<expression>` or `expression=`  Apply a JavaScript expression to each feature, using the resulting values for sorting the features. Uses the same execution environment as [`-each`](#-each).

`ascending` Sort in ascending order (this is the default).

`descending` Sort in descending order.

[`target=`](#common-options)


### -split

Distributes features in the target layer to multiple output layers. If the `expression=` option is present, features with the same value are grouped together. The value of the expression is used to name the split-apart fields. If no argument is supplied, split-apart layers are numbered.

`<expression>` or `expression=`  JS expression or name of the attribute field to split on.

Common options: `+` `target=`

**Examples**
```bash
# Split features from a named layer into new GeoJSON files using a data field.
# Output names use the original layer name + data values,
# e.g. states-AK.json, states-AL.json, etc.
mapshaper states.shp -split STATE -o format=geojson

# Split features from an unnamed layer into new GeoJSON files using a data field.
# Output names contain data values,
# e.g. AK.json, AL.json, etc.
mapshaper states.shp name='' -split STATE -o format=geojson

# Split source features into individual GeoJSON files (no data field supplied).
# Output names use source layer name + ascending number,
# e.g. states-1, states-2, etc.
mapshaper states.shp -split -o format=geojson
```

### -split-on-grid

Split features into separate layers using a grid of cols,rows cells. Useful for dividing a large dataset into smaller files that can be loaded dynamically into an interactive map. Use `-o bbox-index` to export a file containing the name and bounding box of the shapes in each file. Empty cells are removed from the output.

`<cols,rows>`  Size of the grid, e.g. `-split-on-grid 12,10`

Common options: `target=` 

### -subdivide

Recursively divide a layer using a boolean JS expression. The expression is first evaluated against all features in the layer. If true, the features are spatially partitioned either vertically or horizontally, according to whether the aggregate bounding box is relatively tall or wide. See example below.

Subdivide expressions can call several functions that operate on a group of features. The `sum()` function takes a feature-level expression as an argument and returns the summed result after applying the expression to each feature in the group. Similar functions include `min()` `max()` `average()` and `median()`.

`<expression>` or `expression=` Boolean JavaScript expression

Common options:  `target=`

**Example**
```bash
# Aggregate census tracts into groups of less than 1,000,000 population and less than 100 sq km in area.
mapshaper tracts.shp
  -subdivide "sum('POPULATION') >= 1000000 && sum('this.area') > 1e8" \
  -dissolve sum-fields=POPULATION \
  -merge-layers \
  -o tract_groups.shp
```

### -style

Add common SVG attributes for SVG export and display in the web UI. Attribute values take either a literal value or a JS expression. See the [`-each`](#-each) command for help with expressions. This command was named `-svg-style` in earlier versions of mapshaper.

`where=`           Boolean JS expression for targetting a subset of features.

`class=`           One or more CSS classes, separated by spaces (e.g. `class="light semi-transparent"`)

`css=`             Inline CSS to use as the `style=` attribute of each SVG symbol.

`fill=`            Fill color (e.g. `#eee` `pink` `rgba(0, 0, 0, 0.2)`)

`fill-pattern=`    Definition string for a pattern. There are four pattern types: hatches, dots, squares and dashes. The syntax for each pattern is:

- hatches [rotation] width1 color1 [width2 color2 ...]
- dots [rotation] size color1 [color2 ...] spacing background-color
- squares [rotation] size color1 [color2 ...] spacing background-color
- dashes [rotation] dash-length space-length line-width color line-spacing background-color

Example: `hatches 45deg 2px red 2px grey`

`fill-effect=sphere`  Add a gradient effect to the bounding circle of a globe projection (e.g. `ortho` `npers`) to create a 3d effect.

`stroke=`          Stroke color

`stroke-width=`    Stroke width

`stroke-dasharray=` Dashes

`opacity=`         Symbol opacity (e.g. `opacity=0.5`)

`r=`               Circle radius. Setting this exports points as SVG `<circle>` symbols, unless the `-o point-symbol=square` option is used.

`label-text=`      Label text (set this to export points as labels). To create multiline labels, insert line delimiters into the label text. There are three possible line delimiters: the newline character, `\n` (backslash + "n"), and `<br>`. (When importing JSON data, `\n` in a JSON string is parsed as a newline and `\\n` is parsed as backslash + "n"). Note that Mapshaper doesn't accept multiline strings as input on the command line.
  
`text-anchor=`     Horizontal justification of label text. Possible values are: start, end or middle (the default).

`dx=`              X offset of labels (default is 0)

`dy=`              Y offset of labels (default is baseline-aligned)
  
`font-size=`       Size of label text (default is 12)
  
`font-family=`     CSS font family of labels (default is sans-serif)

`font-weight=`     CSS font weight property of labels (e.g. bold, 700)

`font-style=`      CSS font style property of labels (e.g. italic)

`letter-spacing=`  CSS letter-spacing property of labels
 
`line-height=`     Line spacing of multi-line labels (default is 1.1em). Lines are separated by newline characters in the label text.

Common options: `target=`

**Example**

```bash
# Apply a 2px grey stroke and no fill to a polygon layer
mapshaper polygons.geojson \
-style fill=none stroke='#aaa' stroke-width=2 \
-o out.svg
```

### -symbols

Symbolize points as regular polygons, circles, stars, arrows and other shapes.

`type=`            Basic types: star, polygon, circle, arrow, ring. Aliases: triangle, square, pentagon, etc.

`fill=`            Symbol fill color

`stroke=`          Symbol line color (linear symbols only)

`stroke-width=`    Symbol line width (linear symbols only)

`opacity=`         Symbol opacity

`geographic`       Make geographic shapes (polygons or polylines) instead of SVG objects

`pixel-scale=`     Set symbol scale in meters-per-pixel (for polygons option)

`rotated`          Symbol is rotated to an alternate orientation

`rotation=`        Rotation of symbol in degrees

`scale=`           Scale symbols by a multiplier

`radius=`          Distance from center to farthest point on the symbol

`sides=`           (polygon) number of sides of a polygon symbol

`points=`          (star) number of points

`point-ratio=`     (star) ratio of minor to major radius of star

`radii=`           (ring) comma-sep. list of concentric radii, ascending order

`length=`          (arrow) length of arrow in pixels

`direction=`       (arrow) angle off of vertical (-90 = left-pointing)

`head-angle=`      (arrow) angle of tip of arrow (default is 40 degrees)

`head-width=`      (arrow) width of arrow head from side to side

`head-length=`     (arrow) length of head (alternative to head-angle). Use `head-length=0` to make headless arrows (i.e. simple lines)

`stem-width=`      (arrow) width of stem at its widest point

`stem-length=`     (arrow) alternative to length

`stem-taper=`      (arrow) factor for tapering the width of the stem (0-1)

`stem-curve=`      (arrow) curvature in degrees (default is 0)

`min-stem-ratio=`  (arrow) minimum ratio of stem to total length. This option scales down the entire symbol instead of making the stem shorter than the given ratio.

`anchor=`          (arrow) takes one of: start, middle, end (default is start)

Common options: `name=` `+` `target=`

### -union

Create a composite layer (a polygon mosaic without overlaps) from two or more target polygon layers.

Data values are copied from source features to output features. (Areal interpolation may
be added in the future. The `-join` command currently supports areal interpolation between polygon layers using the `-join interpolate=<fields>` option.) Same-named fields in source layers are renamed in the output layer. For example, two source-layer fields named "id" will be renamed to "id_1" and "id_2".

`fields=`  Fields to retain (default is all fields).

Common options: `name=` `+` `target=`

### -uniq

Delete features with the same id as a previous feature

`<expression>` or `expression=`  JS expression to obtain the id of a feature. Uses the same expression syntax as [`-each`](#-each).

`max-count=` Allow multiple features with the same id (default is 1).

`invert` Retain only features that would ordinarily be deleted by `-uniq`.

`verbose`  Print information about each removed feature.

`target=`

```bash
# Example: Retain only the largest parts of each multipart polygon
mapshaper polygons.shp \
	-each 'fid = this.id' \
	-explode \
	-sort 'this.area' descending \
	-uniq 'fid' \
	-o out.shp
```

## Control Flow Commands

### -if

The `if` command runs the following commands if a condition is met.

`<expression>` or `expression=`  Use a JavaScript expression to test a condition.

`empty`         Test if layer is empty.

`not-empty`     Test if layer contains data.

`layer=`        Name or id of layer to test (default is current target layer).

**Properties of `this`**

- `this.name`   Layer name, or <undefined> if layer is unnamed.
- `this.size`   Number of features in the layer.
- `this.empty`  True if layer contains 0 features.
- `this.data`   Array of attribute data records, one object per feature.
- `this.type`   Geometry type, one of: polygon, polyline, point, <undefined>.
- `this.bbox`   An array [xmin, ymin, xmax, ymax] with additional properties: cx, cy, height, width, left, bottom, top, right.

**Functions of `this`**

- `this.field_exists(<name>)`  Tests if a data field exists in the target layer.
- `this.field_type(<name>)`    Returns the data type of a field, or `null` if a field is empty or missing. Types include: `"string" "number" "boolean" "date" "object"`. If a field includes multiple data types (which may occur in GeoJSON), the type of the first non-empty data value is returned.
- `this.field_includes(<value>)`  Tests if a given value occurs at least once in a data field.
- `this.file_exists(<filename>)`  Tests if a file exists.

**Example**

```bash
mapshaper -i shapes.json -if '!this.empty' -dissolve -o out/dissolved.json
```

### -elif

One or more `-elif` (short for "else if") commands may be added to test for alternate conditions, following an `-if` statement. The `-elif` command accepts the same options as the `-if` command.

### -else

Run the following commands if all preceding -if/-elif conditions are false.

### -endif

Mark the end of an -if/-elif/-else sequence.

### -stop

Stop processing (skip remaining commands). Useful when writing scripts, in combination with -if/-elif/-else.

**Example**

```bash
# Don't try to process a missing file
mapshaper -if '!file_exists("boundaries.geojson")' -stop -endif \
  -i boundaries.geojson -proj robin -o output/boundaries.shp
```

### -target

Set the target layer or layers for the following command.

`<target>` or `target=`  Name or id of a layer (first layer is 1).

`type=`  Type of layer(s) to match (polygon, polyline or point). This is useful when importing GeoJSON files containing several types of geometry.

`name=`   Rename the target layer.


## Informational Commands


### -calc

Perform calculations on a collection of records and display the results, using a JavaScript expression. The expression can use one or more of the following built-in functions. Most functions take the name of a data field or a JS expression as the first argument.

The `calc` functions are also available in the context of `calc=` expressions, which can be used as options to `-join`, `-dissolve` and several other commands. See example below.

| function | description |
| --- | --- |
| `count ()` | returns number of records in the collection |
| `sum (<expr>)` | |
| `mean (<expr>)` | |
| `average (<expr>)` | same as mean() |
| `median (<expr>)` | |
| `mode (<expr>)` | returns most frequently occuring value in the collection (or the first such value in case of a tie). |
| `min (<expr>)` | |
| `max (<expr>)` | |
| `quartile1 (<expr>)` | first quartile |
| `quartile2 (<expr>)` | same as median() |
| `quartile3 (<expr>)` | third quartile |
| `iqr (<expr>)` | interquartile range |
| `quantile (<expr>, <pct>)` | arbitrary percentile (`<pct>` is 0-1) |
| `collect (<expr>)` | returns array containing all values |
| `collectIds ()` | returns array of feature indexes (features are indexed 0 to n-1)
| `first (<expr>)` | returns first value in the collection |
| `last (<expr>)` | returns last value in the collection |
| `every (<expr>)` | returns true if expression is true for all elements in the collection |
| `some (<expr>)` | returns true if expression is true for one or more elements in the collection |

Argument expressions take the same form as `-each` expressions. If no records are processed, `count()` and `sum()` return `0`, and the other functions return `null`.

**Assignments**

The `-calc` expression can take the form of one or more assignments. This creates global variables that can be accessed by subsequent expressions using the `global` namespace. For example:

```
mapshaper data.csv \
  -calc 'N = count()' \
  -if 'global.N < 5' \
  -print 'LOW SAMPLE SIZE, STOPPING' \
  -stop \
  -endif
```

**Options**

`<expression>` or `expression=` JS expression containing calls to one or more `-calc` functions.

`where=`  Perform calculations on a subset of records, using a boolean JS expression as a filter (similar to [`-filter`](#-filter) command).
`+` Save output to a layer.
`name=` Name the output layer (default name is "calc").
`target=`

**Examples**

```bash
# Calculate the sum of a data field
mapshaper ny-census-blocks.shp -calc 'sum(POPULATION)'

# Count census blocks in NY with zero population
mapshaper ny-census-blocks.shp -calc 'count()' where='POPULATION == 0'

# Using calc functions in conjunction with the `-dissolve` command
mapshaper counties.csv -dissolve STATE_NAME calc='NUM_COUNTIES = count()' -o states.csv
```

### -colors
Print list of built-in color schemes. Color schemes can be used with the `color-scheme=` option of the [-classify](#-classify) command. (These color schemes come from the [d3-scale-chromatic](https://github.com/d3/d3-scale-chromatic) library.)

### -comment
The following text up to the next command is treated as a comment. Useful for adding explanatory comments to a long sequence of commands.

### -encodings
Print list of supported text encodings (for .dbf import).

### -help

Print usage tips and a list of commands.

`<command>` Show options for a single command, e.g. `mapshaper -h join`.

### -info

Print information about a dataset. Useful for seeing the fields in a layer's attribute data table. Also useful for summarizing the result of a series of commands, or for debugging unexpected output.

```bash
# Example: Get information about an unknown GeoJSON or TopoJSON dataset
mapshaper mystery_file.json -info
```

`save-to=` Save information to a .json file.
`+` Save output to a layer.
`name=` Name the output layer (default name is "info").

### -inspect

Print information about the data attributes of a feature.

`<expression>` or `expression=` JS expression for selecting a feature (see the [`-each`](#-each) command for documentation about JS expressions).

Common options: `target=`

```bash
# Example: View attribute data for a state
mapshaper states.geojson -inspect 'NAME == "Delaware"'
```

### -print

Prints a message to the console or terminal (using stdout). This command is useful in combination with the `-if/-elif/-else` commands.

```bash
# Example
mapshaper cities.json \
-if 'this.empty' \
-print FILE IS EMPTY
```

### -projections

Print list of supported proj4 projection ids and projection aliases.

### -quiet

Inhibit console messages.

### -verbose

Print verbose messages, including the time taken by each processing step.

### -version

Print mapshaper version.
