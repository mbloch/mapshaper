import { enableLogging } from './utils/mapshaper-logging';
import { runCommands, applyCommands, runCommandsXL } from './cli/mapshaper-run-commands';
// the mapshaper public api only has 4 functions
export default {
  runCommands,
  applyCommands,
  runCommandsXL,
  enableLogging
};
