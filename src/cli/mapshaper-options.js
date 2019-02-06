/* @requires
mapshaper-common
mapshaper-option-parser
mapshaper-option-validation
mapshaper-chunker
*/

internal.getOptionParser = function() {
  // definitions of options shared by more than one command
  var targetOpt = {
        describe: "layer(s) to target (comma-sep. list)"
      },
      nameOpt = {
        describe: "rename the edited layer(s)"
      },
      noReplaceOpt = {
        alias: "+",
        type: 'flag',
        describe: "retain the original layer(s) instead of replacing"
      },
      noSnapOpt = {
        // describe: "don't snap points before applying command"
        type: 'flag'
      },
      encodingOpt = {
        describe: "text encoding (applies to .dbf and delimited text files)"
      },
      snapIntervalOpt = {
        describe: "snapping distance in source units (default is tiny)",
        type: "distance"
      },
      minGapAreaOpt = {
        describe: "smaller gaps than this are filled (default is small)",
        type: "area"
      },
      sumFieldsOpt = {
        describe: "fields to sum when dissolving  (comma-sep. list)",
        type: "strings"
      },
      copyFieldsOpt = {
        describe: "fields to copy when dissolving (comma-sep. list)",
        type: "strings"
      },
      dissolveFieldsOpt = {
        DEFAULT: true,
        type: "strings",
        describe: "(optional) field or fields to dissolve on (comma-sep. list)"
      },
      fieldTypesOpt = {
        describe: "type hints for csv source files, e.g. FIPS:str,STATE_FIPS:str",
        type: "strings"
      },
      stringFieldsOpt = {
        describe: "csv field(s) to import as strings, e.g. FIPS,ZIPCODE",
        type: "strings"
      },
      bboxOpt = {
        type: "bbox",
        describe: "comma-sep. bounding box: xmin,ymin,xmax,ymax"
      },
      whereOpt = {
        describe: "use a JS expression to select a subset of features"
      },
      whereOpt2 = {
        describe: "use a JS expression to filter lines (using A and B)"
      },
      eachOpt2 = {
        describe: "apply a JS expression to each line (using A and B)"
      },
      aspectRatioOpt = {
        describe: "aspect ratio as a number or range (e.g. 2 0.8,1.6 ,2)"
      },
      offsetOpt = {
        describe: "padding as distance or pct of h/w (single value or list)",
        type: "distance"
      };

  var parser = new CommandParser();
  parser.usage("Usage:  mapshaper -<command> [options] ...");

  /*
  parser.example("Fix minor topology errors, simplify to 10%, convert to GeoJSON\n" +
      "$ mapshaper states.shp snap -simplify 10% -o format=geojson");

  parser.example("Aggregate census tracts to counties\n" +
      "$ mapshaper tracts.shp -each \"CTY_FIPS=FIPS.substr(0, 5)\" -dissolve CTY_FIPS");
  */

  parser.note("Enter mapshaper -help <command> to view options for a single command");

  parser.section("I/O commands");

  parser.default('i');

  parser.command('i')
    .describe("input one or more files")
    .validate(validateInputOpts)
    .flag("multi_arg")
    .option("files", {
      DEFAULT: true,
      type: "strings",
      describe: "one or more files to import, or - to use stdin"
    })
    .option("combine-files", {
      describe: "import files to separate layers with shared topology",
      type: "flag"
    })
    .option("merge-files", {
      // describe: "merge features from compatible files into the same layer",
      type: "flag"
    })
    .option("no-topology", {
      describe: "treat each shape as topologically independent",
      type: "flag"
    })
    .option("precision", {
      describe: "coordinate precision in source units, e.g. 0.001",
      type: "number"
    })
    .option("snap", {
      type: 'flag',
      describe: "snap nearly identical points to fix minor topology errors"
    })
    .option("auto-snap", {alias_to: 'snap'})
    .option("snap-interval", snapIntervalOpt)
    .option("encoding", encodingOpt)
    /*
    .option("fields", {
      describe: "attribute fields to import (comma-sep.) (default is all fields)",
      type: "strings"
    }) */
    .option("id-field", {
      describe: "import Topo/GeoJSON id property to this field"
    })
    .option("string-fields", stringFieldsOpt)
    .option("field-types", fieldTypesOpt)
    .option("name", {
      describe: "Rename the imported layer(s)"
    })
    .option("geometry-type", {
      // undocumented; GeoJSON import rejects all but one kind of geometry
      // describe: "[GeoJSON] Import one kind of geometry (point|polygon|polyline)"
    })
    .option("json-path", {
      // describe: path to an array of data values
    })
    .option("csv-filter", {
      describe: "[CSV] JS expression for filtering records"
    })
    .option("csv-fields", {
      type: 'strings',
      describe: "[CSV] comma-sep. list of fields to import"
    });

  parser.command('o')
    .describe("output edited content")
    .validate(validateOutputOpts)
    .option('_', {
      label: "<file|directory>",
      describe: "(optional) name of output file or directory, - for stdout"
    })
    .option("format", {
      describe: "options: shapefile,geojson,topojson,json,dbf,csv,tsv,svg"
    })
    .option("target", targetOpt)
    .option("force", {
      describe: "allow overwriting input files",
      type: "flag"
    })
    .option("dry-run", {
      // describe: "do not output any files"
      type: "flag"
    })
    .option("ldid", {
      // describe: "language driver id of dbf file",
      type: "number"
    })
    .option("precision", {
      describe: "coordinate precision in source units, e.g. 0.001",
      type: "number"
    })
    .option("bbox-index", {
      describe: "export a .json file with bbox of each layer",
      type: 'flag'
    })
    .option("cut-table", {
      describe: "detach data attributes from shapes and save as a JSON file",
      type: "flag"
    })
    .option("drop-table", {
      describe: "remove data attributes from output",
      type: "flag"
    })
    .option("encoding", {
      describe: "(Shapefile/CSV) text encoding (default is utf8)"
    })
    .option("field-order", {
      describe: "(Shapefile/CSV) field-order=ascending sorts columns A-Z"
    })
    .option("id-field", {
      describe: "(Topo/GeoJSON/SVG) field to use for id property",
      type: "strings"
    })
    .option("bbox", {
      type: "flag",
      describe: "(Topo/GeoJSON) add bbox property"
    })
    .option("extension", {
      describe: "(Topo/GeoJSON) set file extension (default is \".json\")"
    })
    .option("prettify", {
      type: "flag",
      describe: "(Topo/GeoJSON) format output for readability"
    })
    .option("singles", {
      describe: "(TopoJSON) save each target layer as a separate file",
      type: "flag"
    })
    .option("quantization", {
      describe: "(TopoJSON) specify quantization (auto-set by default)",
      type: "integer"
    })
    .option("no-quantization", {
      describe: "(TopoJSON) export coordinates without quantization",
      type: "flag"
    })
    .option("no-point-quantization", {
      // describe: "(TopoJSON) export point coordinates without quantization",
      type: "flag"
    })
    .option('presimplify', {
      describe: "(TopoJSON) add per-vertex data for dynamic simplification",
      type: "flag"
    })
    .option("topojson-precision", {
      // describe: "pct of avg segment length for rounding (0.02 is default)",
      type: "number"
    })
    .option("rfc7946", {
      describe: "(GeoJSON) follow RFC 7946 (CCW outer ring order, etc.)",
      type: "flag"
    })
    .option("combine-layers", {
      describe: "(GeoJSON) output layers as a single file",
      type: "flag"
    })
    .option("geojson-type", {
      describe: "(GeoJSON) FeatureCollection, GeometryCollection or Feature"
    })
    .option("width", {
      describe: "(SVG/TopoJSON) pixel width of output (SVG default is 800)",
      type: "number"
    })
    .option("height", {
      describe: "(SVG/TopoJSON) pixel height of output (optional)",
      type: "number"
    })
    .option("max-height", {
      describe: "(SVG/TopoJSON) max pixel height of output (optional)",
      type: "number"
    })
    .option("margin", {
      describe: "(SVG/TopoJSON) space betw. data and viewport (default is 1)"
    })
    .option("pixels", {
      describe: "(SVG/TopoJSON) output area in pixels (alternative to width=)",
      type: "number"
    })
    .option("svg-scale", {
      describe: "(SVG) source units per pixel (alternative to width= option)",
      type: "number"
    })
    .option("point-symbol", {
      describe: "(SVG) circle or square (default is circle)"
    })
    .option("id-prefix", {
      describe: "(SVG) prefix for namespacing layer and feature ids"
    })
    .option("delimiter", {
      describe: "(CSV) field delimiter"
    })
    .option("final", {
      type: "flag" // for testing
    })
    .option("metadata", {
      // describe: "(TopoJSON) add a metadata object",
      type: "flag"
    });

  parser.section("Editing commands");

  parser.command("clean")
    .describe("repairs overlaps and small gaps in polygon layers")
    .option("min-gap-area", minGapAreaOpt)
    .option("snap-interval", snapIntervalOpt)
    .option("no-snap", noSnapOpt)
    .option("allow-empty", {
      describe: 'allow null geometries (removed by default)',
      type: 'flag'
    })
    .option("no-arc-dissolve", {
      type: 'flag' // no description
    })
    .option("target", targetOpt);

  parser.command("clip")
    .describe("use a polygon layer to clip another layer")
    .example("$ mapshaper states.shp -clip land_area.shp -o clipped.shp")
    .validate(validateClipOpts)
    .option("source", {
      DEFAULT: true,
      describe: "file or layer containing clip polygons"
    })
    .option('remove-slivers', {
      describe: "remove sliver polygons created by clipping",
      type: 'flag'
    })
    .option("cleanup", {type: 'flag'}) // obsolete; renamed in validation func.
    .option("bbox", bboxOpt)
    .option("name", nameOpt)
    .option("no-replace", noReplaceOpt)
    .option("no-snap", noSnapOpt)
    .option("target", targetOpt);

  parser.command("dissolve")
    .describe("merge features within a layer")
    .example("Dissolve all polygons in a feature layer into a single polygon\n" +
      "$ mapshaper states.shp -dissolve -o country.shp")
    .example("Generate state-level polygons by dissolving a layer of counties\n" +
      "(STATE_FIPS, POPULATION and STATE_NAME are attribute field names)\n" +
      "$ mapshaper counties.shp -dissolve STATE_FIPS copy-fields=STATE_NAME sum-fields=POPULATION -o states.shp")
    .option("field", {}) // old arg handled by dissolve function
    .option("fields", dissolveFieldsOpt)
    .option("calc", {
      describe: "use a JS expression to aggregate data values"
    })
    .option("sum-fields", sumFieldsOpt)
    .option("copy-fields", copyFieldsOpt)
    .option("weight", {
      describe: "[points] field or expression to use for weighting centroid"
    })
    .option("planar", {
      type: 'flag',
      describe: "[points] use 2D math to find centroids of latlong points"
    })
    .option("name", nameOpt)
    .option("no-replace", noReplaceOpt)
    .option("target", targetOpt);

  parser.command("dissolve2")
    .describe("merge adjacent polygons (repairs overlaps and gaps)")
    .option("field", {}) // old arg handled by dissolve function
    .option("fields", dissolveFieldsOpt)
    .option("calc", {
      describe: "use a JS expression to aggregate data values"
    })
    .option("sum-fields", sumFieldsOpt)
    .option("copy-fields", copyFieldsOpt)
    .option("min-gap-area", minGapAreaOpt)
    .option("name", nameOpt)
    .option("no-replace", noReplaceOpt)
    .option("no-snap", noSnapOpt)
    .option("target", targetOpt);

  parser.command("drop")
    .describe("delete layer(s) or elements within the target layer(s)")
    .flag('no_arg') // prevent trying to pass a list of layer names as default option
    .option("geometry", {
      describe: "delete all geometry from the target layer(s)",
      type: "flag"
    })
    .option("fields", {
      type: "strings",
      describe: "delete a list of attribute data fields, e.g. 'id,name' '*'"
    })
    .option("target", targetOpt);


  parser.command("each")
    .describe("create/update/delete data fields using a JS expression")
    .example("Add two calculated data fields to a layer of U.S. counties\n" +
        "$ mapshaper counties.shp -each 'STATE_FIPS=CNTY_FIPS.substr(0, 2), AREA=$.area'")
    .option("expression", {
      DEFAULT: true,
      describe: "JS expression to apply to each target feature"
    })
    .option("where", whereOpt)
    .option("target", targetOpt);

  parser.command("erase")
    .describe("use a polygon layer to erase another layer")
    .example("$ mapshaper land_areas.shp -erase water_bodies.shp -o erased.shp")
    .validate(validateClipOpts)
    .option("source", {
      DEFAULT: true,
      describe: "file or layer containing erase polygons"
    })
    .option('remove-slivers', {
      describe: "remove sliver polygons created by erasing",
      type: 'flag'
    })
    .option("cleanup", {type: 'flag'})
    .option("bbox", bboxOpt)
    .option("name", nameOpt)
    .option("no-replace", noReplaceOpt)
    .option("no-snap", noSnapOpt)
    .option("target", targetOpt);

  parser.command("explode")
    .describe("divide multi-part features into single-part features")
    .option("naive", {type: "flag"}) // testing
    .option("target", targetOpt);

  parser.command("filter")
    .describe("delete features using a JS expression")
    .option("expression", {
      DEFAULT: true,
      describe: "delete features that evaluate to false"
    })
    .option("remove-empty", {
      type: "flag",
      describe: "delete features with null geometry"
    })
    .option("keep-shapes", {
      type: "flag"
    })
    .option("cleanup", {type: 'flag'}) // TODO: document
    .option("name", nameOpt)
    .option("no-replace", noReplaceOpt)
    .option("target", targetOpt);

  parser.command("filter-fields")
    .describe('retain a subset of data fields')
    .option("fields", {
      DEFAULT: true,
      type: "strings",
      describe: "fields to retain (comma-sep.), e.g. 'fips,name'"
    })
    .option("target", targetOpt);

  parser.command("filter-geom")
    .describe("")
    .option("bbox", {
      type: "bbox",
      describe: "remove non-intersecting geometry (xmin,ymin,xmax,ymax)"
    })
    .option("target", targetOpt);

  parser.command("filter-islands")
    .describe("remove small detached polygon rings (islands)")
    .option("min-area", {
      type: "area",
      describe: "remove small-area islands (sq meters or projected units)"
    })
    .option("min-vertices", {
      type: "integer",
      describe: "remove low-vertex-count islands"
    })
    .option("remove-empty", {
      type: "flag",
      describe: "delete features with null geometry"
    })
    .option("target", targetOpt);

  parser.command("filter-slivers")
    .describe("remove small polygon rings")
    .option("min-area", {
      type: "area",
      describe: "remove small-area rings (sq meters or projected units)"
    })
    .option("weighted", {
      type: "flag",
      describe: "multiply min-area by Polsby-Popper compactness (0-1)"
    })
    /*
    .option("remove-empty", {
      type: "flag",
      describe: "delete features with null geometry"
    })
    */
    .option("target", targetOpt);

  parser.command("graticule")
    .describe("create a graticule layer");

  parser.command("innerlines")
    .describe("convert polygons to polylines along shared edges")
    .flag('no_arg')
    .option("where", whereOpt2)
    // .option("each", eachOpt2)
    .option("name", nameOpt)
    .option("no-replace", noReplaceOpt)
    .option("target", targetOpt);

  parser.command("intersect")
    // .describe("convert polygons to polylines along shared edges")
    .option("no-replace", noReplaceOpt)
    .option("target", targetOpt);

  parser.command("join")
    .describe("join data records from a file or layer to a layer")
    .example("Join a csv table to a Shapefile (don't auto-convert FIPS column to numbers)\n" +
      "$ mapshaper states.shp -join data.csv keys=STATE_FIPS,FIPS string-fields=FIPS -o joined.shp")
    .validate(function(cmd) {
      if (!cmd.options.source) {
        error("Command requires the name of a layer or file to join");
      }
    })
    .option("source", {
      DEFAULT: true,
      describe: "file or layer containing data records"
    })
    .option("keys", {
      describe: "join by matching target,source key fields; e.g. keys=FIPS,ID",
      type: "strings"
    })
    .option("calc", {
      describe: "use a JS expression to assign values in many-to-one joins"
    })
    .option("where", {
      describe: "use a JS expression to filter source records"
    })
    .option("fields", {
      describe: "fields to copy (comma-sep.) (default is all but key field)",
      type: "strings"
    })
    .option("string-fields", stringFieldsOpt)
    .option("field-types", fieldTypesOpt)
    .option("sum-fields", {
      describe: "fields to sum in a many-to-one join (or use calc= for this)",
      type: "strings"
    })
    .option("force", {
      describe: "replace values from same-named fields",
      type: "flag"
    })
    .option("unjoined", {
      describe: "copy unjoined records from source table to \"unjoined\" layer",
      type: "flag"
    })
    .option("unmatched", {
      describe: "copy unmatched records in target table to \"unmatched\" layer",
      type: "flag"
    })
    .option("encoding", encodingOpt)
    .option("target", targetOpt);

  parser.command("lines")
    .describe("convert polygons to polylines, classified by edge type")
    .option("fields", {
      DEFAULT: true,
      describe: "optional comma-sep. list of fields to create a hierarchy",
      type: "strings"
    })
    .option("where", whereOpt2)
    .option("each", eachOpt2)
    .option("name", nameOpt)
    .option("no-replace", noReplaceOpt)
    .option("target", targetOpt);

  parser.command("merge-layers")
    .describe("merge multiple layers into as few layers as possible")
    .flag('no_arg')
    .option("force", {
      type: "flag",
      describe: "merge layers with inconsistent data fields"
    })
    .option("name", nameOpt)
    .option("target", targetOpt);

  parser.command("mosaic")
    .option("debug", {type: "flag"})
    .option("target", targetOpt);

  parser.command("point-grid")
    .describe("create a rectangular grid of points")
    .validate(validateGridOpts)
    .option("-", {
      label: "<cols,rows>",
      describe: "size of the grid, e.g. -point-grid 100,100"
    })
    .option('interval', {
      describe: 'distance between adjacent points, in source units',
      type: 'distance'
    })
    .option("cols", {
      type: "integer"
    })
    .option("rows", {
      type: "integer"
    })
    .option('bbox', {
      type: "bbox",
      describe: "xmin,ymin,xmax,ymax (default is bbox of data)"
    })
    .option("name", nameOpt);

  parser.command("points")
    .describe("create a point layer from a different layer type")
    .flag("no_arg")
    .option("x", {
      describe: "field containing x coordinate"
    })
    .option("y", {
      describe: "field containing y coordinate"
    })
    .option("inner", {
      describe: "create an interior point for each polygon's largest ring",
      type: "flag"
    })
    .option("centroid", {
      describe: "create a centroid point for each polygon's largest ring",
      type: "flag"
    })
    .option("vertices", {
      describe: "capture unique vertices of polygons and polylines",
      type: "flag"
    })
    .option("vertices2", {
      describe: "like vertices, but without removal of duplicate coordinates",
      type: "flag"
    })
    .option("endpoints", {
      describe: "capture unique endpoints of polygons and polylines",
      type: "flag"
    })
    // WORK IN PROGRESS todo: create a point layer containing segment intersections
    .option("intersections", {
     // describe: "capture line segment intersections of polygons and polylines",
     type: "flag"
    })
    .option("interpolated", {
      describe: "interpolate points along polylines; requires interval=",
      type: "flag"
    })
    .option("interval", {
      describe: "distance between interpolated points (meters or projected units)",
      type: "distance"
    })
    .option("name", nameOpt)
    .option("no-replace", noReplaceOpt)
    .option("target", targetOpt);

  parser.command("polygon-grid")
    // .describe("create a rectangular grid of cells")
    .validate(validateGridOpts)
    .option("-", {
      label: "<cols,rows>",
      describe: "size of the grid, e.g. -point-grid 100,100"
    })
    .option('interval', {
      describe: 'distance between adjacent points, in source units',
      type: 'number'
    })
    .option("cols", {
      type: "integer"
    })
    .option("rows", {
      type: "integer"
    })
    .option('bbox', {
      type: "bbox",
      describe: "xmin,ymin,xmax,ymax (default is bbox of data)"
    })
    .option("name", nameOpt);

  parser.command("proj")
    .describe("project your data (using Proj.4)")
    .flag("multi_arg")
    .option("crs", {
      DEFAULT: true,
      describe: "set destination CRS using a Proj.4 definition or alias"
    })
    .option("projection", {
      alias_to: 'crs'
    })
    .option("match", {
      describe: "set destination CRS using a .prj file or layer id"
    })
    .option("source", {
      // describe: "(deprecated) alias for match",
      alias_to: "match"
    })
    .option("from", {
      describe: "set source CRS (if unset) using a string, .prj or layer id"
    })
    .option("densify", {
      type: "flag",
      describe: "add points along straight segments to approximate curves"
    })
    .option("target", targetOpt)
    .validate(validateProjOpts);

  parser.command("rename-fields")
    .describe('rename data fields')
    .option("fields", {
      DEFAULT: true,
      type: "strings",
      describe: "fields to rename (comma-sep.), e.g. 'fips=STATE_FIPS,st=state'"
    })
    .option("target", targetOpt);

  parser.command("rename-layers")
    .describe("assign new names to layers")
    .option("names", {
      DEFAULT: true,
      type: "strings",
      describe: "new layer name(s) (comma-sep. list)"
    })
    .option("target", targetOpt);

  parser.command("simplify")
    .validate(validateSimplifyOpts)
    .example("Retain 10% of removable vertices\n$ mapshaper input.shp -simplify 10%")
    .describe("simplify the geometry of polygon and polyline features")
    .option('percentage', {
      DEFAULT: true,
      alias: 'p',
      type: 'percent',
      describe: "percentage of removable points to retain, e.g. 10%"
    })
    .option("dp", {
      alias: "rdp",
      describe: "use Ramer-Douglas-Peucker simplification",
      assign_to: "method"
    })
    .option("visvalingam", {
      describe: "use Visvalingam simplification with \"effective area\" metric",
      assign_to: "method"
    })
    .option("weighted", {
      describe: "use weighted Visvalingam simplification (default)",
      assign_to: "method"
    })
    .option("method", {
      // hidden option
    })
    .option("weighting", {
      type: "number",
      describe: "weighted Visvalingam coefficient (default is 0.7)"
    })
    .option("resolution", {
      describe: "output resolution as a grid (e.g. 1000x500)"
    })
    .option("interval", {
      // alias: "i",
      describe: "output resolution as a distance (e.g. 100)",
      type: "distance"
    })
    /*
    .option("value", {
      // for testing
      // describe: "raw value of simplification threshold",
      type: "number"
    })
    */
    .option("variable", {
      describe: "expect an expression with interval=, percentage= or resolution=",
      type: "flag"
    })
    .option("planar", {
      describe: "simplify decimal degree coords in 2D space (default is 3D)",
      type: "flag"
    })
    .option("cartesian", {
      // describe: "(deprecated) alias for planar",
      alias_to: "planar"
    })
    .option("keep-shapes", {
      describe: "prevent small polygon features from disappearing",
      type: "flag"
    })
    .option("lock-box", {
      // describe: "don't remove vertices along bbox edges"
      type: "flag"
    })
    .option("no-repair", {
      describe: "don't remove intersections introduced by simplification",
      type: "flag"
    })
    .option("stats", {
      describe: "display simplification statistics",
      type: "flag"
    })
    .option("target", targetOpt);


  parser.command("slice")
    // .describe("slice a layer using polygons in another layer")
    .option("source", {
      DEFAULT: true,
      describe: "file or layer containing clip polygons"
    })
    /*
    .option('remove-slivers', {
      describe: "remove sliver polygons created by clipping",
      type: 'flag'
    }) */
    .option("id-field", {
      describe: "slice id field (from source layer)"
    })
    .option("name", nameOpt)
    .option("no-replace", noReplaceOpt)
    .option("no-snap", noSnapOpt)
    .option("target", targetOpt);

  parser.command("sort")
    .describe("sort features using a JS expression")
    .option("expression", {
      DEFAULT: true,
      describe: "JS expression to generate a sort key for each feature"
    })
    .option("ascending", {
      describe: "sort in ascending order (default)",
      type: "flag"
    })
    .option("descending", {
      describe: "sort in descending order",
      type: "flag"
    })
    .option("target", targetOpt);

  parser.command("split")
    .describe("split features into separate layers using a data field")
    .option("field", {
      DEFAULT: true,
      describe: "name of an attribute field (omit to split all features)"
    })
    .option("no-replace", noReplaceOpt)
    .option("target", targetOpt);

  parser.command("split-on-grid")
    .describe("split features into separate layers using a grid")
    .validate(validateGridOpts)
    .option("-", {
      label: "<cols,rows>",
      describe: "size of the grid, e.g. -split-on-grid 12,10"
    })
    .option("cols", {
      type: "integer"
    })
    .option("rows", {
      type: "integer"
    })
    .option("id-field", {
      describe: "assign each feature a cell id instead of splitting layer"
    })
    // .option("no-replace", noReplaceOpt)
    .option("target", targetOpt);

  parser.command("style")
    .oldAlias("svg-style")
    .describe("set SVG style properties using JS or literal values")
    .option("where", whereOpt)
    .option("class", {
      describe: 'name of CSS class or classes (space-separated)'
    })
    .option("fill", {
      describe: 'fill color; examples: #eee pink rgba(0, 0, 0, 0.2)'
    })
    .option("stroke", {
      describe: 'stroke color'
    })
    .option("stroke-width", {
      describe: 'stroke width'
    })
    .option("stroke-dasharray", {
      describe: 'stroke dashes. Examples: "4" "2 4"'
    })
    .option("opacity", {
      describe: 'opacity; example: 0.5'
    })
    .option("r", {
      describe: 'symbol radius (set this to export points as circles)',
    })
    .option("label-text", {
      describe: 'label text (set this to export points as labels)'
    })
    .option("point-text", {
      describe: 'point symbol text (a text symbol replaces path or circle)'
    })
    .option("text-anchor", {
      describe: 'label alignment; one of: start, end, middle (default)'
    })
    .option("dx", {
      describe: 'x offset of labels (default is 0)'
    })
    .option("dy", {
      describe: 'y offset of labels (default is 0/baseline-aligned)'
    })
    .option("font-size", {
      describe: 'size of label text (default is 12)'
    })
    .option("font-family", {
      describe: 'CSS font family of labels (default is sans-serif)'
    })
    .option("font-weight", {
      describe: 'CSS font weight property of labels (e.g. bold, 700)'
    })
    .option("font-style", {
      describe: 'CSS font style property of labels (e.g. italic)'
    })
     .option("letter-spacing", {
      describe: 'CSS letter-spacing property of labels'
    })
     .option("line-height", {
      describe: 'line spacing of multi-line labels (default is 1.1em)'
    })
   .option("target", targetOpt);

  parser.command("target")
    .describe("set active layer (or layers)")
    .option("target", {
      DEFAULT: true,
      describe: "name or index of layer to target"
    })
    .option('type', {
      describe: "type of layer to target (polygon|polyline|point)"
    })
    .option("name", {
      describe: 'rename the target layer'
    });

  parser.command("uniq")
    .describe("delete features with the same id as a previous feature")
    .option("expression", {
      DEFAULT: true,
      describe: "JS expression to obtain the id of a feature"
    })
    .option("max-count", {
      type: "number",
      describe: "max features with the same id (default is 1)"
    })
    .option("invert", {
      type: "flag",
      describe: "retain only features that would have been deleted"
    })
    .option("verbose", {
      describe: "print each removed feature",
      type: "flag"
    })
    .option("target", targetOpt);


  // Experimental commands
  parser.section("Experimental commands (may give unexpected results)");

  parser.command("affine")
    .describe("transform coordinates by shifting, scaling and rotating")
    .flag("no_args")
    .option("shift", {
      type: 'strings',
      describe: "x,y offsets in source units (e.g. 5000,-5000)"
    })
    .option("scale", {
      type: 'number',
      describe: "scale (default is 1)"
    })
    .option("rotate", {
      type: 'number',
      describe: "angle of rotation in degrees (default is 0)"
    })
    .option("anchor", {
      type: 'numbers',
      describe: "center of rotation/scaling (default is center of selected shapes)"
    })
    .option("where", whereOpt)
    .option("target", targetOpt);

  parser.command("cluster")
    .describe("group polygons into compact clusters")
    .option("id-field", {
      describe: "field name of cluster id (default is \"cluster\")"
    })
    .option('pct', {
      alias: 'p',
      type: 'percent',
      describe: "percentage of shapes to retain, e.g. 50%"
    })
    .option("max-width", {
      describe: "max width of cluster bounding box",
      type: "number"
    })
    .option("max-height", {
      describe: "max height of cluster bounding box",
      type: "number"
    })
    .option("max-area", {
      describe: "max area of a cluster",
      type: "number"
    })
    .option("group-by", {
      describe: "field name; only same-value shapes will be grouped"
    })
    .option("target", targetOpt);

  parser.command("colorizer")
    .describe("define a function to convert data values to color classes")
    .flag("no_arg")
    .option("colors", {
      describe: "comma-separated list of CSS colors",
      type: "colors"
    })
    .option("breaks", {
      describe: "ascending-order list of breaks for sequential color scheme",
      type: "numbers"
    })
    .option("categories", {
      describe: "comma-sep. list of keys for categorical color scheme",
      type: "strings"
    })
    .option("other", {
      describe: "default color for categorical scheme (defaults to no-data color)"
    })
    .option("nodata", {
      describe: "color to use for invalid or missing data (default is white)"
    })
    .option("name", {
      describe: "function name to use in -each and -svg-style commands"
    })
    .option("precision", {
      describe: "rounding precision to apply before classification (e.g. 0.1)",
      type: "number"
    })
    .example('Define a sequential color scheme and use it to create a new field\n' +
        '$ mapshaper data.json -colorizer name=getColor nodata=#eee breaks=20,40 \\\n' +
        '  colors=#e0f3db,#a8ddb5,#43a2ca -each "fill = getColor(RATING)" -o output.json');

  parser.command("data-fill")
    // .describe("interpolate missing values by copying from neighbor polygons")
    .option("field", {
      describe: "name of field to fill out"
    })
    .option("postprocess", {
      describe: "remove data islands",
      type: "flag"
    });

  parser.command("frame")
    // .describe("create a map frame at a given size")
    .option("bbox", {
      describe: "frame coordinates (xmin,ymin,xmax,ymax)",
      type: "bbox"
    })
    .option("offset", offsetOpt)
    .option("width", {
      describe: "pixel width of output (default is 800)"
    })
    .option("height", {
      describe: "pixel height of output (may be a range)"
    })
    .option("pixels", {
      describe: "area of output in pixels (alternative to width and height)",
      type: "number"
    })
    .option("source", {
      describe: "name of layer to enclose"
    })
    .option("name", nameOpt);

  parser.command("include")
    .describe("import JS data and functions for use in JS expressions")
    .option("file", {
      DEFAULT: true,
      describe: 'file containing a JS object with key:value pairs to import'
    });

  parser.command("fuzzy-join")
    .describe("join points to polygons, with data fill and fuzzy match")
    .option("source", {
      DEFAULT: true,
      describe: "file or layer containing data records"
    })
    .option("field", {
      describe: "field to join"
    })
    .option("dedup-points", {
      describe: "uniqify points with the same location and field value",
      type: "flag"
    })
    .option("target", targetOpt);

  parser.command("polygons")
    .describe("convert polylines to polygons")
    .option("gap-tolerance", {
      describe: "specify gap tolerance in source units",
      type: "distance"
    })
    .option("target", targetOpt);

  parser.command("rectangle")
    .describe("create a rectangle from a bbox or target layer extent")
    .option("bbox", {
      describe: "rectangle coordinates (xmin,ymin,xmax,ymax)",
      type: "bbox"
    })
    .option("offset", offsetOpt)
    .option("aspect-ratio", aspectRatioOpt)
    .option("source", {
      describe: "name of layer to enclose"
    })
    .option("name", nameOpt)
    .option("no-replace", noReplaceOpt)
    .option("target", targetOpt);

  parser.command("rectangles")
    .describe("create a rectangle around each feature in the target layer")
    .option("offset", offsetOpt)
    .option("aspect-ratio", aspectRatioOpt)
    .option("name", nameOpt)
    .option("no-replace", noReplaceOpt)
    .option("target", targetOpt);

  parser.command("require")
    .describe("require a Node module for use in -each expressions")
    .option("module", {
      DEFAULT: true,
      describe: "name of Node module or path to module file"
    })
    .option("alias", {
      describe: "Set the module name to an alias"
    })
    .option("init", {
      describe: "JS expression to run after the module loads"
    });

  parser.command("run")
    .describe("create commands on-the-fly and run them")
    .option("include", {
      // TODO: remove this option
    })
    .option("commands", {
      DEFAULT: true,
      describe: "command string or JS expresson to generate command(s)"
    })
    .option("target", targetOpt);

  parser.command("scalebar")
    // .describe()
    .option("top", {})
    .option("right", {})
    .option("bottom", {})
    .option("left", {})
    .option("font-size", {})
    // .option("font-family", {})
    .option("label-position", {}) // top or bottom
    .option("label-text", {});

  parser.command("shape")
    .describe("create a polyline or polygon from coordinates")
    .option("coordinates", {
      describe: "list of vertices as x,y,x,y...",
      type: "numbers"
    })
    .option("offsets", {
      describe: "list of vertices as offsets from coordinates list",
      type: "numbers"
    })
    .option("closed", {
      describe: "close an open path to create a polygon",
      type: "flag"
    })
    .option("name", nameOpt);

  parser.command("subdivide")
    .describe("recursively split a layer using a JS expression")
    .validate(validateExpressionOpt)
    .option("expression", {
      DEFAULT: true,
      describe: "boolean JS expression"
    })
    .option("target", targetOpt);


  parser.section("Informational commands");

  parser.command("calc")
    .describe("calculate statistics about the features in a layer")
    .example("Calculate the total area of a polygon layer\n" +
      "$ mapshaper polygons.shp -calc 'sum($.area)'")
    .example("Count census blocks in NY with zero population\n" +
      "$ mapshaper ny-census-blocks.shp -calc 'count()' where='POPULATION == 0'")
    .validate(validateExpressionOpt)
    .option("expression", {
      DEFAULT: true,
      describe: "functions: sum() average() median() max() min() count()"
    })
    .option("where", whereOpt)
    .option("target", targetOpt);

  parser.command('encodings')
    .describe("print list of supported text encodings (for .dbf import)");

  parser.command('help')
    .alias('h')
    .describe("print help; takes optional command name")
    .option("command", {
      DEFAULT: true,
      describe: "view detailed information about a command"
    });

  parser.command('info')
    .describe("print information about data layers");

  parser.command('inspect')
    .describe("print information about a feature")
    .option("expression", {
      DEFAULT: true,
      describe: "boolean JS expression for selecting a feature"
    })
    .option("target", targetOpt)
    .validate(validateExpressionOpt);

  parser.command('projections')
    .describe("print list of supported projections");

  parser.command('quiet')
    .describe("inhibit console messages");

  parser.command('verbose')
    .describe("print verbose processing messages");

  parser.command('version')
    .alias('v')
    .describe("print mapshaper version");

  parser.command('debug');

  /*
  parser.command("divide")
    .option("name", nameOpt)
    .option("no-replace", noReplaceOpt)
    .option("target", targetOpt);

  parser.command("fill-holes")
    .option("no-replace", noReplaceOpt)
    .option("target", targetOpt);
  */

  return parser;
};
