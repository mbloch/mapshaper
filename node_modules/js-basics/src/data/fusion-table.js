/** @requires data */

/**
 * Load data from a fusion table using a json callback.
 * @param {string} id Id of fusion table.
 * @return {DataTable} DataTable.
 * @constructor
 */
function FusionTable(id) {
  var _table = new DataTable();
  var _callbackName = 'GFTc_' + (Utils.getUniqueName());

  window[_callbackName] = handleCallback;

  var url = 'http://www.google.com/fusiontables/api/query?jsonCallback=' +
    _callbackName + '&sql=SELECT * from ' + id;
  var _script = document.createElement('script');
  _script['src'] = url;
  _script['type'] = 'text/javascript';
  document.getElementsByTagName('head')[0].appendChild(_script);


  function handleCallback(obj) {
    var tableNode = obj && obj['table'];
    if (!tableNode) {
      return;
    }

    var parser = new TabDataParser();
    var tableData = parser.procArrayData(tableNode['cols'], tableNode['rows']);
    _table.populate(tableData.data, tableData.schema);

    // rmeove script to release memory
    _script.parentNode.removeChild(_script);
    delete window[_callbackName];
    _table.startWaiting(); // fire READY
  }

  return _table;
}
