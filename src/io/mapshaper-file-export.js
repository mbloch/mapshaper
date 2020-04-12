import { stop, message } from '../utils/mapshaper-logging';
import { getStateVar } from '../mapshaper-state';
import cli from '../cli/mapshaper-cli-utils';
import utils from '../utils/mapshaper-utils';

export function writeFiles(exports, opts, cb) {
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
    var paths = getOutputPaths(utils.pluck(exports, 'filename'), opts);
    var inputFiles = getStateVar('input_files');
    exports.forEach(function(obj, i) {
      var path = paths[i];
      if (obj.content instanceof ArrayBuffer) {
        // replacing content so ArrayBuffers can be gc'd
        obj.content = cli.convertArrayBuffer(obj.content); // convert to Buffer
      }
      if (opts.output) {
        opts.output.push({filename: path, content: obj.content});
      } else {
        if (!opts.force && inputFiles.indexOf(path) > -1) {
          stop('Need to use the "-o force" option to overwrite input files.');
        }
        cli.writeFile(path, obj.content);
        message("Wrote " + path);
      }
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