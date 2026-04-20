import cmd from '../mapshaper-cmd';
import './mapshaper-dissolve';
import { message } from '../utils/mapshaper-logging';

// -dissolve2 is now an alias for -dissolve. The repair-on-by-default behavior
// of -dissolve2 has been promoted to be the default behavior of -dissolve;
// the legacy fast-dissolve algorithm is available via -dissolve no-repair.
//
// This alias prints a deprecation notice and forwards to cmd.dissolve.
//
var deprecationWarned = false;

cmd.dissolve2 = function(layers, dataset, opts) {
  if (!deprecationWarned && !(opts && opts.quiet)) {
    message('This command has been merged into -dissolve and is deprecated. ' +
      'Use -dissolve (or -dissolve no-repair for the legacy fast algorithm).');
    deprecationWarned = true;
  }
  return cmd.dissolve(layers, dataset, opts);
};
