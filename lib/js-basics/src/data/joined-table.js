/** @requires data, table-join */
function JoinedTable(table) {
  this._baseTable = table;
  this.__super__();
};

Opts.inherit(JoinedTable, DataTable);

JoinedTable.prototype.joinTable = function(destKey, src, srcKey) {
  var dest = this._baseTable;
  if (dest.isReady() && src.isReady()) {
    joinDataTables(dest, destKey, src, srcKey);
    this.populate(dest.data, dest.schema);
  }
  else {
    var w = new Waiter().waitFor(dest).waitFor(src);
    w.addEventListener('ready', function() { this.joinTable(destKey, src, srcKey); }, this);
    w.startWaiting();
  }
  return this; // supports chaining
};
