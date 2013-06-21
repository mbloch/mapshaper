/* 
@requires
arrayutils
data
dataview
dateutils
events
format
median
nodejs
sorting
bounds
*/

var api = {
  Utils: Utils,
  Opts: Opts,
  Env: Env,
  trace: trace,
  error: error,
  BinArray: BinArray,
  Node: Node,
  T: T,
  Bounds: Bounds,
  Transform: Transform
};

if (Node.inNode) {
  module.exports = api;
} else {
  Opts.extendNamespace("nytg", api);
}
