/* @requires mapshaper-common */


MapShaper.validateArgv = function(opts, optimist) {
  if (opts.h) {
    optimist.showHelp();
    process.exit(0);
  }

  // validate input file
  //
  var ifile = opts._[0];
  if (!ifile) error("Missing an input file.");

  var fileInfo = Node.getFileInfo(ifile);
  if (!fileInfo.exists) error("File not found (" + ifile + ")");
  if (fileInfo.ext != 'shp') error("Input filename must match *.shp");

  opts.input_file = ifile;
  opts.input_format = "shapefile";
  opts.input_file_base = fileInfo.base;
  opts.input_directory = fileInfo.directory;

  // validate interval
  //
  opts.i = opts.i || 0;
  if(isNaN(opts.i) || opts.i < 0) error("-i (--interval) option requires a non-negative number");

  // validate simplification
  //
  opts.p = opts.p || 1;
  if(opts.p <= 0 || opts.p > 1) error("-p (--pct) option should be in the range (0,1]");

  opts.use_simplification = opts.i || opts.p < 1;
  if (opts.dp)
    opts.method = "dp";
  else if (opts.vis)
    opts.method = "vis";
  else
    opts.method = "mod";

  // validate output file
  //
  // only shapefile for now
  if (opts.f && opts.f != "shapefile") error("Unsupported output format:", opts.f);
  opts.output_format = "shapefile";

  // TODO: accept user-supplied name
  opts.output_file_base = opts.input_file_base + "-mshp";
  opts.output_path_base = "./" + opts.output_file_base; // output to cwd

  if (opts['shp-test']) {
    if (opts.input_format != 'shapefile') {
      error("--shp-test option requires shapfile input")
    }
    opts.test_shp_output = true;
    opts.output_format = 'shapefile';
    opts.use_simplification = false;
  }

  return opts;
};