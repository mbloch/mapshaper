import { reversePath } from '../paths/mapshaper-path-utils';
import { getFeatureCount } from '../dataset/mapshaper-layer-utils';
import { groupPolygonRings } from '../polygons/mapshaper-ring-nesting';
import { getPathMetadata } from '../paths/mapshaper-path-utils';
import { DataTable } from '../datatable/mapshaper-data-table';
import cmd from '../mapshaper-cmd';
import utils from '../utils/mapshaper-utils';
import { message } from '../utils/mapshaper-logging';

cmd.explodeFeatures = function(lyr, arcs, opts) {
  var properties = lyr.data ? lyr.data.getRecords() : null,
      explodedProperties = properties ? [] : null,
      explodedShapes = [],
      explodedLyr = utils.extend({}, lyr);

  lyr.shapes.forEach(function(shp, shpId) {
    var exploded;
    if (!shp) {
      explodedShapes.push(null);
    } else {
      if (lyr.geometry_type == 'polygon' && shp.length > 1) {
        if (opts && opts.naive) {
          exploded = explodePolygonNaive(shp, arcs);
        } else {
          exploded = explodePolygon(shp, arcs);
        }
      } else {
        exploded = explodeShape(shp);
      }
      utils.merge(explodedShapes, exploded);
    }
    if (explodedProperties !== null) {
      for (var i=0, n=exploded ? exploded.length : 1; i<n; i++) {
        explodedProperties.push(cloneProperties(properties[shpId]));
      }
    }
  });

  explodedLyr.shapes = explodedShapes;
  if (explodedProperties !== null) {
    explodedLyr.data = new DataTable(explodedProperties);
  }

  printMessage(lyr, explodedLyr);

  return explodedLyr;
};

function printMessage(pre, post) {
var n1 = getFeatureCount(pre),
    n2 = getFeatureCount(post),
    msg = utils.format('Exploded %,d feature%s into %,d feature%s',
      n1, utils.pluralSuffix(n1), n2,
      utils.pluralSuffix(n2));
  message(msg);
}

function explodeShape(shp) {
  return shp.map(function(part) {
    return [part.concat()];
  });
}

export function explodePolygon(shape, arcs, reverseWinding) {
  var paths = getPathMetadata(shape, arcs, "polygon");
  var groups = groupPolygonRings(paths, arcs, reverseWinding);
  return groups.map(function(group) {
    return group.map(function(ring) {
      return ring.ids;
    });
  });
}

function explodePolygonNaive(shape, arcs) {
  var paths = getPathMetadata(shape, arcs, "polygon");
  return paths.map(function(path) {
    if (path.area < 0) {
      reversePath(path.ids);
    }
    return [path.ids];
  });
}

function cloneProperties(obj) {
  return Object.assign({}, obj);
}
