/* @requires mapshaper-shape-geom, mapshaper-shapes */

MapShaper.compileLayerExpression = function(exp, arcs) {
  var env = new LayerExpressionContext(arcs),
      func;
  try {
    func = new Function("env", "with(env){return " + exp + ";}");
  } catch(e) {
    message('Error compiling expression "' + exp + '"');
    stop(e);
  }

  return function(lyr) {
    var value;
    env.__setLayer(lyr);
    try {
      value = func.call(null, env);
    } catch(e) {
      stop(e);
    }
    return value;
  };
};

MapShaper.compileFeatureExpression = function(exp, arcs, shapes, records) {
  if (arcs instanceof ArcDataset === false) error("[compileFeatureExpression()] Missing ArcDataset;", arcs);
  var RE_ASSIGNEE = /[A-Za-z_][A-Za-z0-9_]*(?= *=[^=])/g,
      newFields = exp.match(RE_ASSIGNEE) || null,
      env = {},
      func;
  hideGlobals(env);
  env.$ = new FeatureExpressionContext(arcs, shapes, records);
  exp = MapShaper.removeExpressionSemicolons(exp);
  try {
    func = new Function("record,env", "with(env){with(record) { return " + exp + ";}}");
  } catch(e) {
    message('Error compiling expression "' + exp + '"');
    stop(e);
  }

  return function(shapeId) {
    var record = records[shapeId],
        value, f;

    if (!record) {
      record = {};
      if (newFields) {
        // add (empty) record to data table if there's an assignment
        records[shapeId] = record;
      }
    }

    // initialize new fields to null so assignments work
    if (newFields) {
      for (var i=0; i<newFields.length; i++) {
        f = newFields[i];
        if (f in record === false) {
          record[f] = null;
        }
      }
    }
    env.$.__setId(shapeId);
    try {
      value = func.call(null, record, env);
    } catch(e) {
      stop(e);
    }
    return value;
  };
};

// Semicolons that divide the expression into two or more js statements
// cause problems when 'return' is added before the expression
// (only the first statement is evaluated). Replacing with commas fixes this
//
MapShaper.removeExpressionSemicolons = function(exp) {
  if (exp.indexOf(';') != -1) {
    // remove any ; from end of expression
    exp = exp.replace(/[; ]+$/, '');
    // change any other semicolons to commas
    // (this is not very safe -- what if a string literal contains a semicolon?)
    exp = exp.replace(/;/g, ',');
  }
  return exp;
};

function hideGlobals(obj) {
  // Can hide global properties during expression evaluation this way
  // (is this worth doing?)
  for (var key in this) {
    obj[key] = null;
  }
  obj.console = console;
}

function addGetters(obj, getters) {
  Utils.forEach(getters, function(f, name) {
    Object.defineProperty(obj, name, {get: f});
  });
}

function FeatureExpressionContext(arcs, shapes, records) {
  var _shp = new MultiShape(arcs),
      _self = this,
      _centroid, _innerXY,
      _record,
      _id, _ids, _bounds;

  // TODO: add methods:
  // isClosed / isOpen
  //
  addGetters(this, {
    id: function() {
      return _id;
    },
    // TODO: count hole/s + containing ring as one part
    partCount: function() {
      return _shp.pathCount;
    },
    isNull: function() {
      return _shp.pathCount === 0;
    },
    bounds: function() {
      return shapeBounds().toArray();
    },
    width: function() {
      return shapeBounds().width();
    },
    height: function() {
      return shapeBounds().height();
    },
    area: function() {
      return MapShaper.getShapeArea(_ids, arcs);
    },
    originalArea: function() {
      var i = arcs.getRetainedInterval(),
          area;
      arcs.setRetainedInterval(0);
      area = _self.area;
      arcs.setRetainedInterval(i);
      return area;
    },
    centroidX: function() {
      var p = centroid();
      return p ? p.x : null;
    },
    centroidY: function() {
      var p = centroid();
      return p ? p.y : null;
    },
    interiorX: function() {
      var p = innerXY();
      return p ? p.x : null;
    },
    interiorY: function() {
      var p = innerXY();
      return p ? p.y : null;
    }
  });

  Object.defineProperty(this, 'properties',
    {set: function(obj) {
      if (Utils.isObject(obj)) {
        records[_id] = obj;
      } else {
        stop("Can't assign non-object to $.properties");
      }
    }, get: function() {
      var rec = records[_id];
      if (!rec) {
        rec = records[_id] = {};
      }
      return rec;
    }});

  this.__setId = function(id) {
    _id = id;
    _bounds = null;
    _centroid = null;
    _innerXY = null;
    _record = records[id];
    _ids = shapes[id];
    _shp.init(_ids);
  };

  function centroid() {
    _centroid = _centroid || MapShaper.getShapeCentroid(_ids, arcs);
    return _centroid;
  }

  function innerXY() {
    //_innerXY = centroid(); // TODO: implement
    return null;
  }

  function shapeBounds() {
    if (!_bounds) {
      _bounds = arcs.getMultiShapeBounds(_ids);
    }
    return _bounds;
  }
}

function LayerExpressionContext(arcs) {
  var shapes, properties, lyr;
  hideGlobals(this);
  this.$ = this;

  this.sum = function(exp) {
    return reduce(exp, 0, function(accum, val) {
      return accum + (val || 0);
    });
  };

  this.min = function(exp) {
    var min = reduce(exp, Infinity, function(accum, val) {
      return Math.min(accum, val);
    });
    return min;
  };

  this.max = function(exp) {
    var max = reduce(exp, -Infinity, function(accum, val) {
      return Math.max(accum, val);
    });
    return max;
  };

  this.average = function(exp) {
    /*
    var avg = reduce(exp, NaN, function(accum, val, i) {
      if (i > 0) {
        val = val / (i+1) + accum * i / (i+1);
      }
      return val;
    });
    */
    var sum = this.sum(exp);
    return sum / shapes.length;
  };

  this.median = function(exp) {
    var arr = values(exp);
    return Utils.findMedian(arr);
  };

  this.__setLayer = function(layer) {
    lyr = layer;
    shapes = layer.shapes;
    properties = layer.data ? layer.data.getRecords() : [];
  };

  function values(exp) {
    var compiled = MapShaper.compileFeatureExpression(exp, arcs, shapes, properties);
    return Utils.repeat(shapes.length, compiled);
  }

  function reduce(exp, initial, func) {
    var val = initial,
        compiled = MapShaper.compileFeatureExpression(exp, arcs, shapes, properties);
    for (var i=0, n=shapes.length; i<n; i++) {
      val = func(val, compiled(i), i);
    }
    return val;
  }

  addGetters({
    bounds: function() {
      return MapShaper.calcLayerBounds(lyr, arcs).toArray();
    }
  });
}
