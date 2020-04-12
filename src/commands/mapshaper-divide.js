
import { joinTables } from '../join/mapshaper-join-tables';
import { forEachShapePart } from '../paths/mapshaper-shape-utils';
import { requirePolygonLayer } from '../dataset/mapshaper-layer-utils';
import { addIntersectionCuts } from '../paths/mapshaper-intersection-cuts';
import { mergeLayersForOverlay } from '../clipping/mapshaper-overlay-utils';
import { requirePolylineLayer } from '../dataset/mapshaper-layer-utils';
import cmd from '../mapshaper-cmd';
import { PathIndex } from '../paths/mapshaper-path-index';
import { DataTable } from '../datatable/mapshaper-data-table';
import { absArcId } from '../paths/mapshaper-arc-utils';
import utils from '../utils/mapshaper-utils';

cmd.divide = function(targetLayers, targetDataset, source, opts) {
  targetLayers.forEach(requirePolylineLayer);
  var mergedDataset = mergeLayersForOverlay(targetLayers, targetDataset, source, opts);
  var nodes = addIntersectionCuts(mergedDataset, opts);
  var polygonLyr = mergedDataset.layers.pop();
  requirePolygonLayer(polygonLyr);
  // Assume that topology is now built
  targetDataset.arcs = mergedDataset.arcs;
  targetLayers.forEach(function(polylineLyr) {
    dividePolylineLayer(polylineLyr, polygonLyr, nodes, opts);
  });
};

function dividePolylineLayer(polylineLyr, polygonLyr, nodes, opts) {
  var index = new PathIndex(polygonLyr.shapes, nodes.arcs);
  var records = polylineLyr.data ? polylineLyr.data.getRecords() : [];
  var shapes2 = [];
  var records2 = [];
  var index2 = [];
  var outputLines;
  var outputKeys;
  var outputMatches;
  polylineLyr.shapes.forEach(function(shp, i) {
    var rec = records[i] || {};
    if (!shp) {
      // case: record with no geometry -- retain in the output layer
      shapes2.push(null);
      records2.push(rec);
      return;
    }
    outputLines = [];
    outputKeys = [];
    outputMatches = [];
    forEachShapePart(shp, onPart);
    outputLines.forEach(function(shape2, i) {
      shapes2.push(shape2);
      records2.push(i > 0 ? utils.extend({}, rec) : rec); // assume input data is being replaced
      index2.push(outputMatches[i]);
    });
  });
  polylineLyr.shapes = shapes2;
  polylineLyr.data = new DataTable(records2);
  joinTables(polylineLyr.data, polygonLyr.data, function(i) {
    return index2[i] || [];
  }, opts);

  function addDividedParts(parts, keys, matches) {
    var keyId, key;
    for (var i=0; i<parts.length; i++) {
      key = keys[i];
      keyId = outputKeys.indexOf(key);
      if (keyId == -1) {
        outputKeys.push(key);
        outputLines.push([parts[i]]);
        outputMatches.push(matches[i]);
      } else {
        outputLines[keyId].push(parts[i]);
      }
    }
  }

  function getKey(shapeIds) {
    return shapeIds.sort().join(',');
    // multiple matches: treat like no match
    // return shapeIds.length == 1 ? String(shapeIds[0]) : '-1';
  }

  // Partition each part
  function onPart(ids) {
    var parts2 = [];
    var keys2 = [];
    var matches2 = [];
    var prevKey = null;
    var containingIds, key, part2, arcId;
    // assign each arc to a divided shape
    for (var i=0, n=ids.length; i<n; i++) {
      arcId = ids[i];
      containingIds = index.findShapesEnclosingArc(absArcId(arcId));
      key = getKey(containingIds);
      if (key === prevKey) {
        // case: continuation of a part
        part2.push(arcId);
      } else {
        // case: start of a new part
        part2 = [arcId];
        parts2.push(part2);
        keys2.push(key);
        matches2.push(containingIds);
      }
      prevKey = key;
    }
    addDividedParts(parts2, keys2, matches2);
  }
}
