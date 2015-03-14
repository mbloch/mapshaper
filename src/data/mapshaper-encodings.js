/* @require mapshaper-common */

MapShaper.getEncodings = function() {
  var iconv = require('iconv-lite');
  iconv.encodingExists('ascii'); // make iconv load its encodings
  return utils.filter(utils.keys(iconv.encodings), function(name) {
    //return !/^(internal|singlebyte|table|cp)/.test(name);
    return !/^(_|cs|internal|singlebyte|table|[0-9]|windows)/.test(name);
  });
};

MapShaper.requireConversionLib = function(encoding) {
  return require('iconv-lite');
};

MapShaper.getFormattedEncodings = function() {
  var encodings = MapShaper.getEncodings(),
      longest = utils.reduce(encodings, function(len, str) {
        return Math.max(len, str.length);
      }, 0),
      padding = longest + 2,
      perLine = Math.floor(80 / padding);
  encodings.sort();
  return utils.reduce(encodings, function(str, name, i) {
    if (i > 0 && i % perLine === 0) str += '\n';
    return str + utils.rpad(name, padding, ' ');
  }, '');
};

MapShaper.printEncodings = function() {
  console.log("Supported encodings:");
  console.log(MapShaper.getFormattedEncodings());
};
