/*
@requires
core,
bounds,
nodejs,
dbf-reader,
mapshaper-cli,
mapshaper-shapefile,
mapshaper-simplify,
mapshaper-topology,
mapshaper-visvalingam,
mapshaper-dp
*/

var api = Utils.extend(MapShaper, {
  Node: Node,
  Utils: Utils,
  Opts: Opts,
  trace: trace,
  error: error,
  T: T,
  BinArray: BinArray,
  DouglasPeucker: DouglasPeucker,
  Visvalingam: Visvalingam,
  ShpReader: ShpReader,
  DbfReader: DbfReader,
  Bounds: Bounds
});

if (Node.inNode) {
  module.exports = api;
} else {
  Opts.extendNamespace("mapshaper", api);
}

T.verbose = false; // timing messages off by default (e.g. for testing)
