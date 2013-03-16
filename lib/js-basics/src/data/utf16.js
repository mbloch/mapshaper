/**
 * Interface for reading numerical data that has been encoded as a utf-16 string.
 * A utf-16 string consists of a series of 2 byte (16 bit) 'words'.
 * The encoding format has several quirks:
 * Zero-value words (0x0000) are replaced by the zero 'alias', 0xd7ff.
 *   This is because some platforms (e.g. ie) treat zero as a string terminator.
 * Unicode values from 0xd800 - 0xdc00 are reserved for 'surrogate pairs' (pairs of 16-bit words), 
 *   so values in this range are encoded using valid pairs of 16-bit words. 
 *   The zero-alias (0xd7ff) is also replaced by a surrogate pair.
 *
 * TODO: handle Unicode byte order mark (BOM) (currently assumes no BOM and big-endian byte order).
 * TODO: handle data files with an odd number of bytes.
 * TODO: handle error conditions, like reading past the end of the string.
 *
 * @constructor
 * @param str {string} Data encoded as utf-16 string.
 */
function Utf16Array( str ) {
  this._str = str;
  this._idx = 0;

  this._aligned = true;
  this._offByte = 0;
  this._useBE = true; // Currently assumes big-endian integers.

  // Because js reports Unicode 4-byte extended plane code points as having
  //   length == 2, we can't tell the number of data bytes from string length.
  /* this.length = function() {
    return this._str.length;
  }*/

  this.rewind = function() {
    this._idx = 0;
    this._aligned = true;
  };

  this.useBigEndian = function() {
    this._useBE = true;
  };

  this.useLittleEndian = function() {
    this._useBE = false;
  };

  this.readUnsignedInt = function() {
    var s1 = this.readUnsignedShort();
    var s2 = this.readUnsignedShort();
    var val = this._useBE ? (s1 << 16) | s2 : (s2 << 16) | s1;
    return val;
  }
}


Utf16Array.prototype.readByte = function() {
  var val;
  if ( this._aligned ) {
    var code = this.readUnsignedShort(true);
    this._offByte = code & 0xff;
    val = code >> 8;
    this._aligned = false;
  }
  else {
    val = this._offByte;
    this._aligned = true;
  }
  return val;
};


Utf16Array.prototype.readUnsignedShort = function(forceBE) {
  var code = this._str.charCodeAt( this._idx++ );
  var val;

  if ( code >= 0xd7ff && code <= 0xdfff ) {
    if (code == 0xd7ff) { // zeroAlias
      code = 0;
    }
    else {
      var secondPart = this._str.charCodeAt( this._idx++ );
      code = 0x400 * (code - 0xd800) + (secondPart - 0xdc00);
    }
    // TODO: validate
  }
 
  if ( this._aligned === true ) {
    val = code;
  }
  else {
    val = (this._offByte << 8) | (code >> 8);
    this._offByte = code & 0xff;
  }

  if (!(forceBE || this._useBE)) {
    // little-endian swap
    val = (val & 0xff ) << 8 | val >> 8; // This is fast.
  }

  return val;
};


Utf16Array.prototype.readDouble = function() {
  var val;
  var b7 = this.readByte();
  var b6 = this.readByte();
  var b5 = this.readByte();
  var b4 = this.readByte();
  var b3 = this.readByte();
  var b2 = this.readByte();
  var b1 = this.readByte();
  var b0 = this.readByte();

  //trace("***", b7, b6, b5, b4, b3, b2, b1, b0);

  var isNegative = (b0 & 0x80) > 0;
  var biasedExp = ((b0 & 0x7f) << 4 ) + ((b1 & 0xf0) >> 4 );
  var exp = biasedExp - 1023;

  b1 = b1 & 0x0f;

  var mant = b7 + (b6 << 8) + (b5 << 16);
  var f = 16777216.;
  mant += b4 * f;
  f *= 256.;
  mant += b3 * f;
  f *= 256.;
  mant += b2 * f;
  f *= 256;
  mant += b1 * f;
  
  if ( biasedExp == 0x7ff ) {
    if ( mant != 0 ) {
      val = NaN;
    }
    else if ( isNegative) {
      val = -Infinity;
    }
    else {
      val = Infinity;
    }
  }
  else {
    mant *= Math.pow( 2, -52 ); // this could be combined w/ the below Math.pow() call
    if ( biasedExp > 0 ) {
      mant += 1.;
    }
    val =  mant * Math.pow( 2, exp );
    if ( isNegative ) {
      val *= -1;
    }
  }

  return val;
};
