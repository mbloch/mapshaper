import cmd from '../mapshaper-cmd';
import { print } from '../utils/mapshaper-logging';
import { getOptionParser } from '../cli/mapshaper-options';

cmd.printHelp = function(opts) {
  var str = getOptionParser().getHelpMessage(opts.command);
  print(str);
};
