v0.4.57
* Bug fix for issue #228 "keep_shapes option doesn't always keep shapes"

v0.4.56
* -clean now removes empty geometries by default.
* Added -clean allow-empty option to retain empty geometries.
* Added -clean snap-interval= option to override the default snapping threshold.
* Updated mapshaper-proj to v0.0.15 (improved .prj file support).

v0.4.55
* Fix for issue #221 (-simplify resolution= option error).

v0.4.54
* Improvements to -clean command

v0.4.53
* Update -dissolve2 command to flatten polygons (remove overlaps) and optionally fill gaps.
* Added -clean command to flatten polygons and fill gaps.
* Added min-gap-area= option to -clean and -dissolve2 comands to specify the threshold for filling enclosed gaps between adjacent polygons.
* Show contents of zip files in web UI file import popup.

v0.4.52
* Redesigned initial view of the web UI.
* Temporary fix for issue #219 -- stop trying to fix polygon geometry after applying coordinate precision.

v0.4.51
* Fix for issue #216 (GeoJSON export fails in browser).

v0.4.50
* Added support for reading CSV files larger than 250MB.
* Added support for reading and writing CSV files using other encodings than UTF-8 or ascii.
* Added -drop command for dropping loaded data layers and for deleting geometry and/or attribute data fields from targeted layers.
* The [-info] command now shows an asterisk next to currently targetted layers.
* Bug fixes

v0.4.49
* Added -polygons gap-tolerance= option, for closing "undershoots" (tiny gaps between two polylines).

v0.4.48
* Added -shape command, for creating polygons and polylines from lists of coordinates.
* Added -rectangle command, for creating rectangular polygons.
* Added experimental -polygons command, for convering a polyline layer containing rings to a polygon layer.
* Made -dissolve2 more robust (less likely to drop rings when input contains overlapping shapes).
* In JS expressions, this.x and this.y can now be used to set x,y coordinates of point features (previously they were read-only).
* -svg-style layer-text= recognizes <br>, \n and '\n' (newline char) as line delimiters.
* -o margin= option now accepts a comma-separated list of margin widths, as an alternative to a single value. List order is xmin,ymin,xmax,ymax (same as bbox= option).

v0.4.47
* Added -svg-style where= option, for applying svg attributes to a subset of features

v0.4.46
* Added -o geometry-type= option, which overrides the default GeoJSON output type with one of: Feature, FeatureCollection, GeometryCollection.

v0.4.45
* Added -o svg-scale= option, for scaling SVG output using geographical units per pixel.

v0.4.44
* -dissolve2 now removes polygon rings that are improperly nested inside other rings.

v0.4.43
* Restore prohibition against overwriting input files unless the "-o force" option is present.

v0.4.42
* Added support for exporting TopoJSON in pixel coordinates using the -o width= and -o margin= options.

v0.4.41
* Added -o rfc7946 option, for generating RFC 7946-compliant GeoJSON: default 6-decimal precision, CCW outer-ring winding order, antimeridian-spanning bbox, warns if CRS is not WGS84.

v0.4.40
* Added sprintf() and round(num, digits) utility functions to -each command context.
* Fixed bug that prevented using applyCommands() with -clip or -erase commands.

v0.4.39
* [web] Added support for EPSG codes using the -proj command in the browser console (using Proj.4 syntax, like:  -proj +init=epsg:2784). Supported init files: epsg, esri, nad83, nad27.

v0.4.38
* Added -svg-style letter-spacing= option.
* Started attaching SVG symbol classes to top-level symbol element (this only affects multipoint symbols).

v0.4.37
* Added support for multiline labels. Lines are separated by newline characters (`'\n'`) in the label text.
* Added -svg-style line-height= option to control the line height of multiline labels.

v0.4.36
* Setting both r= and label-text= options of -svg-style creates labels with anchor points.
* Added font-weight= and font-style= options to -svg-style command.

v0.4.35
* Added SVG label output, with new options to -svg-style command.
* Added string-fields= option as an more convenient alternative to field-types= in the -i and -join commands.

v0.4.34
* Fixed an incompatibility with Node versions < 3.0.

v0.4.33
* [web] Added support for importing and exporting large GeoJSON files (>1GB) to the web interface.

v0.4.32
* [web] The inspector tool now shows multiple hits when hovering over/clicking on overlapping polygons and points with identical coordinates.
* Added -target type=polygon|polyline|point option, for targeting layers of a given type.

v0.4.31
* Added support for exporting large (>1GB) GeoJSON files.

v0.4.30
* Added support for importing large (>1GB) GeoJSON files using the command line script.
* Changed `-line` command to generate two fields: "RANK", containing an integer and "TYPE", containing a human-friendly name.

v0.4.29
* Fixed error exporting Shapefiles with unparsable .prj files (content of original file is copied to output file).
* Updated mapshaper-proj to v0.0.11.

v0.4.28
* Fixed error when clipping polyline layers containing empty geometries.
* [web] Support backslash continuation lines in web console.

v0.4.27
* Added `-points interpolated interval=` options, for interpolating points along polylines at a fixed interval.
* Updated parsing of list options to accept quoted items, like this: `fields="County FIPS",State`	.
* Renamed `-proj source=` option to `-proj match=`.
* Now, `-proj from=` option accepts a .prj file name or layer id as an alternative to a projection string.
* Now, `-proj from=` sets the target CRS if no destination projection is given.

v0.4.26
* [web] Updated console interface to display alongside the map.

v0.4.25
* Added `-proj target=` option, with support for `target=*`.
* Added `-target name=` option for renaming the target layer.
* Updated mapshaper-proj to v0.0.10.

v0.4.24
* Fixed: error dissolving polyline features containing rings.

v0.4.23
* Added polyline support to -dissolve command.

v0.4.22
* Added `-proj source=` option to match projection from a .prj file or another layer.
* Added support for simple point-to-point spatial joins.
* Added `-points vertices` option to convert polygon and polyline features to multipoint features.
* [web] Save console history between sessions using browser localStorage.
* [web] Always display mouse coordinates.
* [web] Display coordinates of mouse bbox after first click.

v0.4.21
* Updated mapshaper-proj to v0.0.9, with better WKT parsing and more projections.
* Added (undocumented) -shape command.
* Bug fixes

v0.4.20
* Added support for generating .prj files.
* Bug fixes

v0.4.19
* Improved display of styled layers.
* Bug fixes

v0.4.18
* Stacking order of layers in SVG output follows order of `target=` list.
* [-colorizer] `colors=` can take a space- or a comma-delimited list.
* [-o] Added `point-symbol=square` option for SVG output.

v0.4.17
* Added section for experimental commands to command line help.
* Added experimental `-affine` command for scaling, shifting and rotating coordinates.
* Added experimental `-colorizer` command with support for sequential and categorical color schemes (intended for SVG output).
* Fixed bug that caused .zip file export to fail in IE11.

v0.4.16
* Bug fixes

v0.4.15
* [web] Improve layer pinning interface.

v0.4.14
* [web] Add button to pin a layer, so it can be compared to the selected layer.
* Allow `calc=` expressions to include assignments to same-named variables, ex: `calc="POPULATION = sum(POPULATION)"`.

v0.4.13
* Add `calc=` option to `-dissolve` and `-dissolve2` commands.

v0.4.12
* [csv] Improve detection of numeric fields by testing all non-empty values, not just the first value.
* [csv] Print the names of auto-detected numeric fields to the console.

v0.4.11
* Fix a bug in undocumented `-data-fill` command.

v0.4.10
* [GeoJSON] Added `-o combine-layers` option, which modifies GeoJSON output by combining all output layers into a single GeoJSON file.
* [SVG] Convert all parts of a multipart polygon or polyline as a single `<path>` element, instead of creating a `<g>` group with multiple child elements.
* Fix for issue 174 (bug in `-merge-layers command`).

v0.4.9
* Fix for invalid GeoJSON output when an attribute data string contained a certain character sequence (Issue #171).

v0.4.8
* Fix some glitches in the web attribute inspector.

v0.4.7
* Added `-join calc=` option, for many-to-one joins. Provides functions for combining values from multiple source records and assigning the result to a field in the target table.
* Fixed bug that broke the `-i name=` option when multiple `-i` commands were given.
* Added more functions for `-calc` and `-join calc=` expressions: `mode()`, `first()`, `last()` and `collect()`.
* Added undocumented `-data-fill` command, for interpolating missing data values by copying from neighbor polygons.

v0.4.6
* [cli] Fix wildcard expansion of input filenames in Windows command shell.

v0.4.5
* [cli] Retain .prj file when combining multiple Shapefiles that have the same projection.

v0.4.4
* [cli] Fix bug writing binary Shapefile files to disk.

v0.4.2
* [cli] Fix bug importing .shp file contents via applyCommands() api function.

v0.4.1
* [cli] Display user errors normally when using `-quiet` command.

v0.4.0
* Added support for loading several datasets via multiple `-i` commands.
* Default target of a command is the output of the previous command (previously the default target was all layers).
* Added `-target` command to set the default target.
* `target=` option and `-target` command accept numerical layer ids; first layer of first dataset is 1.
* Added `-quiet` command to inhibit console messages.
* `-info` command shows information about all layers in all datasets.
* Updated applyCommands() to accept an object containing contents of multiple input files and return an object containing contents of multiple output files (via callback).
* Added `-uniq verbose` option, to show which features are removed.
* Added `-o extension=` option, to set the file extension of exported GeoJSON and TopoJSON files.

v0.3.43
* Fixed bug that caused SVG to be generated without simplification applied (issue #161).

v0.3.42
* Fixed bug that could prevent SVG output after simplification (issue #160).

v0.3.41
* More informative error messages for -merge-layers command.

v0.3.40
* Fix regression: topology not being built when `-i combine-files` is used.
* Add experimental `-cluster` command for aggregating polygons into compact groups.
* Add support for importing TopoJSON files with nested GeometryCollections.

v0.3.39
* Add support for importing GeoJSON and TopoJSON collections that contain mixed geometry types. Polygon/MultiPolygon, LineString/MultiLineString and Point/MultiPoint features are imported to separate layers.
* Address problems caused by imported JSON records containing inconsistent data properties.

v0.3.38
* [gui] Support loading file(s) from a URL. Use query string `?files=` followed by a comma-separated list of file URLs.
* [dissolve2] Print a warning instead of halting when messy topology causes an uncommon pathfinding error.
* Apply quantization to TopoJSON point layers (previously point layers were not quantized).

v0.3.37
* [join] Add `isMax() isMin() isMode()` functions to `-join where=` expressions.
* [proj] Fix `webmercator` projection alias.
* [gui] Fix layer menu scrolling.

v0.3.36
* Add `-point-grid` command.

v0.3.35
* [cli] Remove the restriction on importing files of different datatypes using `-i combine-files`.

v0.3.34
* Bug fixes
* Add -simplification lock-box option (undocumented) to retain vertices at the corners and edges of a rectangular dataset (for simplifying vector tiles).

v0.3.33
* Fixes a global variable leak.

v0.3.32
* Fixes a bug that caused incorrect TopoJSON output of datasets containing partially overlapping line features.

v0.3.31
* `-info` command shows a Proj.4 CS definition, if CS is known or can be inferred.

v0.3.30
* New `-graticule` command adds a graticule layer appropriate for a world dataset centered on longitude 0.
* Add `-proj from=` option, for defining the original coordinate system of a dataset if unknown.
* Fix: escape characters in SVG attributes.

v0.3.29
* Added the `-uniq` command, which applies an expression to each feature and removes features that produce duplicate values.
* Commands are displayed in alphabetical order by the `-help` command.
* Fixed a bug that prevented reprojecting point layers.

v0.3.28
* Improved handling of projection errors.

v0.3.27
* Added reprojection support via mapshaper-proj, a JS port of the Proj.4 projection library.
* The `-proj` command takes a proj4 string or an alias.
* The `-proj densify` option interpolates vertices so long, straight segments can transform into curved lines.
* The `-projections` command lists all supported proj4 projections and aliases.
* Mapshaper now parses the .prj files of Shapefiles to identify their coordinate system.

v0.3.26
* -info command displays Object and Array data properties using JSON.
* The web UI inspector displays objects and arrays as JSON, and accepts JSON input.
* Object/Array data properties are serialized as JSON in CSV output.

v0.3.25
* Add geometry info to the console output of `-inspect`
* Typing `mapshaper <command>` shows help for that command (shortcut for `mapshaper -h <command>`)
* Rename `cleanup` option of `-clip` and `-erase` to `remove-slivers`. Also, delete unused arcs by default after clip/erase.
* Skip over empty Shapefile geometry parts when importing, instead of throwing an error.

v0.3.24
* Fix regression affecting point Shapefile importing.

v0.3.23
* The new `-inspect <expression>` command displays attribute information about a single feature.
* In the web UI console, `-inspect` displays selected features as if they had been inspected interactively using the "i" tool.
* Updated web UI color scheme.

v0.3.22
* The `mapshaper-gui` script now accepts one or more files to load (e.g. `$ mapshaper-gui states.shp cities.json`)
* `mapshaper-gui` probes for an open port on localhost if the default port is in use
* `mapshaper-gui` exits when mapshaper's browser page is closed

v0.3.21
* The -filter-slivers command is now documented in `mapshaper -h`.
* Open polygon rings are automatically closed on import (Shapefile and GeoJSON only).
* Reading DBF files is faster.
* When exporting SVG or TopoJSON from the Web UI, all selected layers are exported in a single file.

v0.3.20
* Add "Settings" button next to the simplification slider. Now, users can see the current simplification settings and change them on-the-fly.
* Display a menu for selecting export layers when there are multiple exportable layers.
* [`split`] When the target layer is unnamed, "split-" is no longer added as a prefix to output layer names when splitting on a data field.
* Bug fixes

v0.3.19
* Support for exporting CSS style attributes with the new `-svg-style` command.
* Display mouse coordinates in the Web UI when the "i" tool is selected. Clicking the screen selects the coordinates so they can be copied to the clipboard.
* Bug fixes

v0.3.18
* Basic support for exporting to SVG.
* Added command line option `-o format=svg`. Saving to a file with ".svg" extension also works.
* Added SVG-specific options `width=` and `margin=` to the output command to override the default values.
* Added support for importing and exporting NULL type Shapefiles
* Bug fixes

v0.3.17
* Added `unjoined` and `unmatched` options to the `-join` command, for inspecting unjoined records from the source and destination tables.
* Added a constraint to Visvalingam simplification to remove an ambiguity in the order of vertex removal when several vertices have the same effective area.
* Added `cleanup` option to `-clip` and `-erase` commands, which removes slivers created by clipping (before, slivers were removed by default).
* Rename `cartesian` option of `-simplify` to `planar`.

v0.3.16
* `-dissolve` now supports point layers. Dissolve reduces a group of point features to a single point at the centroid of the group.
* `-dissolve weight=` option takes a data field or JS expression and uses this value to weight each point when calculating the centroid of a group of points.
* `-filter-fields` no longer supports field renaming. Use `-rename-fields` instead.
* `-info` and `-filter-fields` commands can be applied to much larger DBF files without triggering out-of-memory errors. 

v0.3.15
* For the web, separate geoprocessing library and Web UI into two files (mapshaper.js and mapshaper-gui.js)
* Improve detection of invalid DBF files.
* Bug fixes.

v0.3.14
* -innerlines command creates fewer line features.
* Bug fixes.

v0.3.13
* Adds support for `-o format=json`, which exports an array of JSON records containing attribute data for each feature. Arrays of JSON records can also be imported.
* Adds support for the output command (-o) to the Web UI console.
* Bug fixes.

v0.3.12
* Adds `-simplify stats` option, which displays summary statistics relating to the geometry of simplified paths.
* Adds `-simplification weighting=` option, for setting the weight parameter in weighted Visvalingam simplification.
* Adds `densify` option to the (still undocumented) `-proj` command.
* Automatically filter slivers after a clip or erase operation.
* Adds (undocumented) `-filter-slivers` command.

v0.3.11
* Adds `-simplify resolution=` option, to apply an appropriate amount of simplification for a given display resolution. Example: `-simplify resolution=8000x6000`.
* Adds $.x and $.y getters for retrieving x- and y-coordinates of point features from within an `-each` or `-filter` expression.

v0.3.10
* Adds planar option to simplification menu, if dataset contains lat-long coordinates.
* Bug fixes

v0.3.9
* Changed web ui layout so popup attribute inspector appears more stable when resizing.
* Much faster screen rendering of layers containing many small paths.

v0.3.8
* The -join command now can do point-to-polygon and polygon-to-point spatial joins.
* Added sum-fields= option to the -join command, for summing the contents of one or more fields when joining multiple source records to a single target record.
* Added where= option to the -each command, for targetting a subset of features using a boolean JS expression.
* Added name= option to the import command, for renaming the input layer or layers.
* Bug fixes

v0.3.7
* Added a button for exporting to CSV
* Added `delimiter=` export option for overriding the default delimiter when outputting CSV.
* More consistent layer naming -- layers created with the "+" option are unnamed by default.
* Interface refinements.

v0.3.6
* Web UI now can import CSV files and standalone DBF files, which enables joining via the browser console.
* Bug fixes

v0.3.5
* The attribute data inspector now supports editing data values.
* The -split command can be applied to layers with no geometry.
* Bug fixes

v0.3.4
* Turn on attribute data inspection on rollover by clicking the "i" button.

v0.3.3
* Correctly import numeric DBF fields that use commas as the decimal separator.
* Use retina-quality rendering on retina displays.
* New UI color scheme.
* L/R arrow keys toggle between layers.
* Added experimental weight-scale option to weighted Visvalingam simplification method.

v0.3.2
* Add delete buttons for each layer in the layers menu.
* Stop displaying ghosted clipping shapes after clip or erase commands.
* Many other interface improvements.

v0.3.1
* Adds freeform export options to export menu.
* Fixes several bugs.

v0.3.0
* An updated web interface has a built-in console with support for command line editing.
* Support for text encodings in the web UI.
* Many bug fixes.

v0.2.28
* [cli] Fixed regression reading .shp files larger than 1GB.
* [web] Added buttons for zooming in/out.

v0.2.27
* Add popup error messages to the web UI.
* Add a "No simplification" option to the import options.

v0.2.gi26
* Web UI can now load more than one file. Only the last-loaded file can be edited and exported. The previous file is visible as a faded image. Older files are dropped.
* Try to handle some irregularities found in in-the-wild .shp files.

v0.2.25
* Web UI shows a progress bar while importing large datasets.

v0.2.24
* The web interface can now import Zip archives containing supported file types.

v0.2.23
* Add `+` and `name= `options to `-filter` command, for creating a new filtered layer alongside the original layer.
* Add `force` flag to the `-join` command. This allows values in the target data table to be overwritten by values in the source table when both tables contain identically named fields.
* Bug fixes

v0.2.22
* Fixed a bug preventing files from importing in the GUI.

V0.2.21
* Feature ids from GeoJSON and TopoJSON files are automatically preserved.
* Fixed several bugs affecting csv files.
* When importing and exporting from/to GeoJSON or TopoJSON, top-level "crs" properties are preserved.
* -dissolve command now works on layers without any geometry (in addition to polygon layers).
* Improvements to text encoding detection.

v0.2.20
* Added `bbox=` option to `-clip` and `-erase` commands for clipping/erasing using a bounding box.
* Added `-rename-fields` command.
* Use .cpg file (if present) to set dbf text encoding.
* Use dbf "language driver id" (if present and valid) to set dbf text encoding.
* Try to auto-detect dbf text encoding if other methods fail (limited to utf-8 and latin1)
* Support reading delimited text files with non-utf-8 encodings (using -i encoding= option).
* Remove byte order mark (BOM) when importing text files in utf-8 and utf-16.
* Fix a bug affecting -calc command.


v0.2.19
* Fixed an error importing Shapefiles with the `encoding=` option.
* Added experimental (undocumented) `-proj` command for projecting lat-lng datasets.
* Added `-projections` command for listing names of supported projections.

v0.2.18
* Supports importing, editing and exporting delimited text files and .dbf files.
* Added `field-types=` option to `-i` and `-join` commands.
* API function applyCommands() function now accepts delimited text files.
* Removed optional dataset argument from API function runCommands().
* Stop supplying default -o command when missing from command line.

v0.2.17
* Fix an incompatibility with Node 0.12.

v0.2.16
* Support importing GeoJSON Features that contain GeometryCollections.
* Fix for issue #68: error clipping some shapes that abut a clip polygon.
* Skip fields with unsupported types when importing .dbf files (instead of throwing exception).
* Support for Node 0.12.x

v0.2.15
* Fixed bug affecting -join command.
* Rename data fields to avoid name collisions.

v0.2.14
* Add wildcard expansion for input filenames (to support filename expansion in the Windows command line).
* Speed up identification of interior points (`-points inner` command).
* Improve command line help.

v0.2.13
* Add `-calc` command for calculating simple statistics about a data layer using a JS expression. Functions include sum() median() average() min() max() count().
* Add function for finding interior points of polygon features, for anchoring symbols and labels.
* Add `inner` and `centroid` options to the `-points` command -- for creating a layer of centroids or interior points from a polygon layer
* Add `-sort` command for sorting the features in a layer
* `-o id-field=` supports a comma-sep. list of field names -- useful for assigning ids to multiple TopoJSON objects with different data properties.

v0.2.12
* Add `-filter-islands` command with `min-area`, `min-vertices` and `remove-empty` options.
* Add `-points` command with `x` and `y` options, for creating a point layer from x, y coordinates in an attribute table.
* Add `-o prettify` option to generate human-readable GeoJSON and TopoJSON.
* mapshaper.applyCommands() now returns an array only if output includes more than one JSON object.
* Bug fixes

v0.2.11
* Halt when `-merge-layers` fails
* Print a warning if `-innerlines` output is null
* Apply snapping after multiple import files are merged/combined
* Let users apply arbitrarily large snap intervals instead of capping at avg. segment length
* Use APIError type for invalid API function call parameters
* Switch from async csv parsing using node-csv to synchronous parsing using d3.dsv
* Merge mapshaper.runCommandString() into mapshaper.runCommands()
* Add mapshaper.applyCommands() to tranform Geo/TopoJSON programmatically.

v0.2.9
* Accept point and polyline type layers as targets of `-clip` and `-erase` commands
* `-o presimplify` option adds simplification thresholds to TopoJSON arc vertices.
* Bug fixes

v0.2.8
* Add `-rename-layers <name(s)>` for renaming one or more target layers

v0.2.7
* Bug fixes (issues #56 and #58)
* Improved output file type inference

v0.2.6
* Add `-o drop-table` option
* Infer output file type from file name
* Bug fixes

v0.2.5
* Add `-o force` option to overwrite existing files instead of renaming output files
* Bug fix

v0.2.4
* Add `-o precision` option for rounding output coordinates
* Add `-i /dev/stdin` and alias `-i -` to receive data via stdin (single-file Topo/GeoJSON input only)
* Add `-o /dev/stdout` and alias `-o -` to send output to stdout (single-file JSON output only)
* Add support for Travis CI

v0.2.3
* Add `-i id-field=` option: import Topo/GeoJSON 'id' property to the specified data field
* Extend `-o id-field=` option to GeoJSON Features (previously TopoJSON only)

v0.2.2
* Update weighting function for weighted Visvalingam simplification
* Add support for loading mapshaper.js with RequireJS
* Improve display of information with `-info` command
* Add undocumented `-dissolve2` command, which can dissolve overlapping polygons

v0.2.1
* Improve performance of `-erase` when erase layer contains many small polygons

v0.2.0
* New command line syntax
* New `-clip` and `-erase` commands
* Many bug fixes