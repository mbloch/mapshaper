/* @requires mapshaper-common, mapshaper-option-parser, mapshaper-option-validation */

api.parseCommands = function(arr) {
  var commands;
 try {
    commands = MapShaper.getOptionParser().parseArgv(arr);
    if (commands.length === 0) error("Missing an input file");
  } catch(e) {
    stop(e.message);
  }
  return commands;
};

MapShaper.getOptionParser = function() {
  // definitions of options shared by more than one command
  var targetOpt = {
        describe: "layer(s) to target (comma-sep. list); default is all layers"
      },
      nameOpt = {
        describe: "rename the edited layer(s)"
      },
      noReplaceOpt = {
        alias: "+",
        type: 'flag',
        describe: "retain the original layer(s) instead of replacing"
      },
      encodingOpt = {
        describe: "text encoding of .dbf file"
      },
      autoSnapOpt = {
        describe: "snap nearly identical points to fix minor topology errors",
        type: "flag"
      },
      snapIntervalOpt = {
        describe: "specify snapping distance in source units",
        type: "number"
      },
      sumFieldsOpt = {
        describe: "fields to sum when dissolving  (comma-sep. list)",
        type: "comma-sep"
      },
      copyFieldsOpt = {
        describe: "fields to copy when dissolving (comma-sep. list)",
        type: "comma-sep"
      },
      dissolveFieldOpt = {
        label: "<field>",
        describe: "(optional) name of a data field to dissolve on"
      };

  var parser = new CommandParser(),
      usage = "Usage\n" +
    "  mapshaper [-i] input-file(s) [input-options] [-command [options]] ...\n" +
    "  mapshaper -h [command(s)]\n" +
    "  mapshaper -encodings|version";
  parser.usage(usage);

  parser.example("Fix minor topology errors, simplify to 10%, convert to GeoJSON\n" +
      "$ mapshaper states.shp auto-snap -simplify 10% -o format=geojson");

  parser.example("Aggregate census tracts to counties\n" +
      "$ mapshaper tracts.shp -each \"CTY_FIPS=FIPS.substr(0, 5)\" -dissolve CTY_FIPS");

  parser.example("Use mapshaper -help <command> to view options for a single command");

  parser.default('i');

  parser.command('i')
    .title("Editing commands")
    .describe("input one or more files")
    .validate(validateInputOpts)
    .option("files", {
      label: "<file(s)>",
      describe: "file or files to import (separated by spaces)"
    })
    .option("merge-files", {
      describe: "merge features from compatible files into the same layer",
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
      describe: "coordinate precision in source units, e.g. 0.001",
      type: "number"
    })
    .option("auto-snap", autoSnapOpt)
    .option("snap-interval", snapIntervalOpt)
    .option("encoding", encodingOpt)
    .option("id-field", {
      describe: "import Topo/GeoJSON id property to this field"
    });

  parser.command('o')
    .describe("output edited content")
    .validate(validateOutputOpts)
    .option('_', {
      label: "<file|directory>",
      describe: "(optional) name of output file or directory"
    })
    .option("format", {
      describe: "set export format (shapefile|geojson|topojson)"
    })
    /*
    .option("encoding", {
      describe: "text encoding of .dbf file"
    })*/
    .option("bbox", {
      type: "flag",
      describe: "add bbox property to TopoJSON or GeoJSON output"
    })
    .option("bbox-index", {
      describe: "export a .json file with bbox of each layer",
      type: 'flag'
    })
    .option("cut-table", {
      describe: "detach attributes from shapes and save as a JSON file",
      type: "flag"
    })
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
      describe: "field to use for Topo/GeoJSON id property"
    })

    .option("target", targetOpt);

  parser.command('simplify')
    .validate(validateSimplifyOpts)
    .describe("simplify the geometry of polygon and polyline features")
    .option('pct', {
      alias: 'p',
      label: "<x%>",
      describe: "percentage of removable points to retain, e.g. 10%"
    })
    .option("dp", {
      alias: "rdp",
      describe: "use (Ramer-)Douglas-Peucker simplification",
      assign_to: "method"
    })
    .option("visvalingam", {
      describe: "use Visvalingam simplification with \"effective area\" metric",
      assign_to: "method"
    })
    .option("method", {
      // hidden option
    })
    .option("interval", {
      // alias: "i",
      describe: "target resolution in linear units (alternative to %)",
      type: "number"
    })
    .option("cartesian", {
      describe: "simplify decimal degree coords in 2D space (default is 3D)",
      type: "flag"
    })
    .option("keep-shapes", {
      describe: "prevent small polygon features from disappearing",
      type: "flag"
    })
    .option("no-repair", {
      describe: "don't remove intersections introduced by simplification",
      type: "flag"
    });

  parser.command("join")
    .describe("join a dbf or delimited text file to the input features")
    .validate(validateJoinOpts)
    .option("source", {
      label: "<file>",
      describe: "file containing data records"
    })
    .option("keys", {
      describe: "target,source keys, e.g. keys=FIPS,CNTYFIPS:str",
      type: "comma-sep"
    })
    .option("fields", {
      describe: "fields to join, e.g. fields=FIPS:str,POP (default is all)",
      type: "comma-sep"
    })
    .option("where", {
      describe: "use a JS expression to filter records from source table"
    })
    .option("encoding", encodingOpt)
    .option("target", targetOpt);

  parser.command("each")
    .describe("create/update/delete data fields using a JS expression")
    .validate(validateExpressionOpts)
    .option("expression", {
      label: "<expression>",
      describe: "JS expression to apply to each target feature"
    })
    .option("target", targetOpt);

  parser.command("filter")
    .describe("filter features using a JavaScript expression")
    .validate(validateExpressionOpts)
    .option("expression", {
      label: "<expression>",
      describe: "boolean JS expression applied to each feature"
    })
    .option("target", targetOpt);

  parser.command("filter-fields")
    .describe('filter and rename data fields, e.g. "fips,st=state"')
    .validate(validateFilterFieldsOpts)
    .option("fields", {
      label: "<field(s)>",
      describe: "comma-sep. list of fields to retain"
    })
    .option("target", targetOpt);

  parser.command("clip")
    .describe("use a polygon layer to clip another polygon layer")
    .validate(validateClip)
    .option("source", {
      label: "<file|layer>",
      describe: "file or layer containing clip polygons"
    })
    .option("name", nameOpt)
    .option("no-replace", noReplaceOpt)
    .option("target", targetOpt);

  parser.command("erase")
    .describe("use a polygon layer to erase another polygon layer")
    .validate(validateClip)
    .option("source", {
      label: "<file|layer>",
      describe: "file or layer containing erase polygons"
    })
    .option("name", nameOpt)
    .option("no-replace", noReplaceOpt)
    .option("target", targetOpt);

  parser.command("dissolve")
    .validate(validateDissolveOpts)
    .describe("merge adjacent polygons")
    .option("field", dissolveFieldOpt)
    .option("sum-fields", sumFieldsOpt)
    .option("copy-fields", copyFieldsOpt)
    .option("name", nameOpt)
    .option("no-replace", noReplaceOpt)
    .option("target", targetOpt);

  parser.command("dissolve2")
    .validate(validateDissolveOpts)
    // .describe("merge adjacent and overlapping polygons")
    .option("field", dissolveFieldOpt)
    .option("sum-fields", sumFieldsOpt)
    .option("copy-fields", copyFieldsOpt)
    .option("name", nameOpt)
    .option("no-replace", noReplaceOpt)
    .option("target", targetOpt);

  parser.command("explode")
    .describe("separate multi-part features into single-part features")
    .option("convert-holes", {type: "flag"}) // testing
    .option("target", targetOpt);

  parser.command("lines")
    .describe("convert polygons to classified polylines")
    .validate(validateLinesOpts)
    .option("fields", {
      label: "<field(s)>",
      describe: "optional comma-sep. list of fields to create a hierarchy",
      type: "comma-sep"
    })
    .option("name", nameOpt)
    .option("no-replace", noReplaceOpt)
    .option("target", targetOpt);

  parser.command("innerlines")
    .describe("convert polygons to polylines along shared boundaries")
    .validate(validateInnerLinesOpts)
    .option("name", nameOpt)
    .option("no-replace", noReplaceOpt)
    .option("target", targetOpt);

  parser.command("split")
    .describe("split features on a data field")
    .validate(validateSplitOpts)
    .option("field", {
      label: '<field>',
      describe: "name of an attribute field"
    })
    .option("no-replace", noReplaceOpt)
    .option("target", targetOpt);

  parser.command("merge-layers")
    .describe("merge split-apart layers back into a single layer")
    .validate(validateMergeLayersOpts)
    .option("name", nameOpt)
    .option("target", targetOpt);

  parser.command("subdivide")
    .describe("recursively split a layer using a JS expression")
    .validate(validateSubdivideOpts)
    .option("expression", {
      label: "<expression>",
      describe: "boolean JS expression"
    })
    // .option("no-replace", noReplaceOpt)
    .option("target", targetOpt);

  parser.command("split-on-grid")
    .describe("split features into separate layers according to a grid")
    .validate(validateSplitOnGridOpts)
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
    // .option("no-replace", noReplaceOpt)
    .option("target", targetOpt);

  parser.command('encodings')
    .title("\nInformational commands")
    .describe("print list of supported text encodings (for .dbf import)");

  parser.command('version')
    .alias('v')
    .describe("print mapshaper version");

  parser.command('info')
    .describe("print information about data layers");

  parser.command('verbose')
    .describe("print verbose processing messages");

  parser.command('help')
    .alias('h')
    .validate(validateHelpOpts)
    .describe("print help; takes optional comma-sep. list of command names")
    .option("commands");

  // trap v0.1 options
  ("f,format,p,e,expression,pct,i,visvalingam,dp,rdp,interval,merge-files,combine-files," +
  "fields,precision,auto-snap").split(',')
    .forEach(function(str) {
      parser.command(str).validate(function() {
        error(Utils.format('[%s] maphshaper syntax has changed since v0.1.x.', str));
      });
    });

  // Work-in-progress (no .describe(), so hidden from -h)
  parser.command('tracing');
  parser.command("flatten")
    .option("target", targetOpt);
  /*

  parser.command("divide")
    .option("name", nameOpt)
    .option("no-replace", noReplaceOpt)
    .option("target", targetOpt);

  parser.command("fill-holes")
    .option("no-replace", noReplaceOpt)
    .option("target", targetOpt);

  parser.command("repair")
    .option("target", targetOpt);


  parser.command("points")
    .option("name", nameOpt)
    .option("no-replace", noReplaceOpt)
    .option("target", targetOpt)
    .option("type", {
      type: "set",
      values: ["centroids", "vertices", "intersections", "anchors"]
    })
  */

  /*
  parser.command("filter-layers")
    .describe('filter and rename layers, e.g. "layer1=counties,layer2=1"')
    .validate(validateLayersOpts);
  */

  return parser;
};
