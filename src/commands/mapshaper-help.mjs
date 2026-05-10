import cmd from '../mapshaper-cmd';
import { message, print } from '../utils/mapshaper-logging';
import { getOptionParser } from '../cli/mapshaper-options';
import { runningInBrowser } from '../mapshaper-env';

cmd.printHelp = function(opts) {
  var parser = getOptionParser();
  if (runningInBrowser()) {
    message({
      type: 'mapshaper-console-help',
      lines: parser.getHelpLines(opts.command)
    });
  } else {
    print(parser.getHelpMessage(opts.command));
  }
};
