// The entry point for the core mapshaper module

// The main public api
import coreAPI from './mapshaper-api';

// Add some namespaces, for easier testability and
// to expose internal functions to the web UI
import cmd from './mapshaper-cmd';
import internal from './mapshaper-internal';
import geom from './geom/mapshaper-geom';
import utils from './utils/mapshaper-utils';
import cli from './cli/mapshaper-cli-utils';

var moduleAPI = Object.assign({
  cli, cmd, geom, utils, internal,
}, coreAPI);

if (typeof module === "object" && module.exports) {
  module.exports = moduleAPI;
} else if (typeof window === "object" && window) {
  window.mapshaper = moduleAPI;
}
