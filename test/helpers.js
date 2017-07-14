var api = require('..');


function toBuf(str) {
  return new Buffer(str, 'utf8');
}

function Reader(str, chunkLen) {
  var buf = toBuf(str);
  chunkLen = chunkLen || 256;

  this.readSync = function(offs) {
    return buf.slice(offs, Math.min(chunkLen, buf.length));
  };

  this.toString = function() {return str;};

  this.expandBuffer = function() {
    chunkLen *= 2;
    return this;
  };
}

Reader.prototype.findString = api.internal.FileReader.prototype.findString;

module.exports.Reader = Reader;
