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
*/

var api = {
  Utils: Utils,
  Opts: Opts,
  Env: Env,
  trace: trace,
  error: error,
  BinArray: BinArray,
};

if (Node.inNode) {
  module.exports = api;
} else {
  Opts.extendNamespace("nytg", api);
}
