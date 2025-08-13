import {
  getArcEndpointCoords
} from '../paths/mapshaper-vertex-utils';
import {
  forEachArcId
} from '../paths/mapshaper-path-utils';
import {
  forEachShapePart
} from '../paths/mapshaper-shape-utils';

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
