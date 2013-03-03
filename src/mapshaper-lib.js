/* @requires core, nodejs, mapshaper-* */

var api = Opts.copyAllParams(MapShaper, {
  Node: Node,
  Utils: Utils,
  trace: trace,
  error: error,
  assert: assert,
  T: T,
  BinArray: BinArray,
  DouglasPeucker: DouglasPeucker,
  Visvalingam: Visvalingam
});

if (Node.inNode) {
  module.exports = api;
} else {
  Opts.extendNamespace("mapshaper", api);
}
