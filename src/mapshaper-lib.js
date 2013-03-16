/* 
@requires
core,
nodejs,
dbf-import,
mapshaper-cli,
mapshaper-shapefile,
mapshaper-simplify,
mapshaper-topology,
mapshaper-visvalingam,
mapshaper-dp
*/

var api = Opts.copyAllParams(MapShaper, {
  Node: Node,
  Utils: Utils,
  Opts: Opts,
  trace: trace,
  error: error,
  assert: assert,
  T: T,
  BinArray: BinArray,
  DouglasPeucker: DouglasPeucker,
  Visvalingam: Visvalingam,
  Shapefile: Shapefile
});

if (Node.inNode) {
  module.exports = api;
} else {
  Opts.extendNamespace("mapshaper", api);
}

T.verbose = false; // timing messages off by default (e.g. for testing)
