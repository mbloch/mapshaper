import { stop, message } from '../utils/mapshaper-logging';
import { getStashedVar } from '../mapshaper-stash';
import { zipSync } from '../io/mapshaper-zip';
import { parseLocalPath } from '../utils/mapshaper-filename-utils';
import cli from '../cli/mapshaper-cli-utils';
import utils from '../utils/mapshaper-utils';
import require from '../mapshaper-require';
export function writeFiles(exports, opts, cb) {
  cb = cb || function() {};
  return _writeFiles(exports, opts, cb);
}

// Used by GUI to replace the CLI version of writeFiles()
// (so -o can work in the browser console)
export function replaceWriteFiles(func) {
  _writeFiles = func;
}

var _writeFiles = function(exports, opts, cb) {
  if (exports.length > 0 === false) {
    message("No files to save");
  } else if (opts.dry_run) {
    // no output
  } else if (opts.stdout) {
    // Pass callback for asynchronous output (synchronous output to stdout can
    // trigger EAGAIN error, e.g. when piped to less)
    return cli.writeFile('/dev/stdout', exports[0].content, cb);
  } else {
    if (opts.zip) {
      exports = [{
        // TODO: add output subdirectory, if relevant
        filename: opts.zipfile || 'output.zip',
        content: zipSync(exports)
      }];
    }
    var paths = getOutputPaths(utils.pluck(exports, 'filename'), opts);
    var inputFiles = getStashedVar('input_files');
    exports.forEach(function(obj, i) {
      var path = paths[i];
      if (obj.content instanceof ArrayBuffer) {
        // replacing content so ArrayBuffers can be gc'd
        obj.content = cli.convertArrayBuffer(obj.content); // convert to Buffer
      }
      if (opts.output) {
        opts.output.push({filename: path, content: obj.content});
        return;
      }
      if (!opts.force && inputFiles.indexOf(path) > -1) {
        stop('Need to use the "-o force" option to overwrite input files.');
      }
      cli.writeFile(path, obj.content);
      message("Wrote " + path);
    });
  }
  if (cb) cb(null);
};

export function getOutputPaths(files, opts) {
  var odir = opts.directory;
  if (odir) {
    files = files.map(function(file) {
      return require('path').join(odir, file);
    });
  }
  return files;
}