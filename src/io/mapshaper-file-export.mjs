import { stop, message, warn } from '../utils/mapshaper-logging';
import { getStashedVar } from '../mapshaper-stash';
import { zipSync } from '../io/mapshaper-zip';
import { parseLocalPath } from '../utils/mapshaper-filename-utils';
import cli from '../cli/mapshaper-cli-utils';
import utils from '../utils/mapshaper-utils';
import require from '../mapshaper-require';
export async function writeFiles(exports, opts) {
  warnOnPathCollisions(exports, opts);
  return _writeFiles(exports, opts);
}

// Used by GUI to replace the CLI version of writeFiles()
// (so -o can work in the browser console)
export function replaceWriteFiles(func) {
  _writeFiles = func;
}

var _writeFiles = function(exports, opts) {
  if (exports.length > 0 === false) {
    message("No files to save");
  } else if (opts.dry_run) {
    // no output
  } else if (opts.stdout) {
    // Using async writeFile() function -- synchronous output to stdout can
    // trigger EAGAIN error, e.g. when piped to less.
    require('rw').writeFile('/dev/stdout', exports[0].content, function() {});
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
      cli.writeFileSync(path, obj.content);
      // Drop the buffer reference so V8 can reclaim it before we move on to
      // the next file. Without this, every file's bytes are pinned alive by
      // the local exports[] reference until the entire forEach completes,
      // which matters for large `-o batch-mode` runs that emit many files.
      obj.content = null;
      message("Wrote " + path);
    });
  }
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

// Emit a one-shot warning when a -o command writes to a path that's already
// been written in this run. Catches three cases with a single message:
//   1. Two -o commands in one chain naming the same file.
//   2. Implicit collisions where -o derives filenames from layer names that
//      happen to match (or use a generic default like 'output').
//   3. Cross-batch collisions when batch-mode runs the same -o command per
//      input and they all converge on the same path on disk.
// The check only stores resolved path strings, never file content, so the
// memory cost is negligible. When the stash isn't initialized (e.g. tests
// that call writeFiles() outside a Job, or a degenerate caller) tracking
// silently no-ops.
function warnOnPathCollisions(exports, opts) {
  if (!exports || exports.length === 0) return;
  if (opts.dry_run || opts.stdout) return;
  var written = getStashedVar('output_files');
  if (!Array.isArray(written)) return;
  var pendingPaths;
  if (opts.zip) {
    pendingPaths = [opts.zipfile || 'output.zip'];
  } else {
    pendingPaths = getOutputPaths(utils.pluck(exports, 'filename'), opts);
  }
  pendingPaths.forEach(function(path) {
    if (written.indexOf(path) !== -1) {
      warn('Output file ' + path + ' was written more than once in this run; ' +
        'only the last write is preserved.');
    } else {
      written.push(path);
    }
  });
}