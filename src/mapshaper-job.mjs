import { Catalog } from './dataset/mapshaper-catalog';
import { stashVar, clearStash } from './mapshaper-stash';

// `seed` (optional) lets a caller pre-seed shared state across jobs in a
// single user invocation -- in particular, output_files is threaded across
// the per-input batches that divideImportCommand creates so that filename
// collisions across batches can be detected by writeFiles().
export function Job(catalog, seed) {
  var currentCmd;
  seed = seed || {};

  var job = {
    catalog: catalog || new Catalog(),
    defs: {},
    vars: {},
    settings: {},
    input_files: [],
    // Tracks resolved output paths written so far in this run. We only ever
    // store path strings here, never file content, so the per-write memory
    // cost is negligible. See writeFiles() in mapshaper-file-export.mjs.
    output_files: seed.output_files || []
  };

  job.initSettings = function(o) {
    job.settings = o;
    stashVars(job, {});
  };

  job.startCommand = function(cmd) {
    currentCmd = cmd;
    stashVars(job, cmd);
  };

  // Rejected the idea of passing a command reference to compare with the initial command
  // (for error checking) ... the "-run" command inserts other commands before this call
  job.endCommand = function() {
    currentCmd = null;
    clearStash();
  };

  job.resumeCommand = function() {
    stashVars(job, currentCmd);
  };

  return job;
}

function stashVars(job, cmd) {
  clearStash();  // prevent errors from overwriting stash
  stashVar('current_command', cmd.name);
  stashVar('DEBUG', job.settings.DEBUG || cmd.debug);
  stashVar('VERBOSE', job.settings.VERBOSE || cmd.verbose);
  stashVar('QUIET', job.settings.QUIET || cmd.quiet);
  stashVar('defs', job.defs);
  stashVar('vars', job.vars);
  stashVar('input_files', job.input_files);
  stashVar('output_files', job.output_files);
}
