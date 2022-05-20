import { findShapesByArcId } from '../paths/mapshaper-path-utils';
import { stop } from '../utils/mapshaper-logging';
import { getPolygonDissolver } from '../dissolve/mapshaper-polygon-dissolver';
import { addIntersectionCuts } from '../paths/mapshaper-intersection-cuts';
import { getWorldBounds } from '../geom/mapshaper-latlon';
import cmd from '../mapshaper-cmd';

// WORK IN PROGRESS
// Remove 'cuts' in an unprojected dataset at the antemeridian and poles.
// This will be useful when generating rotated projections.
//
cmd.stitch = function(dataset) {
  var arcs = dataset.arcs,
      edgeArcs, dissolver, nodes;
  if (!arcs || arcs.isPlanar()) {
    stop("Requires lat-lng dataset");
  }
  if (!snapEdgeArcs(arcs)) {
    return;
  }
  nodes = addIntersectionCuts(dataset);
  // console.log(arcs.toArray())

  // TODO: implement pathfinding on sphere
  dissolver = getPolygonDissolver(nodes, !!'spherical');
  dataset.layers.forEach(function(lyr) {
    if (lyr.geometry_type != 'polygon') return;
    var shapes = lyr.shapes,
        edgeShapeIds = findEdgeShapes(shapes, arcs);
    edgeShapeIds.forEach(function(i) {
      shapes[i] = dissolver(shapes[i]);
    });
  });
};

// TODO: test with 'wrapped' datasets
function findEdgeArcs(arcs) {
  var bbox = getWorldBounds(),
      ids = [];
  for (var i=0, n=arcs.size(); i<n; i++) {
    if (!arcs.arcIsContained(i, bbox)) {
      ids.push(i);
    }
  }
  return ids;
}

function findEdgeShapes(shapes, arcs) {
  var arcIds = findEdgeArcs(arcs);
  return findShapesByArcId(shapes, arcIds, arcs.size());
}

// Snap arcs that either touch poles or prime meridian to 0 degrees longitude
// Return array of affected arc ids
function snapEdgeArcs(arcs) {
  var data = arcs.getVertexData(),
      xx = data.xx,
      yy = data.yy,
      onEdge = false,
      e = 1e-10, // TODO: justify this...
      xmin = -180,
      xmax = 180,
      ymin = -90,
      ymax = 90,
      lat, lng;
  for (var i=0, n=xx.length; i<n; i++) {
    lat = yy[i];
    lng = xx[i];
    if (lng <= xmin + e || lng >= xmax - e) {
      onEdge = true;
      xx[i] = xmin;
    }
    if (lat <= ymin + e) {
      onEdge = true;
      yy[i] = ymin;
      xx[i] = xmin;
    } else if (lat >= ymax - e) {
      onEdge = true;
      yy[i] = ymax;
      xx[i] = xmin;
    }
  }
  return onEdge;
}
