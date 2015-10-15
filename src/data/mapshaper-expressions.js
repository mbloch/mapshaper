/* @requires
mapshaper-shape-geom
mapshaper-centroid
mapshaper-shapes
mapshaper-dataset-utils
*/

MapShaper.compileFeatureExpression = function(rawExp, lyr, arcs) {
  var RE_ASSIGNEE = /[A-Za-z_][A-Za-z0-9_]*(?= *=[^=])/g,
      exp = MapShaper.validateExpression(rawExp),
      newFields = exp.match(RE_ASSIGNEE) || null,
      env = MapShaper.getBaseContext(),
      records,
      func;

  if (newFields && !lyr.data) {
    lyr.data = new DataTable(MapShaper.getFeatureCount(lyr));
  }
  if (lyr.data) records = lyr.data.getRecords();

  env.$ = new FeatureExpressionContext(lyr, arcs);
  try {
    func = new Function("record,env", "with(env){with(record) { return " +
        MapShaper.removeExpressionSemicolons(exp) + "}}");
  } catch(e) {
    stop(e.name, "in expression [" + exp + "]");
  }

  var compiled = function(recId) {
    var record = records ? records[recId] || (records[recId] = {}) : {},
        value, f;

    // initialize new fields to null so assignments work
    if (newFields) {
      for (var i=0; i<newFields.length; i++) {
        f = newFields[i];
        if (f in record === false) {
          record[f] = null;
        }
      }
    }
    env.$.__setId(recId);
    try {
      value = func.call(null, record, env);
    } catch(e) {
      stop(e.name, "in expression [" + exp + "]:", e.message);
    }
    return value;
  };

  compiled.context = env;
  return compiled;
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

MapShaper.validateExpression = function(exp) {
  exp = exp || '';
  return MapShaper.removeExpressionSemicolons(exp);
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
