import { traversePaths, getArcPresenceTest } from '../paths/mapshaper-path-utils';
import { compileFeaturePairExpression } from '../expressions/mapshaper-feature-expressions';
import { requireDataField, requirePolygonLayer, requirePointLayer, getLayerBounds, setOutputLayerName } from '../dataset/mapshaper-layer-utils';
import { getArcClassifier } from '../topology/mapshaper-arc-classifier';
import { forEachPoint } from '../points/mapshaper-point-utils';
import { aggregateDataRecords, getCategoryClassifier } from '../dissolve/mapshaper-data-aggregation';
import { mergeDatasetsIntoDataset, mergeDatasets } from '../dataset/mapshaper-merging';
import { importGeoJSON } from '../geojson/geojson-import';
import { DataTable } from '../datatable/mapshaper-data-table';
import cmd from '../mapshaper-cmd';
import geom from '../geom/mapshaper-geom';
import { stop } from '../utils/mapshaper-logging';
import utils from '../utils/mapshaper-utils';

cmd.lines = function(lyr, dataset, opts) {
  opts = opts || {};
  if (opts.callouts) {
    requirePointLayer(lyr);
    return pointsToCallouts(lyr, dataset, opts);
  } else if (lyr.geometry_type == 'point') {
    return pointsToLines(lyr, dataset, opts);
  } else if (opts.segments) {
    return [convertShapesToSegments(lyr, dataset)];
  } else if (opts.arcs) {
    return [convertShapesToArcs(lyr, dataset)];
  } else if (lyr.geometry_type == 'polygon') {
    return polygonsToLines(lyr, dataset.arcs, opts);
  } else {
    requirePolygonLayer(lyr, "Command requires a polygon or point layer");
  }
};

function convertShapesToArcs(lyr, dataset) {
  var arcs = dataset.arcs;
  var test = getArcPresenceTest(lyr.shapes, arcs);
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
}

function convertShapesToSegments(lyr, dataset) {
  var arcs = dataset.arcs;
  var features = [];
  var geojson = {type: 'FeatureCollection', features: []};
  var test = getArcPresenceTest(lyr.shapes, arcs);
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
  var merged = mergeDatasets([dataset, importGeoJSON(geojson, {})]);
  dataset.arcs = merged.arcs;
  // buildTopology(dataset);
  return merged.layers.pop();
}

function pointsToLines(lyr, dataset, opts) {
  var geojson = opts.groupby ?
    groupedPointsToLineGeoJSON(lyr, opts.groupby, opts) :
    pointShapesToLineGeometry(lyr.shapes); // no grouping: return single line with no attributes
  var dataset2 = importGeoJSON(geojson);
  var outputLayers = mergeDatasetsIntoDataset(dataset, [dataset2]);
  // if (!opts.no_replace) {
  //   outputLayers[0].name = lyr.name || outputLayers[0].name;
  // }
  setOutputLayerName(outputLayers[0], lyr, null, opts);
  return outputLayers;
}

function pointsToCallouts(lyr, dataset, opts) {
  var records = lyr.data ? lyr.data.getRecords() : null;
  var calloutLen = getLayerBounds(lyr).width() / 50;
  var pointToSegment = function(p) {
    return [p, [p[0] + calloutLen, p[1]]];
  };
  var geojson = {
    type: 'FeatureCollection',
    features: lyr.shapes.map(function(shp, i) {
      return {
        type: 'Feature',
        properties: records ? records[i] : null,
        geometry: {
          type: 'MultiLineString',
          coordinates: shp.map(pointToSegment)
        }
      };
    })
  };
  var dataset2 = importGeoJSON(geojson);
  var outputLayers = mergeDatasetsIntoDataset(dataset, [dataset2]);
  setOutputLayerName(outputLayers[0], lyr.name, null, opts);
  return outputLayers;
}

function groupedPointsToLineGeoJSON(lyr, field, opts) {
  var groups = [];
  var getGroupId = getCategoryClassifier([field], lyr.data);
  var dataOpts = utils.defaults({fields: [field]}, opts);
  var records = aggregateDataRecords(lyr.data.getRecords(), getGroupId, dataOpts);
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
      geometry: shapes.length > 1 ? pointShapesToLineGeometry(shapes) : null
    };
  });
  return {
    type: 'FeatureCollection',
    features: features
  };
}

// TOOD: automatically convert rings into separate shape parts
function pointShapesToLineGeometry(shapes) {
  var coords = [];
  forEachPoint(shapes, function(p) {
    coords.push(p.concat());
  });
  return {type: 'LineString', coordinates: coords};
}

export function polygonsToLines(lyr, arcs, opts) {
  opts = opts || {};
  var decorateRecord = opts.each ? getLineRecordDecorator(opts.each, lyr, arcs) : null,
      classifier = getArcClassifier(lyr, arcs, {where: opts.where}),
      fields = utils.isArray(opts.fields) ? opts.fields : [],
      rankId = 0,
      shapes = [],
      records = [],
      outputLyr;

  if (fields.length > 0 && !lyr.data) {
    stop("Missing a data table");
  }

  addLines(extractOuterLines(lyr.shapes, classifier), 'outer');

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
    requireDataField(lyr, field);
    addLines(extractLines(lyr.shapes, classifier(key)), field);
  });

  addLines(extractInnerLines(lyr.shapes, classifier), 'inner');
  outputLyr = createLineLayer(shapes, records);
  setOutputLayerName(outputLyr, lyr, null, opts);
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
}


// kludgy way to implement each= option of -lines command
function getLineRecordDecorator(exp, lyr, arcs) {
  // repurpose arc classifier function to convert arc ids to shape ids of original polygons
  var procArcId = getArcClassifier(lyr, arcs)(procShapeIds);
  var compiled = compileFeaturePairExpression(exp, lyr, arcs);
  var tmp;

  function procShapeIds(shpA, shpB) {
    compiled(shpA, shpB, tmp);
  }

  return function(rec, shp) {
    tmp = rec;
    procArcId(shp[0][0]);
    return rec;
  };
}


export function createLineLayer(lines, records) {
  return {
    geometry_type: 'polyline',
    shapes: lines,
    data: records ? new DataTable(records) : null
  };
}

function extractOuterLines(shapes, classifier) {
  var key = function(a, b) {return b == -1 ? String(a) : null;};
  return extractLines(shapes, classifier(key));
}

export function extractInnerLines(shapes, classifier) {
  var key = function(a, b) {return b > -1 ? a + '-' + b : null;};
  return extractLines(shapes, classifier(key));
}

function extractLines(shapes, classify) {
  var lines = [],
      index = {},
      prev = null,
      prevKey = null,
      part;

  traversePaths(shapes, onArc, onPart);

  function onArc(o) {
    var arcId = o.arcId,
        key = classify(arcId),
        isContinuation, line;
    if (key) {
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
}
