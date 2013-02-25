/* @requires browser, nodejs, mapshaper-topology, mapshaper-dp, mapshaper-visvalingam, mapshaper-shapefile, mapshaper-geojson, mapshaper-topojson */

var api = {
  MapShaper: MapShaper,
  Node: Node,
  Utils: Utils,
  trace: trace,
  error: error,
  assert: assert,
  T: T,
  BinArray: BinArray,
  DouglasPeucker: DouglasPeucker,
  Visvalingam: Visvalingam
};

if (Node.inNode) {
  module.exports = api;
} else {
  Opts.extendNamespace("mapshaper", api);
}
