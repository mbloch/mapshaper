// The entry point for the core mapshaper module

import coreAPI from './mapshaper-api'; // the main public api

// Attach some namespaces to the module, for compatibility with tests and
// to expose internal functions to the web UI
import cmd from './mapshaper-cmd';
import internal from './mapshaper-internal';
import geom from './geom/mapshaper-geom';
import utils from './utils/mapshaper-utils';
import cli from './cli/mapshaper-cli-utils';
import { importFile } from './io/mapshaper-file-import';
var moduleAPI = Object.assign({
  cli, geom, utils, internal,
  importFile // Adding importFile() for compatibility with old tests; todo: rewrite tests
}, cmd, coreAPI);  // Adding command functions to the top-level module API, for test compatibility

if (typeof module === "object" && module.exports) {
  module.exports = moduleAPI;
} else if (typeof window === "object" && window) {
  window.mapshaper = moduleAPI;
}
