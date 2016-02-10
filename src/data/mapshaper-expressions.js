/* @requires
mapshaper-shape-geom
mapshaper-centroid
mapshaper-shapes
mapshaper-dataset-utils
*/

// Compiled expression returns a value
MapShaper.compileValueExpression = function(exp, lyr, arcs) {
  return MapShaper.compileFeatureExpression(exp, lyr, arcs, true);
};

MapShaper.compileFeatureExpression = function(rawExp, lyr, arcs, returns) {
  var exp = rawExp || '',
      vars = MapShaper.getAssignedVars(exp),
      func, records;

  if (vars.length > 0 && !lyr.data) {
    lyr.data = new DataTable(MapShaper.getFeatureCount(lyr));
  }

  records = lyr.data ? lyr.data.getRecords() : [];
  func = MapShaper.getExpressionFunction(exp, lyr, arcs, returns);
  return function(recId) {
    var record = records[recId];
    if (!record) {
      record = records[recId] = {};
    }
    // initialize new fields to null so assignments work
    for (var i=0; i<vars.length; i++) {
      if (vars[i] in record === false) {
        record[vars[i]] = null;
      }
    }
    return func(record, recId);
  };
};

MapShaper.getAssignedVars = function(exp) {
  var rxp = /[A-Za-z_][A-Za-z0-9_]*(?= *=[^=])/g;
  return exp.match(rxp) || [];
};

MapShaper.getExpressionFunction = function(exp, lyr, arcs, returns) {
  var env = MapShaper.getExpressionContext(lyr, arcs);
  var body = (returns ? 'return ' : '') + exp;
  var func;
  try {
    func = new Function("record,env", "with(env){with(record){ " + body + "}}");
  } catch(e) {
    stop(e.name, "in expression [" + exp + "]");
  }

  return function(rec, i) {
    var val;
    env.$.__setId(i);
    try {
      val = func.call(null, rec, env);
    } catch(e) {
      stop(e.name, "in expression [" + exp + "]:", e.message);
    }
    return val;
  };
};

MapShaper.getExpressionContext = function(lyr, arcs) {
  var env = MapShaper.getBaseContext();
  if (lyr.data) {
    // default to null values when a data field is missing
    lyr.data.getFields().forEach(function(f) {
      env[f] = null;
    });
  }
  env.$ = new FeatureExpressionContext(lyr, arcs);
  return env;
};

MapShaper.getBaseContext = function() {
  var obj = {};
  // Mask global properties (is this effective/worth doing?)
  (function() {
    for (var key in this) {
      obj[key] = null;
    }
  }());
  obj.console = console;
  return obj;
};


function addGetters(obj, getters) {
  Object.keys(getters).forEach(function(name) {
    Object.defineProperty(obj, name, {get: getters[name]});
  });
}

function FeatureExpressionContext(lyr, arcs) {
  var hasData = !!lyr.data,
      hasPoints = MapShaper.layerHasPoints(lyr),
      hasPaths = arcs && MapShaper.layerHasPaths(lyr),
      _isPlanar,
      _self = this,
      _centroid, _innerXY, _xy,
      _record, _records,
      _id, _ids, _bounds;

  if (hasData) {
    _records = lyr.data.getRecords();
    Object.defineProperty(this, 'properties',
      {set: function(obj) {
        if (utils.isObject(obj)) {
          _records[_id] = obj;
        } else {
          stop("Can't assign non-object to $.properties");
        }
      }, get: function() {
        var rec = _records[_id];
        if (!rec) {
          rec = _records[_id] = {};
        }
        return rec;
      }});
  }

  if (hasPaths) {
    _isPlanar = arcs.isPlanar();
    addGetters(this, {
      // TODO: count hole/s + containing ring as one part
      partCount: function() {
        return _ids ? _ids.length : 0;
      },
      isNull: function() {
        return this.partCount === 0;
      },
      bounds: function() {
        return shapeBounds().toArray();
      },
      height: function() {
        return shapeBounds().height();
      },
      width: function() {
        return shapeBounds().width();
      }
    });

    if (lyr.geometry_type == 'polygon') {
      addGetters(this, {
        area: function() {
          return _isPlanar ? geom.getPlanarShapeArea(_ids, arcs) : geom.getSphericalShapeArea(_ids, arcs);
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
        innerX: function() {
          var p = innerXY();
          return p ? p.x : null;
        },
        innerY: function() {
          var p = innerXY();
          return p ? p.y : null;
        }
      });
    }

  } else if (hasPoints) {
    // TODO: add functions like bounds, isNull, pointCount
    Object.defineProperty(this, 'coordinates',
      {set: function(obj) {
        if (!obj || utils.isArray(obj)) {
          lyr.shapes[_id] = obj || null;
        } else {
          stop("Can't assign non-array to $.coordinates");
        }
      }, get: function() {
        return lyr.shapes[_id] || null;
      }});

    addGetters(this, {
      x: function() {
        xy();
        return _xy ? _xy[0] : null;
      },
      y: function() {
        xy();
        return _xy ? _xy[1] : null;
      }
    });
  }

  // all contexts have $.id
  addGetters(this, {id: function() { return _id; }});

  this.__setId = function(id) {
    _id = id;
    if (hasPaths) {
      _bounds = null;
      _centroid = null;
      _innerXY = null;
      _ids = lyr.shapes[id];
    }
    if (hasPoints) {
      _xy = null;
    }
    if (hasData) {
      _record = _records[id];
    }
  };

  function xy() {
    var shape = lyr.shapes[_id];
    if (!_xy) {
      _xy = shape && shape[0] || null;
    }
    return _xy;
  }

  function centroid() {
    _centroid = _centroid || geom.getShapeCentroid(_ids, arcs);
    return _centroid;
  }

  function innerXY() {
    _innerXY = _innerXY || geom.findInteriorPoint(_ids, arcs);
    return _innerXY;
  }

  function shapeBounds() {
    if (!_bounds) {
      _bounds = arcs.getMultiShapeBounds(_ids);
    }
    return _bounds;
  }
}
