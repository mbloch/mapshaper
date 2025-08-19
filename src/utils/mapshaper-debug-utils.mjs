import {
  getArcEndpointCoords
} from '../paths/mapshaper-vertex-utils';
import {
  forEachArcId
} from '../paths/mapshaper-path-utils';
import {
  forEachShapePart
} from '../paths/mapshaper-shape-utils';
import {
  findArcIdFromVertexId
} from '../paths/mapshaper-arc-utils';
import {
  error, debug, message
} from '../utils/mapshaper-logging';
import GeoJSON from '../geojson/geojson-export';

export function findShapesContainingArc(arcId, lyr) {


}

export function debugConnectedArcs(ids, arcs) {
  var colors = ['orange', 'blue', 'green', 'red', 'magenta', 'grey'];
  var features = ids.map(function(arcId, i) {
    return getArcFeature(arcId, arcs, {arcId: arcId, stroke: colors[i] || 'black'});
  });
  var geojson = '{"type": "FeatureCollection", "features": [' + features.join(',') + ']}';
  debug(geojson);
}

export function debugDuplicatePathfinderSegments(nodeX, nodeY, i, j, arcs) {
  var data = arcs.getVertexData();
  var x1 = data.xx[i];
  var y1 = data.yy[i];
  var x2 = data.xx[j];
  var y2 = data.yy[j];
  var arc1 = findArcIdFromVertexId(i, data.ii);
  var arc2 = findArcIdFromVertexId(j, data.ii);
  if (!(x1 == x2 && y1 == y2)) {
    error('[debug] expected duplicate segments');
  }
  if (arc1 == arc2) {
    message('[debug] duplicate segments share the same arc');
  }
  var arc1Str = getArcFeature(arc1, arcs, {stroke: 'green'});
  var arc2Str = getArcFeature(arc2, arcs, {stroke: 'blue'});
  var segStr = getSegFeature(nodeX, nodeY, x1, y1, true);
  console.log(arc1Str);
  console.log(arc2Str);
  console.log(segStr);

}


export function checkRings(lyr, arcs) {
  lyr.shapes.forEach(function(shp) {
    forEachShapePart(shp, checkRing);
  });

  function checkRing(ids) {
    var endpoints = ids.map(function(arcId) {
      return getArcEndpointCoords(arcId, arcs);
    });
    endpoints.forEach(function(pair, i) {
      var end = pair[1];
      var nextStart = i == endpoints.length - 1 ? endpoints[0][0] : endpoints[i+1][0];
      if (!pointsAreEqual(end, nextStart)) {
        console.log("DEFECTIVE ring (a)", ids);
      }
    });
  }
}

function pointsAreEqual(a, b) {
  return a && b && a[0] === b[0] && a[1] === b[1];
}

function getArcFeature(arcId, arcs, properties) {
  return JSON.stringify({
    type: "Feature",
    properties: properties,
    geometry: GeoJSON.exportLineGeom([[arcId]], arcs)
  });
}

export function getSegFeature(x1, y1, x2, y2, hot) {
  return JSON.stringify({
    type: "Feature",
    properties: {
      stroke: hot ? "orange" : "blue"
    },
    geometry: {
      type: "LineString",
      coordinates: [[x1, y1], [x2, y2]]
    }
  });
}
