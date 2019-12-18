/* @requires mapshaper-shape-utils, mapshaper-arc-classifier, mapshaper-point-utils */

api.lines = function(lyr, dataset, opts) {
  opts = opts || {};
  if (lyr.geometry_type == 'point') {
    return internal.pointsToLines(lyr, dataset, opts);
  } else if (opts.segments) {
    return [internal.convertShapesToSegments(lyr, dataset)];
  } else if (opts.arcs) {
    return [internal.convertShapesToArcs(lyr, dataset)];
  } else if (lyr.geometry_type == 'polygon') {
    return internal.polygonsToLines(lyr, dataset.arcs, opts);
  } else {
    internal.requirePolygonLayer(lyr, "Command requires a polygon or point layer");
  }
};

internal.convertShapesToArcs = function(lyr, dataset) {
  var arcs = dataset.arcs;
  var test = internal.getArcPresenceTest(lyr.shapes, arcs);
  var records = [];
  var shapes = [];
  for (var i=0, n=arcs.size(); i<n; i++) {
    if (!test(i)) continue;
    records.push({arcid: i});
    shapes.push([[i]]);
  }
  return {
    geometry_type: 'polyline',
    data: new DataTable(records),
    shapes: shapes
  };
};

internal.convertShapesToSegments = function(lyr, dataset) {
  var arcs = dataset.arcs;
  var features = [];
  var geojson = {type: 'FeatureCollection', features: []};
  var test = internal.getArcPresenceTest(lyr.shapes, arcs);
  var arcId;
  for (var i=0, n=arcs.size(); i<n; i++) {
    arcId = i;
    if (!test(arcId)) continue;
    arcs.forEachArcSegment(arcId, onSeg);
  }
  function onSeg(i1, i2, xx, yy) {
    var a = xx[i1],
        b = yy[i1],
        c = xx[i2],
        d = yy[i2];
    geojson.features.push({
      type: 'Feature',
      properties: {arc: arcId, i1: i1, i2: i2, x1: a, y1: b, x2: c, y2: d},
      geometry: {type: 'LineString', coordinates: [[a, b], [c, d]]}
    });
  }
  var merged = internal.mergeDatasets([dataset, internal.importGeoJSON(geojson, {})]);
  dataset.arcs = merged.arcs;
  // api.buildTopology(dataset);
  return merged.layers.pop();
};

internal.pointsToLines = function(lyr, dataset, opts) {
  var geojson = opts.groupby ?
    internal.groupedPointsToLineGeoJSON(lyr, opts.groupby, opts) :
    internal.pointShapesToLineGeometry(lyr.shapes); // no grouping: return single line with no attributes
  var dataset2 = internal.importGeoJSON(geojson);
  var outputLayers = internal.mergeDatasetsIntoDataset(dataset, [dataset2]);
  if (!opts.no_replace) {
    outputLayers[0].name = lyr.name || outputLayers[0].name;
  }
  return outputLayers;
};

internal.groupedPointsToLineGeoJSON = function(lyr, field, opts) {
  var groups = [];
  var getGroupId = internal.getCategoryClassifier([field], lyr.data);
  var dataOpts = utils.defaults({fields: [field]}, opts);
  var records = internal.aggregateDataRecords(lyr.data.getRecords(), getGroupId, dataOpts);
  var features;
  lyr.shapes.forEach(function(shape, i) {
    var groupId = getGroupId(i);
    if (groupId in groups === false) {
      groups[groupId] = [];
    }
    groups[groupId].push(shape);
  });
  features = groups.map(function(shapes, i) {
    return {
      type: 'Feature',
      properties: records[i],
      geometry: shapes.length > 1 ? internal.pointShapesToLineGeometry(shapes) : null
    };
  });
  return {
    type: 'FeatureCollection',
    features: features
  };
};

// TOOD: automatically convert rings into separate shape parts
internal.pointShapesToLineGeometry = function(shapes) {
  var coords = [];
  internal.forEachPoint(shapes, function(p) {
    coords.push(p.concat());
  });
  return {type: 'LineString', coordinates: coords};
};

internal.polygonsToLines = function(lyr, arcs, opts) {
  opts = opts || {};
  var filter = opts.where ? internal.compileFeaturePairFilterExpression(opts.where, lyr, arcs) : null,
      decorateRecord = opts.each ? internal.getLineRecordDecorator(opts.each, lyr, arcs) : null,
      classifier = internal.getArcClassifier(lyr.shapes, arcs, {filter: filter}),
      fields = utils.isArray(opts.fields) ? opts.fields : [],
      rankId = 0,
      shapes = [],
      records = [],
      outputLyr;

  if (fields.length > 0 && !lyr.data) {
    stop("Missing a data table");
  }

  addLines(internal.extractOuterLines(lyr.shapes, classifier), 'outer');

  fields.forEach(function(field) {
    var data = lyr.data.getRecords();
    var key = function(a, b) {
      var arec = data[a];
      var brec = data[b];
      var aval, bval;
      if (!arec || !brec || arec[field] === brec[field]) {
        return null;
      }
      return a + '-' + b;
    };
    internal.requireDataField(lyr, field);
    addLines(internal.extractLines(lyr.shapes, classifier(key)), field);
  });

  addLines(internal.extractInnerLines(lyr.shapes, classifier), 'inner');
  outputLyr = internal.createLineLayer(shapes, records);
  outputLyr.name = opts.no_replace ? null : lyr.name;
  return outputLyr;

  function addLines(lines, typeName) {
    var attr = lines.map(function(shp, i) {
      var rec = {RANK: rankId, TYPE: typeName};
      if (decorateRecord) decorateRecord(rec, shp);
      return rec;
    });
    shapes = utils.merge(lines, shapes);
    records = utils.merge(attr, records);
    rankId++;
  }
};


// kludgy way to implement each= option of -lines command
internal.getLineRecordDecorator = function(exp, lyr, arcs) {
  // repurpose arc classifier function to convert arc ids to shape ids of original polygons
  var procArcId = internal.getArcClassifier(lyr.shapes, arcs)(procShapeIds);
  var compiled = internal.compileFeaturePairExpression(exp, lyr, arcs);
  var tmp;

  function procShapeIds(shpA, shpB) {
    compiled(shpA, shpB, tmp);
  }

  return function(rec, shp) {
    tmp = rec;
    procArcId(shp[0][0]);
    return rec;
  };
};


internal.createLineLayer = function(lines, records) {
  return {
    geometry_type: 'polyline',
    shapes: lines,
    data: records ? new DataTable(records) : null
  };
};

internal.extractOuterLines = function(shapes, classifier) {
  var key = function(a, b) {return b == -1 ? String(a) : null;};
  return internal.extractLines(shapes, classifier(key));
};

internal.extractInnerLines = function(shapes, classifier) {
  var key = function(a, b) {return b > -1 ? a + '-' + b : null;};
  return internal.extractLines(shapes, classifier(key));
};

internal.extractLines = function(shapes, classify) {
  var lines = [],
      index = {},
      prev = null,
      prevKey = null,
      part;

  internal.traversePaths(shapes, onArc, onPart);

  function onArc(o) {
    var arcId = o.arcId,
        key = classify(arcId),
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
