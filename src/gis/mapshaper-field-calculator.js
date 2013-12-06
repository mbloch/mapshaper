/* @requires mapshaper-shape-geom, mapshaper-shapes */

MapShaper.evaluateLayers = function(layers, arcs, exp) {
  for (var i=0; i<layers.length; i++) {
    MapShaper.evaluate(layers[i], arcs, exp);
  }
};

MapShaper.evaluate = function(lyr, arcs, exp) {
  var newFields = exp.match(/[A-Za-z_][A-Za-z0-9_]* *(?==[^=])/g) || [],
      dataTable = lyr.data || error("[evaluate()] Missing data table"),
      records = dataTable.getRecords(),
      shapes = lyr.shapes,
      env = new ExpressionContext(arcs),
      func;

  try {
    func = new Function("record,env", "with(env){with(record){" + exp + "}}");
  } catch(e) {
    console.log('Error compiling expression "' + exp + '"');
    stop(e);
  }

  env.$ = env;

  Utils.forEach(records, function(rec, shapeId) {
    for (var i=0, n=newFields.length; i<n; i++) {
      rec[newFields[i]] = null;
    }
    env.__setShape(shapes[shapeId]);
    try {
      func.call(rec, rec, env);
    } catch(e) {
      stop(e);
    }
  });
};

function ExpressionContext(arcs) {
  var _shp = new MultiShape(arcs);

  // TODO: add useful methods like centroidX, centroidY, labelX, labelY
  var getters = {
    partCount: function() {
      return _shp.pathCount;
    }
  };

  Utils.forEach(getters, function(f, name) {
    Object.defineProperty(this, name, {get: f});
  }, this);

  // Can hide global properties during evaluation this way
  // (is this worth doing?)
  Utils.extend(this, {
    global: null,
    window: null,
    setTimeout: null,
    setInterval: null
  });

  this.__setShape = function(shp) {
    _shp.init(shp);
  };
}
