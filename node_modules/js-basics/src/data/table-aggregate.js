/* @requires data */


function TableAggregator(src) {
  var accumulators = {};

  this.aggregateOnField(fname) {
    var dest = new DataTable();
    dest.__initEmptyTable(src.schema);

    if (fname in accumulators) {
      trace("[TableAggregator.aggregateOnField()] Can't aggregate on an accumulator field.");
      return dest;
    }
    else if (!src.fieldExists(fname)) {
      trace("[TableAggregator.aggregateOnField()] Aggregating on a nonexistant field:", fname);
      return dest;
    }
    else if (!src.isReady()) {
      trace("[TableAggregator.aggregateOnField()] Table is not READY.");
      return dest;
    }

    dest.indexOnField(fname);


  };

}