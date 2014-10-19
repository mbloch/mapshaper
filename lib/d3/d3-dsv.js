!function(){
  var d3 = {version: "3.4.13"}; // semver
function d3_class(ctor, properties) {
  for (var key in properties) {
    Object.defineProperty(ctor.prototype, key, {
      value: properties[key],
      enumerable: false
    });
  }
}

d3.map = function(object) {
  var map = new d3_Map;
  if (object instanceof d3_Map) object.forEach(function(key, value) { map.set(key, value); });
  else for (var key in object) map.set(key, object[key]);
  return map;
};

function d3_Map() {
  this._ = Object.create(null);
}

var d3_map_proto = "__proto__",
    d3_map_zero = "\0";

d3_class(d3_Map, {
  has: d3_map_has,
  get: function(key) {
    return this._[d3_map_escape(key)];
  },
  set: function(key, value) {
    return this._[d3_map_escape(key)] = value;
  },
  remove: d3_map_remove,
  keys: d3_map_keys,
  values: function() {
    var values = [];
    for (var key in this._) values.push(this._[key]);
    return values;
  },
  entries: function() {
    var entries = [];
    for (var key in this._) entries.push({key: d3_map_unescape(key), value: this._[key]});
    return entries;
  },
  size: d3_map_size,
  empty: d3_map_empty,
  forEach: function(f) {
    for (var key in this._) f.call(this, d3_map_unescape(key), this._[key]);
  }
});

function d3_map_escape(key) {
  return (key += "") === d3_map_proto || key[0] === d3_map_zero ? d3_map_zero + key : key;
}

function d3_map_unescape(key) {
  return (key += "")[0] === d3_map_zero ? key.slice(1) : key;
}

function d3_map_has(key) {
  return d3_map_escape(key) in this._;
}

function d3_map_remove(key) {
  return (key = d3_map_escape(key)) in this._ && delete this._[key];
}

function d3_map_keys() {
  var keys = [];
  for (var key in this._) keys.push(d3_map_unescape(key));
  return keys;
}

function d3_map_size() {
  var size = 0;
  for (var key in this._) ++size;
  return size;
}

function d3_map_empty() {
  for (var key in this._) return false;
  return true;
}

d3.set = function(array) {
  var set = new d3_Set;
  if (array) for (var i = 0, n = array.length; i < n; ++i) set.add(array[i]);
  return set;
};

function d3_Set() {
  this._ = Object.create(null);
}

d3_class(d3_Set, {
  has: d3_map_has,
  add: function(key) {
    this._[d3_map_escape(key += "")] = true;
    return key;
  },
  remove: d3_map_remove,
  values: d3_map_keys,
  size: d3_map_size,
  empty: d3_map_empty,
  forEach: function(f) {
    for (var key in this._) f.call(this, d3_map_unescape(key));
  }
});

d3.dsv = function(delimiter) {
  var reFormat = new RegExp("[\"" + delimiter + "\n]"),
      delimiterCode = delimiter.charCodeAt(0);

  var dsv = {};

  function response(request) {
    return dsv.parse(request.responseText);
  }

  function typedResponse(f) {
    return function(request) {
      return dsv.parse(request.responseText, f);
    };
  }

  dsv.parse = function(text, f) {
    var o;
    return dsv.parseRows(text, function(row, i) {
      if (o) return o(row, i - 1);
      var a = new Function("d", "return {" + row.map(function(name, i) {
        return JSON.stringify(name) + ": d[" + i + "]";
      }).join(",") + "}");
      o = f ? function(row, i) { return f(a(row), i); } : a;
    });
  };

  dsv.parseRows = function(text, f) {
    var EOL = {}, // sentinel value for end-of-line
        EOF = {}, // sentinel value for end-of-file
        rows = [], // output rows
        N = text.length,
        I = 0, // current character index
        n = 0, // the current line number
        t, // the current token
        eol; // is the current token followed by EOL?

    function token() {
      if (I >= N) return EOF; // special case: end of file
      if (eol) return eol = false, EOL; // special case: end of line

      // special case: quotes
      var j = I;
      if (text.charCodeAt(j) === 34) {
        var i = j;
        while (i++ < N) {
          if (text.charCodeAt(i) === 34) {
            if (text.charCodeAt(i + 1) !== 34) break;
            ++i;
          }
        }
        I = i + 2;
        var c = text.charCodeAt(i + 1);
        if (c === 13) {
          eol = true;
          if (text.charCodeAt(i + 2) === 10) ++I;
        } else if (c === 10) {
          eol = true;
        }
        return text.slice(j + 1, i).replace(/""/g, "\"");
      }

      // common case: find next delimiter or newline
      while (I < N) {
        var c = text.charCodeAt(I++), k = 1;
        if (c === 10) eol = true; // \n
        else if (c === 13) { eol = true; if (text.charCodeAt(I) === 10) ++I, ++k; } // \r|\r\n
        else if (c !== delimiterCode) continue;
        return text.slice(j, I - k);
      }

      // special case: last token before EOF
      return text.slice(j);
    }

    while ((t = token()) !== EOF) {
      var a = [];
      while (t !== EOL && t !== EOF) {
        a.push(t);
        t = token();
      }
      if (f && (a = f(a, n++)) == null) continue;
      rows.push(a);
    }

    return rows;
  };

  dsv.format = function(rows) {
    if (Array.isArray(rows[0])) return dsv.formatRows(rows); // deprecated; use formatRows
    var fieldSet = new d3_Set, fields = [];

    // Compute unique fields in order of discovery.
    rows.forEach(function(row) {
      for (var field in row) {
        if (!fieldSet.has(field)) {
          fields.push(fieldSet.add(field));
        }
      }
    });

    return [fields.map(formatValue).join(delimiter)].concat(rows.map(function(row) {
      return fields.map(function(field) {
        return formatValue(row[field]);
      }).join(delimiter);
    })).join("\n");
  };

  dsv.formatRows = function(rows) {
    return rows.map(formatRow).join("\n");
  };

  function formatRow(row) {
    return row.map(formatValue).join(delimiter);
  }

  function formatValue(text) {
    return reFormat.test(text) ? "\"" + text.replace(/\"/g, "\"\"") + "\"" : text;
  }

  return dsv;
};
  if (typeof define === "function" && define.amd) define(d3);
  else if (typeof module === "object" && module.exports) module.exports = d3;
  this.d3 = d3;
}();
