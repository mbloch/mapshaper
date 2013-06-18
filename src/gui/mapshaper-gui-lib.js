/* @requires
mapshaper-index,
mapshaper-shapes,
mapshaper-controls,
mapshaper-topology,
mapshaper-map,
mapshaper-maplayer,
mapshaper-simplify,
mapshaper-visvalingam,
mapshaper-export,
nodejs
loading.html5
*/

var api = {
  BoundsIndex: BoundsIndex,
  ArcDataset: ArcDataset,
  Utils: Utils,
  BoundingBox: BoundingBox,
  controls: controls,
  trace: trace,
  error: error
}


if (Node.inNode) { // node.js for testing
  module.exports = api;
} else {
  Opts.extendNamespace("mapshaper", api);
}
