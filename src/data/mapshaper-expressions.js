/* @requires
mapshaper-shape-geom
mapshaper-centroid
mapshaper-shapes
mapshaper-dataset-utils
*/

MapShaper.compileFeatureExpression = function(exp, lyr, arcs) {
  var RE_ASSIGNEE = /[A-Za-z_][A-Za-z0-9_]*(?= *=[^=])/g,
      newFields = exp.match(RE_ASSIGNEE) || null,
      env = {},
      records,
      func;

  if (newFields && !lyr.data) {
    lyr.data = new DataTable(MapShaper.getFeatureCount(lyr));
  }
  if (lyr.data) records = lyr.data.getRecords();

  hideGlobals(env);
  env.$ = new FeatureExpressionContext(lyr, arcs);
  try {
    func = new Function("record,env", "with(env){with(record) { return " +
        MapShaper.removeExpressionSemicolons(exp) + ";}}");
  } catch(e) {
    message('Error compiling expression "' + exp + '"');
    stop(e);
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
      message(e.stack);
      stop("An error occurred while running expression:", exp);
    }
    return value;
  };

  compiled.context = env;
  return compiled;
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
  utils.forEach(getters, function(f, name) {
    Object.defineProperty(obj, name, {get: f});
  });
}

function FeatureExpressionContext(lyr, arcs) {
  var hasData = !!lyr.data,
      hasPoints = MapShaper.layerHasPoints(lyr),
      hasPaths = arcs && MapShaper.layerHasPaths(lyr),
      _shp,
      _isLatLng,
      _self = this,
      _centroid, _innerXY,
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
    _shp = new MultiShape(arcs);
    _isLatLng = MapShaper.probablyDecimalDegreeBounds(arcs.getBounds());
    addGetters(this, {
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
          return _isLatLng ? geom.getSphericalShapeArea(_ids, arcs) : geom.getShapeArea(_ids, arcs);
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
      _shp.init(_ids);
    }
    if (hasData) {
      _record = _records[id];
    }
  };

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
