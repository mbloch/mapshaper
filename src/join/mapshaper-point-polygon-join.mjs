import { joinTableToLayer } from '../join/mapshaper-join-tables';
import { stop } from '../utils/mapshaper-logging';
import { PathIndex } from '../paths/mapshaper-path-index';
import { DataTable } from '../datatable/mapshaper-data-table';

export function joinPointsToPolygons(targetLyr, arcs, pointLyr, opts) {
  // TODO: option to copy points that can't be joined to a new layer
  var joinFunction = getPolygonToPointsFunction(targetLyr, arcs, pointLyr, opts);
  prepJoinLayers(targetLyr, pointLyr);
  return joinTableToLayer(targetLyr, pointLyr.data, joinFunction, opts);
}

export function joinPolygonsToPoints(targetLyr, polygonLyr, arcs, opts) {
  var joinFunction = getPointToPolygonsFunction(targetLyr, polygonLyr, arcs, opts);
  prepJoinLayers(targetLyr, polygonLyr);
  return joinTableToLayer(targetLyr, polygonLyr.data, joinFunction, opts);
}

export function prepJoinLayers(targetLyr, srcLyr) {
  if (!targetLyr.data) {
    // create an empty data table if target layer is missing attributes
    targetLyr.data = new DataTable(targetLyr.shapes.length);
  }
  if (!srcLyr.data) {
    stop("Can't join a layer that is missing attribute data");
  }
}

export function getPolygonToPointsFunction(polygonLyr, arcs, pointLyr, opts) {
  // Build a reverse lookup table for mapping polygon ids to point ids.
  var joinFunction = getPointToPolygonsFunction(pointLyr, polygonLyr, arcs, opts);
  var index = [];
  var firstMatch = !!opts.first_match; // a point is assigned to the first matching polygon
  var hits, polygonId;
  pointLyr.shapes.forEach(function(shp, pointId) {
    var polygonIds = joinFunction(pointId);
    var n = polygonIds ? polygonIds.length : 0;
    var polygonId;
    for (var i=0; i<n; i++) {
      polygonId = polygonIds[i];
      if (polygonId in index) {
        index[polygonId].push(pointId);
      } else {
        index[polygonId] = [pointId];
      }
      if (firstMatch) break;
    }
  });

  return function(polygonId) {
    return index[polygonId] || null;
  };
}


// Returned function gets ids of all polygons that intersect a point (or the first
//   point of multipoint features). TODO: handle multipoint features properly.
function getPointToPolygonsFunction(pointLyr, polygonLyr, arcs, opts) {
  var index = new PathIndex(polygonLyr.shapes, arcs),
      points = pointLyr.shapes;

  return function(pointId) {
    var shp = points[pointId],
        polygonIds = shp ? index.findEnclosingShapes(shp[0]) : [];
    return polygonIds.length > 0 ? polygonIds : null;
  };
}


// TODO: remove (replaced by getPointToPolygonsFunction())
function getPointToPolygonFunction(pointLyr, polygonLyr, arcs, opts) {
  var index = new PathIndex(polygonLyr.shapes, arcs),
      points = pointLyr.shapes;

  // @i id of a point feature
  return function(i) {
    var shp = points[i],
        shpId = -1;
    if (shp) {
      // TODO: handle multiple hits
      shpId = index.findEnclosingShape(shp[0]);
    }
    return shpId == -1 ? null : [shpId];
  };
}
