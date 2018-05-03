
var Buffer = require('buffer').Buffer; // works with browserify

utils.createBuffer = function(arg, arg2) {
  if (!Buffer.from) {
    return new Buffer(arg);
  }
  if (utils.isInteger(arg)) {
    return Buffer.allocUnsafe(arg);
  }
  return Buffer.from(arg, arg2);
};