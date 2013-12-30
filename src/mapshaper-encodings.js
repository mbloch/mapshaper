/* @require mapshaper-common */

MapShaper.getEncodings = function() {
  var encodings = MapShaper.getIconvLiteEncodings();
  encodings = encodings.concat(MapShaper.getJapaneseEncodings());
  return Utils.uniq(encodings);
};

MapShaper.getIconvLiteEncodings = function() {
  var iconv = require('iconv-lite');
  iconv.encodingExists('ascii'); // make iconv load its encodings
  return Utils.filter(Utils.keys(iconv.encodings), function(name) {
    return !/^(internal|singlebyte|table|cp)/.test(name);
  });
};

// List of encodings from jconv (hard-coded, because not exposed by the library)
MapShaper.getJapaneseEncodings = function() {
  return ['jis', 'iso2022jp', 'iso2022jp1', 'shiftjis', 'eucjp'];
};

MapShaper.requireConversionLib = function(encoding) {
  var conv;
  if (Utils.contains(MapShaper.getJapaneseEncodings(), encoding)) {
    conv = require('jconv');
  } else {
    conv = require('iconv-lite');
  }
  return conv;
};

MapShaper.getFormattedEncodings = function() {
  var encodings = MapShaper.getEncodings(),
      longest = Utils.reduce(encodings, function(len, str) {
        return Math.max(len, str.length);
      }, 0),
      padding = longest + 2,
      perLine = Math.floor(80 / padding);
  encodings.sort();
  return Utils.reduce(encodings, function(str, name, i) {
    if (i > 0 && i % perLine === 0) str += '\n';
    return str + Utils.rpad(name, padding, ' ');
  }, '');
};

MapShaper.printEncodings = function() {
  console.log("Supported encodings:");
  console.log(MapShaper.getFormattedEncodings());
};
