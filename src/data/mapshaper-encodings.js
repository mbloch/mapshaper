/* @require mapshaper-common */

// List of encodings supported by iconv-lite:
// https://github.com/ashtuchkin/iconv-lite/wiki/Supported-Encodings

// Return list of supported encodings
MapShaper.getEncodings = function() {
  var iconv = require('iconv-lite');
  iconv.encodingExists('ascii'); // make iconv load its encodings
  return Object.keys(iconv.encodings);
};

MapShaper.validateEncoding = function(enc) {
  if (!MapShaper.encodingIsSupported(enc)) {
    stop("Unknown encoding:", enc, "\nRun the -encodings command see a list of supported encodings");
  }
  return enc;
};

MapShaper.encodingIsSupported = function(raw) {
  var enc = MapShaper.standardizeEncodingName(raw);
  return utils.contains(MapShaper.getEncodings(), enc);
};

// @buf a Node Buffer
MapShaper.decodeString = function(buf, encoding) {
  var iconv = require('iconv-lite'),
      str = iconv.decode(buf, encoding);
  // remove BOM if present
  if (str.charCodeAt(0) == 0xfeff) {
    str = str.substr(1);
  }
  return str;
};

// Ex. convert UTF-8 to utf8
MapShaper.standardizeEncodingName = function(enc) {
  return enc.toLowerCase().replace(/[_-]/g, '');
};

MapShaper.printEncodings = function() {
  var encodings = MapShaper.getEncodings().filter(function(name) {
    // filter out some aliases and non-applicable encodings
    return !/^(_|cs|internal|ibm|isoir|singlebyte|table|[0-9]|l[0-9]|windows)/.test(name);
  });
  encodings.sort();
  message("Supported encodings:");
  message(MapShaper.formatStringsAsGrid(encodings));
};
