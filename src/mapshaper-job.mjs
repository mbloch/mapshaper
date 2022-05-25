import { Catalog } from './dataset/mapshaper-catalog';
import { stashVar, clearStash } from './mapshaper-stash';

export function Job(catalog) {
  var currentCmd;

  var job = {
    catalog: catalog || new Catalog(),
    defs: {},
    settings: {},
    input_files: []
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
  stashVar('input_files', job.input_files);
}
