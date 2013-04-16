/* @requires
mapshaper-index,
mapshaper-shapes,
mapshaper-controls,
mapshaper-topology,
nodejs
*/

var api = {
  BoundsIndex: BoundsIndex,
  ArcCollection: ArcCollection,
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
