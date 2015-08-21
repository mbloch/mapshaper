/* @requires mapshaper-path-index */


api.joinPointsToPolygons = function(targetLyr, arcs, pointLyr, opts) {
  // TODO: copy points that can't be joined to a new layer
  var joinFunction = MapShaper.getPolygonToPointsFunction(targetLyr, arcs, pointLyr, opts);
  MapShaper.prepJoinLayers(targetLyr, pointLyr);
  MapShaper.joinTables(targetLyr.data, pointLyr.data, joinFunction, opts);
};

api.joinPolygonsToPoints = function(targetLyr, polygonLyr, arcs, opts) {
  var joinFunction = MapShaper.getPointToPolygonFunction(targetLyr, polygonLyr, arcs, opts);
  MapShaper.prepJoinLayers(targetLyr, polygonLyr);
  MapShaper.joinTables(targetLyr.data, polygonLyr.data, joinFunction, opts);
};

MapShaper.prepJoinLayers = function(targetLyr, srcLyr) {
  if (!targetLyr.data) {
    // create an empty data table if target layer is missing attributes
    targetLyr.data = new DataTable(targetLyr.shapes.length);
  }
  if (!srcLyr.data) {
    stop("[join] Can't join a layer that is missing attribute data");
  }
};

MapShaper.getPolygonToPointsFunction = function(polygonLyr, arcs, pointLyr, opts) {
  var joinFunction = MapShaper.getPointToPolygonFunction(pointLyr, polygonLyr, arcs, opts);
  var index = [];
  var hit, polygonId;
  for (var i=0, n=pointLyr.shapes.length; i<n; i++) {
    hit = joinFunction(i);
    if (hit) {
      polygonId = hit[0]; // TODO: handle multiple hits
      if (polygonId in index) {
        index[polygonId].push(i);
      } else {
        index[polygonId] = [i];
      }
    }
  }
  // @i id of a polygon feature
  return function(i) {
    return index[i] || null;
  };
};

MapShaper.getPointToPolygonFunction = function(pointLyr, polygonLyr, arcs, opts) {
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
};
