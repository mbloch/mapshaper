
var Buffer = require('buffer').Buffer; // works with browserify

utils.createBuffer = function(arg, arg2) {
  if (utils.isInteger(arg)) {
    return Buffer.allocUnsafe ? Buffer.allocUnsafe(arg) : new Buffer(arg);
  } else {
    return Buffer.from ? Buffer.from(arg, arg2) : new Buffer(arg);
  }
};
