import cmd from '../mapshaper-cmd';
import { verbose, message } from '../utils/mapshaper-logging';

cmd.comment = function(opts) {
  // TODO: print the comment in verbose mode
  // message('[comment]', opts.message);
}; // no-op, so -comment doesn't trigger a parsing error
