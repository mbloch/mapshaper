/* @requires
mapshaper-shapes,
mapshaper-controls,
mapshaper-topology,
mapshaper-map,
mapshaper-maplayer,
mapshaper-simplify,
mapshaper-visvalingam,
mapshaper-dp,
mapshaper-export,
loading.html5
*/

var api = {
  ArcDataset: ArcDataset,
  Utils: Utils,
  controls: controls,
  trace: trace,
  error: error
}

if (Env.inNode) { // node.js for testing
  module.exports = api;
} else {
  Opts.extendNamespace("mapshaper", api);
}
