import cmd from '../mapshaper-cmd';
import { stop } from '../utils/mapshaper-logging';
import { parseVarsArgs } from '../cli/mapshaper-vars-utils';

// -vars KEY=value [KEY=value ...]   inline assignments
// -vars file.json [more ...]        load primitives from a flat JSON object
// Mixed forms allowed; later args override earlier ones.
//
// Writes into job.vars, the templating-scope object read by {{X}}
// interpolation. Values written here are NOT visible by bare name in JS
// expressions (-each, -filter, -define, etc.); use -define for that.
// {{X}} substitution falls back to job.defs if a name is missing from
// vars, so values set by -define / -calc / -include are still
// referenceable from {{X}}.
cmd.vars = function(job, opts) {
  var values = (opts && opts.values) || [];
  if (!values.length) {
    stop('-vars requires one or more KEY=value or file.json arguments');
  }
  var parsed = parseVarsArgs(values, opts && opts.input);
  if (!job.vars) job.vars = {};
  Object.keys(parsed).forEach(function(key) {
    job.vars[key] = parsed[key];
  });
};

// -defaults KEY=value [KEY=value ...]   set-if-unset
// Same syntax as -vars, but a key is only assigned if it is not already
// present in job.vars. Lets a command file declare overridable defaults
// that a CLI -vars can pre-empt.
cmd.defaults = function(job, opts) {
  var values = (opts && opts.values) || [];
  if (!values.length) {
    stop('-defaults requires one or more KEY=value or file.json arguments');
  }
  var parsed = parseVarsArgs(values, opts && opts.input);
  if (!job.vars) job.vars = {};
  Object.keys(parsed).forEach(function(key) {
    if (!(key in job.vars)) {
      job.vars[key] = parsed[key];
    }
  });
};
