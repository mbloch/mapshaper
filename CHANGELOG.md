v0.6.59
* Second attempted fix for -require error on Windows.

v0.6.58
* Fix for -require error on Windows.

v0.6.57
* Added io.ifile() method for creating dynamic input files in the run command

v0.6.56
* Added support for importing ES modules using the -require command.
* Removed the -require init= function.

v0.6.55
* Improvements to the web UI intersections tool.

v0.6.54
* Only check for line self-intersections in web UI if user clicks the "Check line intersections" label.
* Added support for curly-bracket delimited expressions to -run command strings.

v0.6.53
* Added -classify outer-breaks=<min,max> option, for limiting the effective data range when calculating equal-interval breaks and continuous color ramps.

v0.6.52
* Added -calc + option, which saves calc output to a new layer.
* Added -info + option, which saves info output to a new layer.

v0.6.51
* Improved support for running applyCommands() api function in a web browser.

v0.6.50
* Fix for label dragging bug.

v0.6.49
* Fix for issue #610 (geojson getters in -run and -each should return polygons with RFC 7946 winding order).
* -join interpolate now works correctly when the source layer contains overlapping polygons.

v0.6.48
* Added `target.geojson` getter that returns the contenst of the target layer as a GeoJSON `FeatureCollection`. Useful in the `-run` command for passing layer data to an external script.

v0.6.47
* Added support for using JSON data as an argument to the -i command.
* Added an `io` object with an `io.addInputFile()` method to the `-run` command's expression context, to support loading dynamically generated datasets.

v0.6.46
* Added save to clipboard option to web UI export menu.
* In -each expressions, `this.geojson` setter now accepts nulls and FeatureCollections in addition to single Features.

v0.6.45
* Added -o hoist=<fields> option for moving GeoJSON Feature properties to the root of each Feature.
* Simplification data is removed from snapshot files (except for temporary snapshots in the web UI).

v0.6.44
* Added -style css= option for adding inline CSS to SVG symbols.
* Bug fixes

v0.6.43
* Bug fixes

v0.6.42
* Added "+ add field" button to web ui inspector in attribute editing mode.

v0.6.41
* Bug fixes

v0.6.40
* Added support for decimal degree formats in DMS functions, e.g. `"[-]DDD.DDDDD°"`.
* Added `-o svg-bbox=` option, for specifying the extent of SVG maps in projected map units.
* Started adding version numbers to snapshots exported from the ribbon menu (e.g. "snapshot-01.msx").

v0.6.39
* Added `format_dms()` and `parse_dms()` functions to `-each` expressions, for working with DMS-formatted coordinates.

v0.6.38
* Added `-symbols opacity=` option.

v0.6.37
* Support for simple line symbols using `type-arrow head-length=0`.

v0.6.36
* Improved `fill-effect=sphere` gradient.
* Sphere effect can be previewed in the web UI.

v0.6.35
* Bug fixes

v0.6.34
* Added -style fill-effect=sphere to apply a gradient effect to the outline of a globe.

v0.6.33
* Bug fixes

v0.6.32
* Web UI improvements

v0.6.31
* Updates to gui file import dialog
* Updated projections library to fix a bug.

v0.6.30
* Added -filter-fields invert option.

v0.6.29
* Bug fixes

v0.6.28
* Fix for bug that prevented importing data from stdin

v0.6.27
* Bug fix

v0.6.26
* Updated projections library to fix a bug.
* Added getters partCount, isNull, bounds, width, and height to "this" object for point features in expressions.
* Added undocumented "blacki" classification method.
* Added collectIds() function to calc= expressions of the -join command.

v0.6.25
* Added "Erase" button to box tool in web UI.
* Bug fixes and optimizations.

v0.6.24
* Added -info save-to=<filename> option, for saving layer information to a JSON file.
* Apply the same amount of compression to all exported snapshots.
* Bug fixes

v0.6.23
* Update to web UI export options.

v0.6.22
* Bug fixes

v0.6.21
* Bug fixes

v0.6.20
* Added "Snapshot file" export option to web UI.
* Updated the layers menu in the web UI.
* Use more compression when exporting snapshots via export menu or -o command.

v0.6.19
* Added support for a new file format (.msx) for saving and restoring mapshaper sessions.
* Added a web UI widget for working with session snapshots.

v0.6.18
* Fix for bug preventing some zipped Shapefiles from being imported in the web UI.

v0.6.17
* Commands -require, -run, -define can now be used before data is loaded.

v0.6.16
* Added support for saving output files to a user-selected directory in the web UI, if supported by the browser.
* Added support to the web UI for reading and writing gzipped (.gz) files.
* Improved support for .zip and .gz files in both web and cli programs.
* Minor update to dbf text encoding detection.

v0.6.15
* Added support to the CLI for reading .kml and .kmz files.
* Added support to the CLI for writing .kml files.
* Added support to the web UI for writing .kml files.

v0.6.14
* Added support to the CLI for reading and writing .zip files.

v0.6.13
* Gzipped output is inferred if output filename ends in ".gz".

v0.6.12
* Support for reading larger .gz files (up to 2GB unzipped GeoJSON and CSV files).

v0.6.11
* Added support to the CLI and Node interface for reading and writing gzipped files with the .gz extension.

v0.6.10
* Added draggable handles to the box tool in the web UI.

v0.6.9
* Added bboxContainsRectangle(), bboxIntersectsRectangle(), bboxContainedByRectangle() and bboxContainsPoint() functions to the "this" object in expressions used by -each, -filter, -each where= and other contexts.

v0.6.8
* Fix: support fill color for svg image symbols.
* Added range=<min,max> option to -classify command.

v0.6.7
* Give users running mapshaper-gui on localhost access to basemaps.

v0.6.5
* Fixed an error using -classify command in the web UI console.

v0.6.4
* Added quartile1(), quartile2(), quartile3(), iqr() (interquartile range), and mean() to -calc and calc= expressions.

v0.6.3
* Added quantile() function to -calc command and calc= expressions.

v0.6.2
* Added -stop command (can be used in combination with -if/-elif/-else to halt processing under various conditions).

v0.6.0
* Internal changes that shouldn't affect Mapshaper users.

v0.5.118
* Added -comment command, as a way to add inline comments in long sequences of commands.
* Added support for importing .cpg files (Shapefile text encoding) in the web UI.

v0.5.117
* Support reading DBF files larger than 2GB (command line program only).

v0.5.116
* Prevent 0-length DBF string fields, for interoperability with PostGIS.

v0.5.115
* Scalebar tweaks.

v0.5.114
* Bug fixes

v0.5.113
* Added -symbols arrow-style=stick option, for making stick arrows
* Added -symbols stroke= and -symbols stroke-width= options for styling stick arrows

v0.5.112
* Added support for labels with symbols.
* Symbols created with the -symbols command have a default size (e.g. `-symbols type=star` creates star symbols with a default size).
* Mapshaper no longer outputs SVG circles with radius 0.

v0.5.111
* Added -snap endpoints option, for snapping together line endpoints that don't quite meet.
* Added buttons to the basemaps menu.
* -if/-elif commands work (with limited functionality) with zero or multiple target layers.

v0.5.110
* Preliminary support for importing .kml files
* Support for .kmz files in the browser UI
* Bug fixes

v0.5.109
* Support setting linejoin and linecap for individual SVG features.

v0.5.108
* Bug fixes
* Added file_exists() to -if/-elif expressions

v0.5.106
* More basemap fixes.

v0.5.105
* More basemap improvements.

v0.5.104
* Improvements to the basemap feature.

v0.5.103
* Bug fixes

v0.5.102
* Fix for bug in -v/--version command.

v0.5.101
* Update dependency.

v0.5.100
* Added support for using the basemap feature with datasets in a wide variety of projections.

v0.5.99
* Added support for viewing data against a Mapbox basemap (enabled on the mapshaper.org site).

v0.5.98
* Better handling of null data by the -classify command.

v0.5.97
* Better warnings and error messages.

v0.5.96
* Added colors=random option to the -classify command.
* Added more sensible default behavior to the -classify command.

v0.5.95
* Added vertex deletion in "edit vertices" mode by double-clicking on non-endpoint vertices.

v0.5.94
* Added file_exists() test to -if/-elif expression context.

v0.5.93
* Add a vertex in "edit vertices" mode by dragging the midpoint of a segment.

v0.5.92
* Show vertices in the "drag vertices" editing mode.
* Added -c/--commands option to mapshaper-gui, for running console commands when data is first imported.

v0.5.91
* Added -print command, for printing messages to the console or terminal. Useful in conjunction with the -if/-elif/-else commands.
* Added field_exists(), field_type() and field_includes() functions to -if expressions.

v0.5.89
* Added help documentation for -symbols command.
* Added --name option to mapshaper-gui, for setting the layer names of imported files.

v0.5.88
* Added -if/-elif/-else/-endif commands for running commands selectively.
* Bug fixes

v0.5.87
* Added undo/redo to the "drag vertices" interactive editing mode.

v0.5.86
* Added keyboard commands for undo/redo for interactive point and label positioning.

v0.5.85
* Improved arrow and star symbols.

v0.5.84
* Bug fixes

v0.5.83
* Added support for importing GeoJSON features with GeometryCollection type geometries.
* Added "ring" symbol type.

v0.5.82
* More options for arrow styling.

v0.5.81
* Bug fixes

v0.5.80
* Added arrows, stars and polygons to undocumented -symbols command.

v0.5.79
* More permissive importing of some non-standard Shapefiles.

v0.5.78
* Added support for reading and writing fixed-width text files.
* Bug fixes.

v0.5.77
* Added -dashlines command (formerly -split-lines).
* Added support for joining polyline and polygon layers using point-method

v0.5.76
* Fixed bug in mapshaper-gui -q.
* Added undocumented -split-lines command.

v0.5.75
* Added support for importing data by copy-pasting files onto the web UI (works in Chrome and Safari but not Firefox).

v0.5.74
* Added support for importing data in the GUI by pasting JSON and delimited text onto the browser window.
* Sped up drawing shapes in the GUI.

v0.5.73
* Added this.geojson getter/setter to -each expressions. This can be used in combination with -require to transform the geometry of individual features using an external script.

v0.5.72
* Improved performance of non-adjacent polygon coloring using DSATUR algorithm.

v0.5.71
* Added -classify non-adjacent option, for assigning non-adjacent colors to a polygon layer in a randomish pattern.

v0.5.70
* Added -join duplication option, which duplicates features in the target layer when many-to-one joins occur.

v0.5.69
* Added undocumented -ignore command.
* Bug fix

v0.5.68
* Bug fix

v0.5.67
* Bug fix

v0.5.66
* Improve interactive selection.
* Added undocumented -define command.

v0.5.65
* Web UI zoom buttons respond to variable-length clicks.
* Bug fixes

v0.5.64
* Bug fixes

v0.5.63
* Added -o decimal-comma option, for exporting CSV numbers with decimal commas.
* Fix for issue #497 (error erasing with overlapping polygons).

v0.5.62
* Added -i decimal-comma option, for importing numbers from CSV files with numbers formatted like 1.000,23 or 1 000,23

v0.5.61
* Bug fixes

v0.5.60
* Added save-as= and values= options to -dots command (like -classify).

v0.5.59
* Added -merge-layers flatten option, for removing overlaps when merging multiple polygon layers.
* Added -clean overlap-rule=[min-id|max-id|min-area|max-area] option.
* Added -join max-distance= option for point-to-point spatial joins.
* Added support for many-to-one point-to-point spatial joins.
* Added -join largest-overlap option for polygon-to-polygon spatial joins, to select a single polygon to join when multiple source polygons overlap a target polygon, based on area of overlap.
* Added undocumented -filter-points command.

v0.5.58
* Bug fixes

v0.5.57
* Added "allow-overlaps" option to -dissolve2 and -clean, which allows polygon features to overlap.
* Added "Hill Eucyclic" projection (+proj=hill).
* Fixed bug that removed overlapping polygons when projecting polygon layers.

v0.5.56
* Added "-graticule polygon" option, which creates a polygon matching the outline of the projected graticule.
* Allow bare PROJ projection names in CRS definitions (e.g. "robin +lon_0=120").
* Web UI style updates.

v0.5.55
* Improved support for projected graticules.
* Fixed shape clipping for the bertin1953 projection.

v0.5.54
* Fix for issue #485 (error when using * wildcard to match all files in a directory)

v0.5.53
* Fixed clipping area of nsper (Near Side Perspective).

v0.5.52
* Automatically clip content to an appropriate circle when applying most of the azimuthal projections (including stere,ortho,gnom,laea,nsper).
* Added the -proj clip-angle= option to override the default clipping circle.
* Automatically clip away the poles when projecting to Mercator.
* Added the -proj clip-bbox= to clip content to a lat-long bounding box before projecting.
* Added the -graticule interval= option, for customizing the spacing of graticule lines.
* Added a circular outline to the graticule when creating a graticule for an azimuthal projection.

v0.5.51
* Apply antimeridian cutting to more projections.
* Assign categorical colors automatically using -classify categories=\*.
* Add several 20-color categorical color schemes.

v0.5.50
* Bug fix for an argument parsing error.

v0.5.49
* Split polylines and lines that cross the rotated antimeridan when applying a world projection with a non-zero central meridian.
* Fixed error when sending output to /dev/stdout.

v0.5.48
* Update to Cupola projection.

v0.5.47
* Updated projections library to include the "Cupola" projection.

v0.5.46
* Fix for issue #476.

v0.5.45
* [web ui] Made layer names in the export dialog settable.
* Tuned parameters in the -dots command.

v0.5.44
* Added "per-dot=" option to the -dots command, for setting the value-to-dot ratio. To represent 100 people per dot on a population map, you would use per-dot=100.
* Added "copy-fields=" option to -dots, to copy one or more data fields from the original polygon layer to the generated dot features.
* Added "multipart" option to -dots, which combines groups of same-color dots into multi-part features.

v0.5.43
* Improved evenness of dot placement.
* Replaced "random" and "spacing=" options with a single "evenness=" option, which varies from 0 (random placement) to 1 (very even).

v0.5.42
* Added -dots command for making dot density maps.

v0.5.41
* Fixed error parsing .prj files for southern UTM zones.

v0.5.40
* Added stops= option to the -classify command. This accepts a pair of percentages (e.g. stops=10,90) for reducing the range of a color ramp.
* Deprecated -classify color-scheme= option. Instead, -classify colors= accepts color scheme names (e.g. -classify colors=Blues).
* Added every() and some() functions to -calc and calc= expressions.
* Added options for generating SVG map keys to the -classify command.

v0.5.39
* Added mapshaper-gui -t/--target option, for setting the initially selected layer.
* Added query-string variables a/display-all, q/quick-view and target=, for customizing the initial view when sending someone a mapshaper url containing a list of files to display.

v0.5.38
* Added "-points midpoints" flag, to find the midpoints of polyline features.

v0.5.37
* Performance improvements for GeoJSON parsing.

v0.5.36
* Improved support for reading large GeoJSON files.

v0.5.35
* Calculate projection params based on data extent for four projections, by running -proj lcc|aea|tmerc|etmerc (experimental).

v0.5.34
* Add -o ndjson flag, to output GeoJSON and JSON records in NDJSON format.
* Improvements to -classify command

v0.5.33
* Add -classify hybrid, which picks evenly spaced internal class breaks and quantiles for the first and last buckets
* Add -classify nice, which is similar to the "hybrid" classification scheme, but tries to pick round class break values.
* Bug fixes

v0.5.32
* Bug fixes

v0.5.31
* Now, -clean command can merge contiguous parts of polyline features, for example, sections of roadway in which each (sub-feature) part is a simple line segment.
* Added `int_median()` function to the expression context, for calculating medians using piecewise linear interpolation (e.g. median income from range data).

v0.5.30
* Improved support in -classify for interpolation, including interpolation of numbers as well as colors.

v0.5.29
* Added -classify command, with support for classifying data values using sequential (quantile and equal-area) and categorical methods. Built-in support for named color schemes from d3.
* Added -colors command, which prints the names of built-in d3 color schemes.

v0.5.28
* Fixed a performance bug that caused importing of some large GeoJSON files to be very slow.

v0.5.27
* Added layer.bbox property to JS expression context.
* Added support for listing class breaks in descending order in -colorizer command.
* Improvements to (undocumented) arrow symbols.

v0.5.26
* Added support for assignment syntax to -rename-layers, like the -rename-fields syntax (e.g. -rename-layers states=adm1,counties=adm2).
* Added -o fit-bbox= option for TopoJSON export, which scales and shifts the coordinates of the exported data to fit within a given bounding box.

v0.5.25
* Added -snap command, with both interval= and precision= options.

v0.5.24
* Performance improvements

v0.5.23
* Added "dashes" fill pattern. The pattern "dashes 5px 4px 1px black 5px white" creates 1-pixel dashed lines spaced 5px apart, with 5px dashes at 4px intervals.

v0.5.22
* Added a "Select All" checkbox to the web UI export menu when there are more than two layers.
* Improved -info display and interactive editing of Date objects.

v0.5.21
* Renamed -style fill-hatch= option to -style fill-pattern=
* Reversed order of hatch fill arguments. "black 2px white 2px" changes to "2px black 2px white".
* Added patterns for dots and squares. "dots 2px black 5px white" gives 2px black dots with 5px spacing on a white background. "squares 2px black 5px white" gives squares instead of round dots. Both patterns can take multiple colors and an optional rotation: "squares 45deg 2px black red blue 5px white".

v0.5.20
* Fix for bug introduced in previous version

v0.5.19
* Bug fix and UI tweaks

v0.5.18
* Added support for hatches with more than two colors.
* Added 'drag vertices' interaction mode for line layers, as a precursor to a future callout line tool.
* Tried to make the arrow menu more intuitive by not preselecting any of the items.

v0.5.17
* Added support for rotation parameter to "fill-hatch=" style, e.g. fill-hatch="-45deg #eee 2px #999 2px"
* Renamed -proj "from=" option to "init=". This better describes the option's function, which is to set the coordinate system of a dataset without touching the coordinates.

v0.5.16
* Updated dependencies

v0.5.15
* Added experimental "blend()" function to the expression context, for doing weighted-average blending of two or more rgb colors. Function signature is: blend(col1, weight1, col2, weight2, ...)
* Added limited support for hatched polygon fills, using -style fill-hatch="" syntax. Example hatch string: "black 2px #eee 2px"

v0.5.14
* Added -i csv-dedup-fields to deduplicate CSV fields with identical names.
* Added -style stroke-opacity and -style fill-opacity options.

v0.5.13
* Bug fixes

v0.5.12
* Bug fixes

v0.5.11
* Added "-uniq index" option, which adds an "index" property for indexing duplicate features instead of deleting them.
* Added support for reading and writing non-ascii field names in Shapefiles.
* Now, the -o command can create new subdirectories for output files.

v0.5.10
* Added -inlay command, for inscribing the contents of a second polygon layer into the target polygon layer.

v0.5.9
* Added "where=" option to the -dissolve command, for dissolving a subset of features in a layer.

v0.5.8
* Automatically detect encoding of CSV files when byte-order-mark (BOM) is present.
* Extend "json-path" option to support importing GeoJSON and TopoJSON data that is nested inside a larger JSON object.

v0.5.7
* Added "rewind" flag to the -clean command. This option fixes winding-order errors by converting holes that are outside of any ring into space-enclosing rings, and rings that are nested directly inside of other rings into donut holes.

v0.5.6
* Default GeoJSON output now complies with RFC 7946 with respect to polygon winding order and antimeridian-crossing bounding boxes. This means that space-enclosing rings are CCW and holes are CW. This is the opposite of how mapshaper used to output polygon rings without the rfc7946 flag.
* Added a gj2008 flag to the output command (-o gj2008). This flag maintains compatibility with the way Mapshaper used to output GeoJSON: CW rings, CCW holes, and bbox arrays that are always [xmin, ymin, xmax, ymax].
* The old rfc7946 flag is no longer useful, but is retained for backwards compatibility. This flag (as before) truncates coordinates to 6 decimal places. Now, using this flag is equivalent to adding precision=0.000001 to the output command.

v0.5.5
* Prompt the user before closing the browser tab, if data has changed since the session began or since the last export.
* Include interactive data edits in the web ui console's "history" output.

v0.5.4
* Bug fixes

v0.5.3
* An error is triggered if a layer id from a target= option or the -target command does not match any layer.

v0.5.2
* Web interface bug fixes.

v0.5.1
* Web interface tweaks.

v0.5.0
* Refactored the codebase to use ES modules.
* Switched to the "rollup" module bundler.

v0.4.163
* Updated dependences, increased minimum Node version to 6.0.

v0.4.162
* Added -dissolve multipart option, for grouping parts without modifying geometry.
* Added -polygons from-rings option, for creating polygons when the original layer contains polyline rings.
* -filter-fields now sets the order of fields in CSV output.

v0.4.161
* Tweaked the pointer interaction interface.

v0.4.160
* Bug fixes

v0.4.159
* Changed GUI icon and user interaction for switching interaction modes.
* Added feature-selection interaction mode to the Web UI, for selecting features with the mouse.
* Added box-select (using shift-drag) to feature-selection mode.
* Added 'random' option to the -colorizer command, for assigning colors randomly.

v0.4.158
* Support bracket notation in -i json-path= option, for targetting datasets nested inside JSON arrays.

v0.4.157
* Fixes and other improvements to the interactive box tool.
* Fixes to the web console "history" command.
* Added -filter bbox= option, to retain features that intersect a bbox.
* Added -filter invert option, to retain the features that would have been deleted.

v0.4.156
* Added box tool to the GUI, activated by shift-drag. The box tool supports clipping, feature selection + filtering, bbox coordinate lookup and zoom-to-box.

v0.4.155
* Added mapshaper-gui -q/--quick-view option, for bypassing the import dialog.
* Added -join prefix= option, to add a prefix to the names of fields joined from the source dataset.
* Updated CLI -info command to show only target layer(s) by default. Use -info target=* for information about all layers.

v0.4.154
* Added -divide command, for dividing a polyline layer by a polygon layer. Also joins data from the polygon layer to the divided polyline layer.

v0.4.153
* Allow setting empty layer names using -rename-layers "".
* Fixed bug affecting polygon-to-polygon spatial joins using the "point-method" flag.

v0.4.152
* Rename json-subtree option json-path.

v0.4.151
* Added -i json-subtree=<path> option, for importing a nested array of JSON data records.
* Added -dissolve group-points option, to convert groups of point/multipoint features to multipoint features, instead of converting groups to centroids.

v0.4.150
* Fixed a bug affecting the calc=[expression] option when performing polygon-to-polygon spatial joins.

v0.4.149
* Improve OGC Simple Features compliance of cleaned polygons.

v0.4.148
* Added sliver-control=[0-1] option to -clean -dissolve2 and -filter-slivers commands, for variable sliver control.
* Made sliver-control=1 the default value for these commands.
* Tweaked the default area threshold for gap/sliver removal to use a larger threshold for more detailed datasets (detail is estimated using average segments per ring).
* Changed name of min-gap-area option to gap-fill-area (original name also works).
* Added tests of -clean command polygon output to verify OGC Simple Features compatibility.

v0.4.147
* Improved robustness of path intersection (used by many commands, including -clean -dissolve2 -clip -erase -union).

v0.4.146
* Added support for line and point type features to the -clean command.
* Added (undocumented) -snap command, for snapping vertices post-import.

v0.4.145
* Added -grid command for creating grids of square or hexagonal polygons. Assumes target layer is projected. Creates a grid layer that entirely contains the bounding box of the target layer.
* Added polygon-to-polygon spatial joins to the -join command.
* Added "interpolate=" option to the -join command, for reassigning attribute values of the listed fields using simple areal interpolation (assumes even distribution of data within polygon areas) (polygon-polygon spatial joins only).
* Added "point-method" option to the -join command, for performing polygon-polygon spatial joins using an alternate method.
* Added "-lines segments" option, to explode a polygon or polyline layer into individual segments.

v0.4.144
* Change -union command syntax to use two or more target layers as input
* Added -union fields= option for selecting which fields from the input layers to retain.

v0.4.143
* Fix for web UI bug that caused command line options to be ignored.

v0.4.142
* Added -union command for creating a mosaic from two polygon layers, preserving data from both layers.
* Added -mosaic calc= option, which provides options for transferring data from source polygons to mosaic polygons.
* Allow -merge-layers to combine a shape layer with a layer that has null geometry.

v0.4.141
* Added "history" command to browser console, for displaying browser session as a command line shell command.
* Added -mosaic as a documented command (flattens overlapping polygons by converting overlaps to separate features).

v0.4.140
* Fix error in web UI.

v0.4.139
* Send output of -version, -help and some other informational commands to stdout, not stderr.

v0.4.138
* Added runCommandsXL() function to Mapshaper's Node API, for running commands with more memory.

v0.4.137
* Further improvements to -data-fill and -fuzzy-join. Added 'contiguous' flag to ensure that only the most important one of multiple same-value areas is retained.

v0.4.136
* Improvements to -data-fill and -fuzzy-join

v0.4.135
* [shapefile] If a projection has no known WKT definition, generate a fallback .prj file with an embedded Proj.4 string (readable by QGIS and gdal but not ArcGIS).

v0.4.134
* Fixed "npm run build" on Windows

v0.4.133
* Performance improvements for CSV importing

v0.4.132
* Added -i csv-lines=[integer] option, for importing the first n records from a CSV file
* Added -i csv-skip-lines=[integer] option, for skipping lines at the top of a CSV file
* Added -i csv-field-names=[list] option, for assigning field names to the columns of a CSV file.

v0.4.131
* Added optional size parameter to mapshaper-xl (e.g. mapshaper-xl 16gb)
* Improve performance of -i csv-fields=  option.

v0.4.130
* Input of GeoJSON and TopoJSON is more fault-tolerant.

v0.4.129
* Work around layer menu issue caused by Chrome update.

v0.4.128
* Fix Travis build.

v0.4.127
* Updates to albersusa hybrid projection: new Alaska projection (lon_0 is at 148W) and support for customization. Customization examples: "albersusa +PR" "albersusa +AK.lon_0=-141 +AK.scale=0.4 +AK.dx=10000".
* "-proj" command no longer throws an error if one or more coordinates fail to project. Instead, the points or arcs containing projection errors are removed.
* Added an npm "prepare" script for users who are installing mapshaper from source code.
* Added an "npm run build" script

v0.4.126
* The -simplify command now ignores datasets containing no paths instead of stopping with an error. This is useful in scripts, when clipping creates an empty layer.

v0.4.125
* API functions applyCommands() and runCommands() return a Promise if called without a callback argument.

v0.4.124
* Added -lines groupby=[field] option, for converting points into multiple lines.
* Added -clip bbox2=[bbox] option, which uses a higher-performance (but experimental) bounding box clip function.

v0.4.123
* Now, -lines command converts a layer of points to a single polyline.

v0.4.122
* Added -drop holes option, for removing holes from polygons.

v0.4.120
* Fix for several GUI glitches

v0.4.119
* Fix Travis build error

v0.4.118
* Added string interpolation to source layer name in -clip/-erase, using template literal syntax (e.g. -clip source='${target}-clip')

v0.4.117
* Added -o svg-data= option for exporting data fields as SVG data-* attributes.

v0.4.116
* Bug fixes

v0.4.115
* Improved -dissolve2 to handle polygons that overlap each other in complex ways.

v0.4.114
* Fix: using -join with the "unjoined" and "unmatched" flags no longer adds debugging layers to the next command's default target layer(s).
* Added layer names to tab completion in the web UI console.

v0.4.113
* Fix for issue #339 (no .prj output after projecting to +proj=stere)

v0.4.112
* Fix for issue #337 (error when clipping or erasing polygon rings inside holes)

v0.4.111
* Added $.length accessor to -each expressions with polyline features

v0.4.110
* Added +proj=patterson projection

v0.4.109
* Updated format of -info command output, for better legibility.
* Fixed layer duplication bug when running -clip/-erase with the "+" option.

v0.4.108
* Now you can import all CSV fields as string data using '-i string-fields=\*' option.
* Now the -points command auto-detects commonly used names for x and y coordinates (e.g. longitude,latitude,lon,lng,lat,x,y) when converting tabular data to points. It is no longer necessary to add x= and y= parameters to the -points command.

v0.4.107
* Preliminary work on new -symbols command.

v0.4.106
* Automatic DMS parsing in -points x= y=.
* Added a reference to the target record to -join where= expressions, named "target".

v0.4.105
* [gui] Added separate interface modes for inspecting attributes, editing attributes, dragging labels to change offset from anchor, and dragging point symbols to change coordinates.
* [cli] Improved error message when trying to read unsupported file types.

v0.4.104
* Added "-uniq invert" option, for retaining non-unique records (useful e.g. for troubleshooting many-to-one joins).
* Improved some error messages.

v0.4.103
* Added "weighted" option to the "-filter-slivers" command. When used with the "min-area=" option, the "weighted" flag multiplies the area of each polygon ring by the "Polsby-Popper" compactness metric, so sliver-shaped rings have a lower effective area.
* Added "this.perimeter" to the JS expression context. Perimeter values are in meters for unprojected data or in projected units (usually meters) for projected data.
* Added "this.compactness" to the JS expression context. Compactness is the "Polsby-Popper" score of each polygon feature.
* Added "-points vertices2" option, which is like "-points vertices", but retains every vertex of the original polygon or polyline instead of removing duplicate vertices within each feature.
* Fix for issue #310.

v0.4.102
* Close issues #308 and #309.

v0.4.101
* Re-publish to npm

v0.4.100
* Enable support for variable simplification amounts at the feature level using JS expressions. Adding the "variable" keyword to the -simplify command turns on variable simplification.

v0.4.99
* Support reading CSV files larger than 2GB.
* Added -i command option csv-filter=, for filtering CSV records on import using a JS expression.
* Added -i command option csv-fields=, for importing a subset of fields from a CSV file.
* Faster rendering of many unstyled point symbols (which are drawn as little squares).

v0.4.98
* Fixed a performance regression.

v0.4.97
* Updated mproj version to include bertin1953 projection.

v0.4.96
* Fix for issue #304 (inaccurate centroids for some tiny polygons, caused by floating point rounding).

v0.4.95
* Fixed some clipping and dissolving errors caused by floating point inaccuracy.

v0.4.94
* Fix for problem importing GeoJSON with non-standard properties

v0.4.93
* Improve CRS detection when merging datasets

v0.4.92
* Added '-o pixels=' and '-frame pixels=' options for scaling SVG output based on the number of pixels in the output image.

v0.4.91
* Upgraded to 0.0.18 of mapshaper-proj.

v0.4.90
* Upgraded to v0.0.17 of mapshaper-proj, which includes the "Equal Earth" projection (+proj=eqearth).

v0.4.89
* Convert undefined and null values to empty strings when outputting a DBF string field.

v0.4.88
* Fix: convert non-alphameric characters in DBF field names to underscores.
* Web UI updates to support putting more than one mapshaper instance on a single page.

v0.4.87
* Added experimental -run command, for creating commands on-the-fly and running them.
* Added experimental -require command, for importing Node modules for use in -each expressions.
* Added "d" as an alias for "this.properties" in expressions, with a nod to D3.
* -join command prints a warning instead of erroring if no records are joined.

v0.4.86
* [gui] Now you can drag layers in the layer menu to change their stacking order.
* Added mapshaper-gui -a option, to display all layers initially.
* The -target command can now target multiple layers.
* Added undocumented aspect-ratio= option to -rectangle and -rectangles commands.

v0.4.85
* [style] Added -style stroke-dasharray= option.
* Added -o max-height= option, for limiting the height of SVG output files.
* Added undocumented -rectangles option, for creating a box around every feature in a layer.
* Bug fixes

v0.4.84
* [rectangle] offset= option accepts a list of four values (minx,miny,maxx,maxy) in addition to a single value. Value can be a percentage or an interval.
* [rectangle] If no source= or bbox= option is given, -rectangle uses the bounding box of the current target layer(s).
* [points] Added a polyline-to-point conversion that reduces each polyline feature to a single vertex, suitable for point-in-polygon testing.
* Bug fixes

v0.4.83
* Now you can turn on multiple reference layers from the layers menu in the web UI. Reference layers are styled on the map if they have style attributes.
* If a feature is pinned via the [i] inspector tool, the delete key will delete it.
* The text-anchor property of single-line SVG labels is automatically updated on drag, based on its horizontal position in relation to its anchor point. Labels towards the left of the anchor are given text-anchor=end, labels to the right are given text-anchor=start and centered labels are given text-anchor=middle.
* The text-anchor property of multi-line SVG labels can be toggled by clicking the label after it has been selected.
* Added -uniq max-count= option to retain multiple features with the same id.

v0.4.82
* Added -lines each= option, for applying a JS expression to each output line feature. The expression can access data about the original polygon features, just like the where= option.

v0.4.81
* Added -lines where= and -innerlines where= options, for filtering lines using properties of adjacent polygons. Polygons are represented as A and B objects in the expression. B is null for "outer" lines.

v0.4.80
* Results of assigments in -calc expressions are available to subsequent -each expressions as variables.
* Updated dependencies.

v0.4.79
* Added new -include command for loading JS data and functions from an external file. The file should contain a single JS object. The keys and values of this object are converted to variables in the JS expression used by -each.

v0.4.78
* Bug fix

v0.4.77
* Added -s/--direct-save option to mapshaper-gui, for saving output files to a path relative to the user's current working directory, instead of into the browser's download folder.
* Added -f/--force-save option to mapshaper-gui, to allow overwriting input files.

v0.4.76
* Increased the maximum size of CSV output to 2GB (the maximum Buffer size in Node).
* Print a warning instead of throwing an error if a CSV file contains no data records.

v0.4.75
* -join copies source fields by default even if calc= option is present.
* -join prints a warning when inconsistent values are found in copied fields during many-to-one joins.

v0.4.74
* -join fields=* now copies all of the fields from the source layer, including the key field.

v0.4.73
* The -merge-layers command is now able to merge layers from different datasets (including layers in the GUI and layers loaded via separate -i commands).
* Added -merge-layers "force" option for merging layers with inconsistent data fields.

v0.4.72
* -dissolve and -dissolve2 now accept a comma-separated list of field names to dissolve on. 

v0.4.71
* Added -o field-order=ascending option, for sorting the column names (A-Z) of DBF and CSV files. 

v0.4.70
* Order of data fields is preserved in DBF output (previously fields were sorted in case-sensitive ascending order).

v0.4.69
* Added support for using .shx file when present. (Very occasionally, records in the .shp file are packed in an unusual way, and the .shx index file is needed for reading the .shp file).

v0.4.68
* Added ability to dismiss the intersection display on the GUI.
* Updated web interface colors.

v0.4.67
* Renamed -svg-style command to -style (-svg-style still works as an alias).
* Minor web interface improvements

v0.4.66
* SVG labels are displayed in the web interface.
* Update label position relative to its anchor point by clicking and dragging the label.

v0.4.65
* Add -o height option, for setting the pixel height of SVG and TopoJSON output.

v0.4.64
* Bug fixes

v0.4.63
* Added mapshaper-xl script, for running mapshaper with about 8GB of heap memory instead of the default amount.
* Output type 1 Shapefiles if features are all single points (more compact than type 8/multipoint).

v0.4.62
* Added -o singles option for saving each output layer to a separate file (TopoJSON only).
* Allow -proj command to set the projection of an empty dataset.

v0.4.61
* Improvements to command line help.
* Add support for specifying most distance parameters using a variety of units. For example: -affine shift=1km,2km
* Add support for specifying areal parameters with units. For example: -filter-islands min-area=5sqkm. Recognizes sqmi/mi2, sqkm/km2, sqm/m2, sqft/ft2.

v0.4.60
* Added -o id-prefix=  option for namespacing svg layer and symbol ids.
* Fix: SVG layer ids are based on layer names instead of output file name.

v0.4.59
* Bug fixes and performance improvements.
* Added undocumented -i geometry-type= option, to allow importing GeoJSON features containing GeometryCollections with mixed types (which would otherwise cause an error).

v0.4.58
* Fix for issue #236 - error reading some GeoJSON files.
* Added undocumented -filter-geom command with bbox= option, for removing non-intersecting geometry.

v0.4.57
* Bug fix for issue #228 "keep_shapes option doesn't always keep shapes".

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