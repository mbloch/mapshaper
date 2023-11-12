import { isSupportedDelimiter } from '../text/mapshaper-delim-import';
import { isSupportedOutputFormat } from '../io/mapshaper-file-types';
import { filenameIsUnsupportedOutputType, stringLooksLikeJSON } from '../io/mapshaper-file-types';
import { validateEncoding } from '../text/mapshaper-encodings';
import { error, stop } from '../utils/mapshaper-logging';
import cli from '../cli/mapshaper-cli-utils';
import utils from '../utils/mapshaper-utils';
import { parseLocalPath } from '../utils/mapshaper-filename-utils';

export function validateInputOpts(cmd) {
  var o = cmd.options,
      _ = cmd._;

  if (o.files) {
    o.files = cli.expandInputFiles(o.files);
    if (o.files[0] == '-' || o.files[0] == '/dev/stdin') {
      delete o.files;
      o.stdin = true;
    }
  }

  if ('precision' in o && o.precision > 0 === false) {
    error('precision= option should be a positive number');
  }

  if (o.encoding) {
    o.encoding = validateEncoding(o.encoding);
  }
}

export function validateSimplifyOpts(cmd) {
  var o = cmd.options;
  if (!o.interval && !o.percentage && !o.resolution) {
    error('Command requires an interval, percentage or resolution parameter');
  }
}

export function validateProjOpts(cmd) {
  if (!(cmd.options.crs || cmd.options.match || cmd.options.init)) {
    stop('Missing projection data');
  }
}

export function validateGridOpts(cmd) {
  var o = cmd.options;
  if (cmd._.length == 1) {
    var tmp = cmd._[0].split(',');
    o.cols = parseInt(tmp[0], 10);
    o.rows = parseInt(tmp[1], 10) || o.cols;
  }
}

export function validateExpressionOpt(cmd) {
  if (!cmd.options.expression) {
    error('Command requires a JavaScript expression');
  }
}

export function validateOutputOpts(cmd) {
  var o = cmd.options,
      arg = o._ || '',
      pathInfo = parseLocalPath(arg);

  // if (!arg) {
  //   error('Command requires an output file or directory.');
  // }

  if (arg == '-' || arg == '/dev/stdout') {
    o.stdout = true;
  } else if (arg && !pathInfo.extension) {
    if (!cli.isDirectory(arg)) {
      error('Unknown output option:', arg);
    }
    o.directory = arg;
  } else if (arg) {
    if (pathInfo.directory) {
      o.directory = pathInfo.directory;
      // no longer checking for missing directory
      // (cli.writeFile() now creates directories that don't exist)
      // cli.validateOutputDir(o.directory);
    }
    if (/gz/i.test(pathInfo.extension)) {
      // handle arguments like -o out.json.gz (the preferred format)
      if (parseLocalPath(pathInfo.basename).extension) {
        o.file = pathInfo.basename;
      } else {
        // handle arguments like -o out.gz
        o.file = pathInfo.filename;
      }
      o.gzip = true;
    } else if (/zip/i.test(pathInfo.extension)) {
      o.file = null;
      o.zipfile = pathInfo.filename;
      o.zip = true;
    } else {
      o.file = pathInfo.filename;
    }

    if (filenameIsUnsupportedOutputType(o.file)) {
      error('Output file looks like an unsupported file type:', o.file);
    }
  }

  if (o.format) {
    o.format = o.format.toLowerCase();
    if (o.format == 'csv') {
      o.format = 'dsv';
      o.delimiter = o.delimiter || ',';
    } else if (o.format == 'tsv') {
      o.format = 'dsv';
      o.delimiter = o.delimiter || '\t';
    }
    if (!isSupportedOutputFormat(o.format)) {
      error('Unsupported output format:', o.format);
    }
  }

  if (o.delimiter) {
    // convert '\t' '\t' \t to tab
    o.delimiter = o.delimiter.replace(/^["']?\\t["']?$/, '\t');
    if (!isSupportedDelimiter(o.delimiter)) {
      error('Unsupported delimiter:', o.delimiter);
    }
  }

  if (o.encoding) {
    o.encoding = validateEncoding(o.encoding);
  }

  if (o.field_order && o.field_order != 'ascending') {
    error('Unsupported field order:', o.field_order);
  }

  // topojson-specific
  if ('quantization' in o && o.quantization > 0 === false) {
    error('quantization= option should be a nonnegative integer');
  }

  if ('topojson_precision' in o && o.topojson_precision > 0 === false) {
    error('topojson-precision= option should be a positive number');
  }
}
