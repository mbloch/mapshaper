/* @requires data */


TabDataParser.parse = function(str) {
  return new TabDataParser().procString(str);
}

/**
 * Imports tab-delimited text data into DataTable-compatible format.
 * @constructor
 */
function TabDataParser() {
  // TODO: move methods into prototype

  var numFields;
  var fieldIndex = {};
  var fieldTypes = [];
  var fieldData = [];
  var numRecords = 0;

  this.procString = function(str) {
    // Split string into an array of lines
    // Note: doesn't work with old-style mac newlines (i.e. \r)
    var lines = str.split(/\r?\n/g);
    return procLines(lines);
  };

  this.parse = this.procString;

  /**
   * Convert arrays of strings for import into DataTable.
   * @param {Array} headerParts An array of headers in "fieldname:type" format.
   * @param {Array} bodyParts An array of arrays containing data.
   * @return {Object} Object containing data for import into DataTable.
   */
  this.procArrayData = function(headerParts, bodyParts) {
    parseHeaderParts(headerParts);
    var len = bodyParts.length;
    for (var i = 0; i < len; i++) {
      parseRecordParts(bodyParts[i]);
    }

    return exportData();
  };


  function parseHeaderParts(parts) {
    numFields = parts.length;

    for (var j = 0; j < numFields; j++) {
      var obj = parseFieldHeader(parts[j]);
      fieldIndex[obj.name] = j;
      fieldTypes[j] = obj.type;
      fieldData[j] = [];
    }
  }


  function parseRecordParts(parts) {
    var numParts = parts.length;
    if (numParts == 0 || parts[0].charAt(0) === '#') {
      return;
    }

    for (var j = 0; j < numFields; j++) {
      // Fill out short rows.
      // TODO: Better handling of imperfect rows.
      var val = j >= numParts ? '' : parts[j];

      var type = fieldTypes[j];
      if (type == C.DOUBLE) {
        val = parseFloat(val);
      }
      else if (type == C.INTEGER) {
        val = parseInt(val, 10); //  | 0; // coerce to '0' if NaN
      }
      /*
      else if (type == C.STRING) {
        // TODO: Consider stripping quotes
        // TODO: Implement text type, with special characters.
      }*/
      fieldData[j].push(val);
    }
    numRecords++;
  }


  function procLines(lines) {
    var numLines = lines.length;
    var headerParts = lines[0].split('\t');

    parseHeaderParts(headerParts);

    // parse records
    //
    for (var i = 1; i < numLines; i++) {
      var lineStr = lines[i];
      // skip comments and blank lines
      if (lineStr.length === 0) {
        continue;
      }

      var parts = lineStr.split('\t');
      parseRecordParts(parts);
    }

    return exportData();
  }


  function exportData() {
    // return schema and parsed data
    var schema = {};
    var data = {};
    for (var fname in fieldIndex) {
      if (!fieldIndex.hasOwnProperty(fname)) {
        continue
      }
      var id = fieldIndex[fname];
      schema[fname] = fieldTypes[id];
      data[fname] = fieldData[id];
    }

    var obj = { schema: schema, data: data, length: numRecords };
    return obj;
  }

  function parseFieldHeader(str) {
    var fType = C.STRING;
    var fName;
    if (str.indexOf(':') == -1) { // colon indicates a type definition, e.g. "name:str"
      fName = str;
    }
    else {
      var parts = str.split(':');
      fName = parts[0];
      fType = DataTable.validateFieldType(parts[1]) || fType;
    }

    return {name: fName, type: fType};
  }
}
