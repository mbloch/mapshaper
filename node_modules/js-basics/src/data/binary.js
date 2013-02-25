/**
 * A binary string reader, similar to ByteArray in as3.
 * TODO: Transition to encoding binary data in UTF16 strings, to work with IE.
 * @constructor
 * @param {string} str A binary string, typically loaded via Ajax request.
 */
function BinaryString(str) {

  var _str = str;
  var _idx = 0;
  var _length = str.length;


  this.length = function() {
    return _length;
  };

  this.rewind = function() {
    _idx = 0;
  };

  this.getPosition = function() {
    return _idx;
  };

  this.getRawString = function() {
    return _str;
  };

  this.setPosition = function(i) {
    _idx = i;
  };

  this.advancePosition = function(i) {
    _idx += i;
  };

  this.readByte = function() {
    var b = _str.charCodeAt(_idx++) & 0xff;
    return b;
  };


  // assume LE byte order
  this.readUnsignedInt = function() {
    var f = 1;
    var val = 0;
    for (var i = 0; i < 4; i++) {
      var cval = (_str.charCodeAt(_idx + i) & 0xff);
      val += cval * f;
      f *= 256;
    }

    _idx += 4;
    return val;
  };

  this.readUnsignedShort = function() {

    /* if ( _useBigEndian ) {
      f0 = 256;
      f1 = 1;
    } */

    var val = (_str.charCodeAt(_idx) & 0xff) |
      ((_str.charCodeAt(_idx + 1) & 0xff) << 8);
    _idx += 2;
    return val;
  };

  this.readDouble = function() {

    var b0 = _str.charCodeAt(_idx + 7) & 0xff;
    var b1 = _str.charCodeAt(_idx + 6) & 0xff;
    var b2 = _str.charCodeAt(_idx + 5) & 0xff;
    var b3 = _str.charCodeAt(_idx + 4) & 0xff;
    var b4 = _str.charCodeAt(_idx + 3) & 0xff;
    var b5 = _str.charCodeAt(_idx + 2) & 0xff;
    var b6 = _str.charCodeAt(_idx + 1) & 0xff;
    var b7 = _str.charCodeAt(_idx) & 0xff;

    _idx += 8;

    var isNegative = (b0 & 0x80) > 0;
    var biasedExp = ((b0 & 0x7f) << 4) + ((b1 & 0xf0) >> 4);
    var exp = biasedExp - 1023;

    b1 = b1 & 0x0f;

    var mant = b7 + (b6 << 8) + (b5 << 16);
    var f = 16777216;
    mant += b4 * f;
    f *= 256;
    mant += b3 * f;
    f *= 256;
    mant += b2 * f;
    f *= 256;
    mant += b1 * f;

    var val;
    if (biasedExp == 0x7ff) {
      if (mant !== 0) {
        val = NaN;
      }
      else if (isNegative) {
        val = -Infinity;
      }
      else {
        val = Infinity;
      }
    }
    else {
      mant *= Math.pow(2, -52); // TODO: combine w/ the below Math.pow() call
      if (biasedExp > 0) {
        mant += 1;
      }
      val = mant * Math.pow(2, exp);
      if (isNegative) {
        val *= -1;
      }
    }

    return val;
  };
}

