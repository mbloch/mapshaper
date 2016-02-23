/* @requires mapshaper-shape-utils */

api.innerlines = function(lyr, arcs, opts) {
  MapShaper.requirePolygonLayer(lyr, "[innerlines] Command requires a polygon layer");
  var classifier = MapShaper.getArcClassifier(lyr.shapes, arcs);
  var lines = MapShaper.extractInnerLines(lyr.shapes, classifier);
  var outputLyr = MapShaper.createLineLayer(lines, null);

  if (lines.length === 0) {
    message("[innerlines] No shared boundaries were found");
  }
  outputLyr.name = opts && opts.no_replace ? null : lyr.name;
  return outputLyr;
};

api.lines = function(lyr, arcs, opts) {
  opts = opts || {};
  var classifier = MapShaper.getArcClassifier(lyr.shapes, arcs),
      fields = utils.isArray(opts.fields) ? opts.fields : [],
      typeId = 0,
      shapes = [],
      records = [],
      outputLyr;

  MapShaper.requirePolygonLayer(lyr, "[lines] Command requires a polygon layer");
  if (fields.length > 0 && !lyr.data) {
    stop("[lines] Missing a data table");
  }

  addLines(MapShaper.extractOuterLines(lyr.shapes, classifier));

  fields.forEach(function(field) {
    var data = lyr.data.getRecords();
    var key = function(a, b) {
      var arec = data[a];
      var brec = data[b];
      var aval, bval;
      if (!arec || !brec || arec[field] === brec[field]) {
        return '';
      }
      return a + '-' + b;
    };
    if (!lyr.data.fieldExists(field)) {
      stop("[lines] Unknown data field:", field);
    }
    addLines(MapShaper.extractLines(lyr.shapes, classifier(key)));
  });

  addLines(MapShaper.extractInnerLines(lyr.shapes, classifier));
  outputLyr = MapShaper.createLineLayer(shapes, records);
  outputLyr.name = opts.no_replace ? null : lyr.name;
  return outputLyr;

  function addLines(lines) {
    var attr = lines.map(function(shp, i) {
      return {TYPE: typeId};
    });
    shapes = utils.merge(lines, shapes);
    records = utils.merge(attr, records);
    typeId++;
  }
};

MapShaper.createLineLayer = function(lines, records) {
  return {
    geometry_type: 'polyline',
    shapes: lines,
    data: records ? new DataTable(records) : null
  };
};

MapShaper.extractOuterLines = function(shapes, classifier) {
  var key = function(a, b) {return b == -1 ? String(a) : '';};
  return MapShaper.extractLines(shapes, classifier(key));
};

MapShaper.extractInnerLines = function(shapes, classifier) {
  var key = function(a, b) {return b > -1 ? a + '-' + b : '';};
  return MapShaper.extractLines(shapes, classifier(key));
};

MapShaper.extractLines = function(shapes, classify) {
  var lines = [],
      index = {},
      prev = null,
      prevKey = '',
      part;

  MapShaper.traversePaths(shapes, onArc, onPart);

  function onArc(o) {
    var arcId = o.arcId,
        key = classify(absArcId(arcId)),
        isContinuation, line;
    if (!!key) {
      line = key in index ? index[key] : null;
      isContinuation = key == prevKey && o.shapeId == prev.shapeId && o.partId == prev.partId;
      if (!line) {
        line = [[arcId]]; // new shape
        index[key] = line;
        lines.push(line);
      } else if (isContinuation) {
        line[line.length-1].push(arcId); // extending prev part
      } else {
        line.push([arcId]); // new part
      }

      // if extracted line is split across endpoint of original polygon ring, then merge
      if (o.i == part.arcs.length - 1 &&  // this is last arc in ring
          line.length > 1 &&              // extracted line has more than one part
          line[0][0] == part.arcs[0]) {   // first arc of first extracted part is first arc in ring
        line[0] = line.pop().concat(line[0]);
      }
    }
    prev = o;
    prevKey = key;
  }

  function onPart(o) {
    part = o;
  }

  return lines;
};


MapShaper.getArcClassifier = function(shapes, arcs) {
  var n = arcs.size(),
      a = new Int32Array(n),
      b = new Int32Array(n);

  utils.initializeArray(a, -1);
  utils.initializeArray(b, -1);

  MapShaper.traversePaths(shapes, function(o) {
    var i = absArcId(o.arcId);
    var shpId = o.shapeId;
    var aval = a[i];
    if (aval == -1) {
      a[i] = shpId;
    } else if (shpId < aval) {
      b[i] = aval;
      a[i] = shpId;
    } else {
      b[i] = shpId;
    }
  });

  function classify(i, getKey) {
    var key = '';
    if (a[i] > -1) {
      key = getKey(a[i], b[i]);
      if (key) {
        a[i] = -1;
        b[i] = -1;
      }
    }
    return key;
  }

  return function(getKey) {
    return function(i) {
      return classify(i, getKey);
    };
  };
};
