/* @requires mapshaper-shape-geom, mapshaper-shapes */

MapShaper.compileLayerExpression = function(exp, arcs) {
  var env = new LayerExpressionContext(arcs),
      func;
  try {
    func = new Function("env", "with(env){return " + exp + ";}");
  } catch(e) {
    console.log('Error compiling expression "' + exp + '"');
    stop(e);
  }

  return function(lyr) {
    var value;
    env.__setLayer(lyr);
    try {
      value = func.call(env, env);
    } catch(e) {
      stop(e);
    }
    return value;
  };
};

MapShaper.compileFieldExpression = function(exp, arcs, shapes, records) {
  if (arcs instanceof ArcDataset === false) error("[compileFieldExpression()] Missing ArcDataset;", arcs);
  var newFields = exp.match(/[A-Za-z_][A-Za-z0-9_]*(?= *=[^=])/g) || [],
      env = new RecordExpressionContext(arcs),
      func;

  exp = MapShaper.removeExpressionSemicolons(exp);

  try {
    func = new Function("record,env", "with(env){with(record) { return " + exp + ";}}");
  } catch(e) {
    console.log('Error compiling expression "' + exp + '"');
    stop(e);
  }

  return function(shapeId) {
    var shape = shapes[shapeId],
        record = records[shapeId],
        value, f;
    for (var i=0; i<newFields.length; i++) {
      f = newFields[i];
      if (f in record === false) {
        record[f] = null;
      }
    }
    env.__setShape(shape, shapeId);
    try {
      value = func.call(env, record, env);
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
    exp = exp.replace(';', ',');
  }
  return exp;
};

function hideGlobals(obj) {
  // Can hide global properties during expression evaluation this way
  // (is this worth doing?)
  Utils.extend(obj, {
    global: null,
    window: null,
    setTimeout: null,
    setInterval: null
  });
}

function addGetters(obj, getters) {
  Utils.forEach(getters, function(f, name) {
    Object.defineProperty(obj, name, {get: f});
  });
}

function RecordExpressionContext(arcs) {
  var _shp = new MultiShape(arcs),
      _i, _ids, _bounds;

  this.$ = this;
  hideGlobals(this);

  // TODO: add useful methods:
  // isClosed / isOpen
  // centroidX
  // centroidY
  // labelX
  // labelY
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
    }
  });

  this.__setShape = function(shp, id) {
    _bounds = null;
    _ids = shp;
    _id = id;
    _shp.init(shp);
  };

  function shapeBounds() {
    if (!_bounds) {
      _bounds = arcs.getMultiShapeBounds();
    }
    return _bounds;
  }
}

function LayerExpressionContext(arcs) {
  var shapes, properties, lyr;
  hideGlobals(this);

  this.sum = function(exp) {
    var f = MapShaper.compileFieldExpression(exp, arcs, shapes, properties),
        total = 0;
    for (var i=0; i<shapes.length; i++) {
      total += f(i) || 0;
    }
    return total;
  };

  this.__setLayer = function(layer) {
    lyr = layer;
    shapes = layer.shapes;
    properties = layer.data ? layer.data.getRecords() : [];
  };

  addGetters({
    bounds: function() {
      return MapShaper.calcLayerBounds(lyr, arcs).toArray();
    }
  });
}
