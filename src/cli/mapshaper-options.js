/* @requires mapshaper-common, mapshaper-option-parser, mapshaper-option-validation */

api.getCommands = function() {
  var commands;
 try {
    commands = MapShaper.getOptionParser().parseArgv(process.argv.slice(2));
    commands = MapShaper.validateCommandSequence(commands);
  } catch(e) {
    stop('Error: ' + e.message + '\n(Use -h option to view help)');
  }
  return commands;
};

MapShaper.getOptionParser = function() {
  var parser = new CommandParser(),
      usage = "Usage: mapshaper [commands]\n" +
        "\n" +
        "Example: fix minor topology errors, simplify to 10%, convert to geojson\n" +
        "$ mapshaper -i states.shp auto-snap -simplify pct=0.1 -o geojson\n" +
        "\n" +
        "Example: aggregate census tracts to counties\n" +
        "$ mapshaper -i tracts.shp -calc 'CTY_FIPS=FIPS.substr(0, 5)' -dissolve CTY_FIPS\n";

  parser.usage(usage);

  parser.command('i')
    .title("Commands and options")
    .describe("input one or more files")
    .validate(validateInputOpts)
    .option("merge-files", {
      describe: "merge input files into a single layer before processing",
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
      describe: "encoding of text data in .dbf file"
    });

  parser.command('o')
    .describe("specify name of output file or directory")
    .validate(validateOutputOpts)
    .option("format", {
      describe: "set export format (shapefile|geojson|topojson|dbf|csv|tsv)"
    })
    .option("quantization", {
      describe: "specify TopoJSON quantization (auto-set by default)",
      type: "integer"
    })
    .option("no-quantization", {
      describe: "export TopoJSON without quantization",
      type: "flag"
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
    });

  parser.command('simplify')
    .validate(validateSimplifyOpts)
    .describe("simplify the geometry of polygon or polyline features")
    .option("dp", {
      alias: "rdp",
      describe: "use Douglas-Peucker simplification",
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
    // .alias("f")
    .describe("filter features with a boolean JavaScript expression")
    .validate(validateFilterOpts)
    .option("expression", {})
    .option("layer", {});

  parser.command("fields")
    .describe('filter and rename data fields, e.g. "fips,st=state"')
    .option("layer", {});

  parser.command("calc")
    .describe("create/update/delete data fields with a JS expression")
    .option("expression", {})
    .option("layer", {});

  parser.command("expression")
    .alias('e')
    .validate(function() {
      error("-expression has been renamed to -calc");
    });

  parser.command("join")
    .describe("join a dbf or delimited text file to the imported shapes")
    .validate(validateJoinOpts)
    .option("keys", {
      describe: "local,foreign keys, e.g. keys=FIPS,CNTYFIPS:str",
      type: "comma-sep"
    })
    .option("fields", {
      describe: "(optional) join fields, e.g. fields=FIPS:str,POP",
      type: "comma-sep"
    });

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
    .option("field", {})
    .option("layer", {});

  parser.command("lines")
    .describe("convert polygons to lines; takes optional list of fields")
    .validate(validateLinesOpts)
    .option("field", {})
    .option("layer", {});

  parser.command("innerlines")
    .describe("output polyline layers containing shared polygon boundaries")
    .validate(validateInnerLinesOpts)
    .option("layer", {});

  parser.command("split")
    .describe("split features on a data field")
    .validate(validateSplitOpts)
    .option("field", {})
    .option("layer", {});

  parser.command("subdivide")
    .describe("recursively divide a layer with a boolean JS expression")
    .validate(validateSubdivideOpts)
    .option("expression", {})
    .option("layer", {});

  parser.command("split-on-grid")
    .describe("split layer into cols,rows  e.g. -split-on-grid 12,10")
    .validate(validateSplitOnGridOpts)
    .option("cols", {
      type: "integer"
    })
    .option("rows", {
      type: "integer"
    })
    .option("layer", {});

  parser.command("merge-layers")
    .describe("merge split-apart layers back into a single layer")
    .validate(validateMergeLayersOpts)
    .option("_dummy_", {}); // kludge to improve help menu formatting

  parser.command("*")
    .title("Options for multiple commands")
    .option("layer", {
      describe: "apply the command to a particular layer"
    })
    .option("+", {
      alias: "add-layer",
      describe: "create new layer(s) instead of replacing the source layer"
    });

  parser.command('encodings')
    .title("Information")
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
