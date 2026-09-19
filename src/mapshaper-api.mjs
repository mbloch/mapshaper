import { enableLogging } from './utils/mapshaper-logging';
import { runCommands, applyCommands, runCommandsXL } from './cli/mapshaper-run-commands';

import cmd from './mapshaper-cmd';
import internal from './mapshaper-internal';
import geom from './geom/mapshaper-geom';
import utils from './utils/mapshaper-utils';
import cli from './cli/mapshaper-cli-utils';
import { initNodeTextMeasurement } from './fonts/mapshaper-text-measure';

// Outside a browser, label text is measured from the installed font files --
// see mapshaper-text-measure.mjs. Installed here rather than in the CLI's
// entry point because a width is read while rendering and exporting, which the
// API reaches without a command line, and it costs nothing until a label
// actually needs measuring.
initNodeTextMeasurement();

// the mapshaper public api only has 4 functions
var api = {
  runCommands,
  applyCommands,
  runCommandsXL,
  enableLogging
};

// Add some namespaces, for easier testability and
// to expose internal functions to the web UI
Object.assign(api, {
  cli, cmd, geom, utils, internal,
});

export default api;
