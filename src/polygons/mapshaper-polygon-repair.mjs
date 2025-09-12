import { error } from '../utils/mapshaper-logging';
import geom from '../geom/mapshaper-geom';
import { forEachShapePart } from '../paths/mapshaper-shape-utils';
import { removeSpikesInPath, getSelfIntersectionSplitter } from '../paths/mapshaper-path-repair-utils';
import { addIntersectionCuts } from '../paths/mapshaper-intersection-cuts';
import { reversePath } from '../paths/mapshaper-path-utils';

export function getPolygonRewinder(nodes) {
  var splitter = getSelfIntersectionSplitter(nodes);
  return rewindPolygon;

  function rewindPolygon(shp) {
    var shp2 = [];
    forEachShapePart(shp, function(ids) {
      var rings = splitter(ids);
      var path;
      for (var i=0; i<rings.length; i++) {
        path = rings[i];
        if (geom.getPlanarPathArea(path, nodes.arcs) < 0) {
          path = reversePath(path);
        }
        shp2.push(path);
      }
    });
    return shp2.length > 0 ? shp2 : null;
  }
}

export function rewindPolygonParts(lyr, nodes) {
  var rewind = getPolygonRewinder(nodes);
  lyr.shapes = lyr.shapes.map(function(shp) {
    return rewind(shp);
  });
}

// TODO: Need to rethink polygon repair: these function can cause problems
// when part of a self-intersecting polygon is removed
//
export function repairPolygonGeometry(layers, dataset, opts) {
  var nodes = addIntersectionCuts(dataset);
  layers.forEach(function(lyr) {
    repairSelfIntersections(lyr, nodes);
  });
  return layers;
}

// Remove any small shapes formed by twists in each ring
// // OOPS, NO // Retain only the part with largest area
// // this causes problems when a cut-off hole has a matching ring in another polygon
// TODO: consider cases where cut-off parts should be retained
//
export function repairSelfIntersections(lyr, nodes) {
  var splitter = getSelfIntersectionSplitter(nodes);

  lyr.shapes = lyr.shapes.map(function(shp, i) {
    return cleanPolygon(shp);
  });

  function cleanPolygon(shp) {
    var cleanedPolygon = [];
    forEachShapePart(shp, function(ids) {
      // TODO: consider returning null if path can't be split
      var splitIds = splitter(ids);
      if (splitIds.length === 0) {
        error("[cleanPolygon()] Defective path:", ids);
      } else if (splitIds.length == 1) {
        cleanedPolygon.push(splitIds[0]);
      } else {
        var shapeArea = geom.getPlanarPathArea(ids, nodes.arcs),
            sign = shapeArea > 0 ? 1 : -1,
            mainRing;

        var maxArea = splitIds.reduce(function(max, ringIds, i) {
          var pathArea = geom.getPlanarPathArea(ringIds, nodes.arcs) * sign;
          if (pathArea > max) {
            mainRing = ringIds;
            max = pathArea;
          }
          return max;
        }, 0);

        if (mainRing) {
          cleanedPolygon.push(mainRing);
        }
      }
    });
    return cleanedPolygon.length > 0 ? cleanedPolygon : null;
  }
}
