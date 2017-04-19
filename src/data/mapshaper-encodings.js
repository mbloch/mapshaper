/* @require mapshaper-common */

// List of encodings supported by iconv-lite:
// https://github.com/ashtuchkin/iconv-lite/wiki/Supported-Encodings

// Return list of supported encodings
internal.getEncodings = function() {
  var iconv = require('iconv-lite');
  iconv.encodingExists('ascii'); // make iconv load its encodings
  return Object.keys(iconv.encodings);
};

internal.validateEncoding = function(enc) {
  if (!internal.encodingIsSupported(enc)) {
    stop("Unknown encoding:", enc, "\nRun the -encodings command see a list of supported encodings");
  }
  return enc;
};

internal.encodingIsSupported = function(raw) {
  var enc = internal.standardizeEncodingName(raw);
  return utils.contains(internal.getEncodings(), enc);
};

// @buf a Node Buffer
internal.decodeString = function(buf, encoding) {
  var iconv = require('iconv-lite'),
      str = iconv.decode(buf, encoding);
  // remove BOM if present
  if (str.charCodeAt(0) == 0xfeff) {
    str = str.substr(1);
  }
  return str;
};

// Ex. convert UTF-8 to utf8
internal.standardizeEncodingName = function(enc) {
  return enc.toLowerCase().replace(/[_-]/g, '');
};

internal.printEncodings = function() {
  var encodings = internal.getEncodings().filter(function(name) {
    // filter out some aliases and non-applicable encodings
    return !/^(_|cs|internal|ibm|isoir|singlebyte|table|[0-9]|l[0-9]|windows)/.test(name);
  });
  encodings.sort();
  message("Supported encodings:");
  message(internal.formatStringsAsGrid(encodings));
};
