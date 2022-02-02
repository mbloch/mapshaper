import cmd from '../mapshaper-cmd';
import { print } from '../utils/mapshaper-logging';

cmd.print = function(msgArg) {
  print(msgArg || '');
};
