import cmd from '../mapshaper-cmd';
import { stop } from '../utils/mapshaper-logging';
import { parseVarsArgs } from '../cli/mapshaper-vars-utils';

// -vars KEY=value [KEY=value ...]   inline assignments
// -vars file.json [more ...]        load primitives from a flat JSON object
// Mixed forms allowed; later args override earlier ones.
//
// Writes into job.defs (the same object read by {{X}} interpolation,
// -define, -calc and -include).
cmd.vars = function(job, opts) {
  var values = (opts && opts.values) || [];
  if (!values.length) {
    stop('-vars requires one or more KEY=value or file.json arguments');
  }
  var parsed = parseVarsArgs(values, opts && opts.input);
  if (!job.defs) job.defs = {};
  Object.keys(parsed).forEach(function(key) {
    job.defs[key] = parsed[key];
  });
};

// -defaults KEY=value [KEY=value ...]   set-if-unset
// Same syntax as -vars, but a key is only assigned if it is not already
// present in job.defs. Lets a command file declare overridable defaults
// that a CLI -vars can pre-empt.
cmd.defaults = function(job, opts) {
  var values = (opts && opts.values) || [];
  if (!values.length) {
    stop('-defaults requires one or more KEY=value or file.json arguments');
  }
  var parsed = parseVarsArgs(values, opts && opts.input);
  if (!job.defs) job.defs = {};
  Object.keys(parsed).forEach(function(key) {
    if (!(key in job.defs)) {
      job.defs[key] = parsed[key];
    }
  });
};
