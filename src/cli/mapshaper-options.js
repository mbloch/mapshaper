/* @requires mapshaper-common, mapshaper-option-parser, mapshaper-option-validation */

api.parseCommands = function(arr) {
  var commands;
 try {
    commands = MapShaper.getOptionParser().parseArgv(arr);
  } catch(e) {
    stop(e.message);
  }
  return commands;
};

MapShaper.getOptionParser = function() {
  var parser = new CommandParser(),
      usage = "Usage: mapshaper -i input-file(s) [input-options] [command [command-options]] ...\n" +
              "       mapshaper -help|encodings|version";
  parser.usage(usage);

  parser.example("Fix minor topology errors, simplify to 10%, convert to GeoJSON\n" +
      "$ mapshaper -i states.shp auto-snap -simplify 10% -o format=geojson");

  parser.example("Aggregate census tracts to counties\n" +
      "$ mapshaper -i tracts.shp -each \"CTY_FIPS=FIPS.substr(0, 5)\" -dissolve CTY_FIPS");

  parser.command('i')
    .title("Commands and command options")
    .describe("input one or more files")
    .validate(validateInputOpts)
    .option("merge-files", {
      describe: "merge similar input layers, like -merge-layers",
      type: "flag"
    })
    .option("combine-files", {
      describe: "import files to separate layers with shared topology",
      type: "flag"
    })
    .option("no-topology", {
      describe: "treat each shape as topologically independent",
      type: "flag"
    })
    .option("precision", {
      describe: "coordinate precision in source units",
      type: "number"
    })
    .option("auto-snap", {
      describe: "snap nearly identical points to fix minor topology errors",
      type: "flag"
    })
    .option("snap-interval", {
      describe: "specify snapping distance in source units",
      type: "number"
    })
    .option("encoding", {
      describe: "text encoding of .dbf file"
    });

  parser.command('o')
    .describe("specify name of output file or directory")
    .validate(validateOutputOpts)
    .option("format", {
      describe: "set export format (shapefile|geojson|topojson)"
    })
    /*
    .option("encoding", {
      describe: "text encoding of .dbf file"
    })*/
    .option("quantization", {
      describe: "specify TopoJSON quantization (auto-set by default)",
      type: "integer"
    })
    .option("no-quantization", {
      describe: "export TopoJSON without quantization",
      type: "flag"
    })
    .option("topojson-precision", {
      // describe: "pct of avg segment length for rounding (0.02 is default)",
      type: "number"
    })
    .option("id-field", {
      describe: "field to use for TopoJSON id property"
    })
    .option("bbox", {
      type: "flag",
      describe: "add bbox property to TopoJSON or GeoJSON output"
    })
    .option("cut-table", {
      describe: "detach attributes from shapes and save as a JSON file",
      type: "flag"
    })
    .option("bbox-index", {
      describe: "export table of layer bounding boxes",
      type: 'flag'
    })
    .option("target");


  parser.command('simplify')
    .validate(validateSimplifyOpts)
    .describe("simplify the geometry of polygon or polyline features")
    .option("dp", {
      alias: "rdp",
      describe: "use (Ramer-)Douglas-Peucker simplification",
      assign_to: "method"
    })
    .option("visvalingam", {
      describe: "use Visvalingam simplification",
      assign_to: "method"
    })
    .option("method", {
      // hidden option
    })
    .option("interval", {
      alias: "i",
      describe: "simplification resolution in linear units",
      type: "number"
    })
    .option("pct", {
      alias: "p",
      describe: "proportion of removable points to retain (0-1)"
    })
    .option("cartesian", {
      describe: "simplify decimal degree coords in 2D space (default is 3D)",
      type: "flag"
    })
    .option("keep-shapes", {
      describe: "prevent small shapes from disappearing",
      type: "flag"
    })
    .option("no-repair", {
      describe: "don't remove intersections introduced by simplification",
      type: "flag"
    });

  parser.command("filter")
    .describe("filter features with a boolean JavaScript expression")
    .validate(validateFilterOpts)
    .option("expression")
    .option("target");

  parser.command("fields")
    .describe('select and rename data fields, e.g. "fips,st=state"')
    .validate(validateFieldsOpts)
    .option("target");

  /*
  parser.command("layers")
    .describe('filter and rename layers, e.g. "layer1=counties,layer2=1"')
    .validate(validateLayersOpts);
  */

  parser.command("each")
    .describe("create/update/delete data fields with a JS expression")
    .option("expression")
    .option("target");

  parser.command("expression")
    .alias('e')
    .validate(function() {
      error("-expression has been named as -each");
    });

  parser.command("join")
    .describe("join a dbf or delimited text file to the input features")
    .validate(validateJoinOpts)
    .option("keys", {
      describe: "local,foreign keys, e.g. keys=FIPS,CNTYFIPS:str",
      type: "comma-sep"
    })
    .option("fields", {
      describe: "fields to join, e.g. fields=FIPS:str,POP (default is all)",
      type: "comma-sep"
    })
    .option("where", {
      describe: "use a JS expression to filter records from source table"
    })
    .option("target");

  parser.command("explode")
    .describe("divide multipart features into single-part features")
    .option("target");

  parser.command("divide")
    // .describe("divide multipart features into single-part features")
    .option("name")
    .option("no-replace", {alias: "+", type: "flag"})
    .option("target");

  parser.command("dissolve")
    .describe("dissolve polygons; takes optional comma-sep. list of fields")
    .validate(validateDissolveOpts)
    .option("sum-fields", {
      describe: "fields to sum when dissolving  (comma-sep. list)",
      type: "comma-sep"
    })
    .option("copy-fields", {
      describe: "fields to copy when dissolving (comma-sep. list)",
      type: "comma-sep"
    })
    .option("field")
    .option("name")
    .option("no-replace", {alias: "+", type: "flag"})
    .option("target");

  parser.command("lines")
    .describe("convert polygons to lines; takes optional list of fields")
    .validate(validateLinesOpts)
    .option("name")
    .option("fields", {
      type: "comma-sep"
    })
    .option("no-replace", {alias: "+", type: "flag"})
    .option("target");

  parser.command("innerlines")
    .describe("output polyline layers containing shared polygon boundaries")
    .validate(validateInnerLinesOpts)
    .option("name")
    .option("no-replace", {alias: "+", type: "flag"})
    .option("target");
/*
  parser.command("points")
    .option("name")
    .option("no-replace", {alias: "+", type: "flag"})
    .option("target")
    .option("type", {
      type: "set",
      values: ["centroids", "vertices", "intersections", "anchors"]
    })
*/

  parser.command("split")
    .describe("split features on a data field")
    .validate(validateSplitOpts)
    .option("field")
    .option("no-replace", {alias: "+", type: "flag"})
    .option("target");

  parser.command("subdivide")
    .describe("recursively divide a layer with a boolean JS expression")
    .validate(validateSubdivideOpts)
    .option("expression")
    // .option("no-replace", {alias: "+", type: "flag"})
    .option("target");

  parser.command("split-on-grid")
    .describe("split layer into cols,rows  e.g. -split-on-grid 12,10")
    .validate(validateSplitOnGridOpts)
    .option("cols", {
      type: "integer"
    })
    .option("rows", {
      type: "integer"
    })
    // .option("no-replace", {alias: "+", type: "flag"})
    .option("target");

  parser.command("merge-layers")
    .describe("merge split-apart layers back into a single layer")
    .validate(validateMergeLayersOpts)
    .option("name")
    .option("target");

  parser.command("*")
    .title("Options for multiple commands")
    .option("target", {
      describe: "layer(s) to target (comma-sep., takes * wildcard, default: *)"
    })
    .option("name", {
      describe: "rename the targeted layer(s)"
    })
    .option("no-replace", { // or maybe "add-layer",
      alias: "+",
      type: 'flag',
      describe: "retain the original layer(s) instead of replacing"
    });

  parser.command('encodings')
    .title("Informational commands")
    .describe("print list of supported text encodings (for .dbf import)");

  parser.command('info')
    .describe("print information about current data layers");

  parser.command('verbose')
    .describe("print verbose processing messages");

  parser.command('version')
    .alias('v')
    .describe("print mapshaper version");

  parser.command('help')
    .alias('h')
    .describe("print this help message");

  return parser;
};
