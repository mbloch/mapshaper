/** @requires data */

/**
 * Loader for file containing multiple tab-delimited data tables.
 * @param {string} url URL of data file.
 * @param {Object} opts (Optional) object containing optional parameters.
 * @constructor
 */
 function MultiPartTabDataLoader(url, opts) {

  var _partIndex = {};
  var _loader = new FileLoader(opts);
  _loader.load(url);
  _loader.addEventListener(C.DONE, handleDone, this);


  this.requestTable = function(key) {
    var t = new DataTable();
    _partIndex[key] = t;
    return t;
  };

  function handleDone(evt) {
    var str = _loader.data;

    // ^### (w/ caret) fails on first line of file with UTF-8 signature
    var rxp = /### *(\w+)\r?\n/;
    var matches = str.split(rxp);

    //trace(matches[1]);
    for (var i = 1; i < matches.length; i += 2) {
      var partName = matches[i];
      var tableStr = matches[i + 1];
      var table = _partIndex[partName];
      if (!table) {
        continue;
      }
      var parser = new TabDataParser();
      var obj = parser.procString(tableStr);

      table.populate(obj.data, obj.schema);
      //table.startWaiting(); // fire READY
    }
    _partIndex = null; // release table references...

    this.startWaiting();
  }
}

Opts.inherit(MultiPartTabDataLoader, Waiter);
