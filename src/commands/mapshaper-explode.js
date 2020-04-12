import { reversePath } from '../paths/mapshaper-path-utils';
import { groupPolygonRings } from '../paths/mapshaper-path-utils';
import { getPathMetadata } from '../paths/mapshaper-path-utils';
import { DataTable } from '../datatable/mapshaper-data-table';
import cmd from '../mapshaper-cmd';
import utils from '../utils/mapshaper-utils';

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
  return explodedLyr;
};

function explodeShape(shp) {
  return shp.map(function(part) {
    return [part.concat()];
  });
}

export function explodePolygon(shape, arcs, reverseWinding) {
  var paths = getPathMetadata(shape, arcs, "polygon");
  var groups = groupPolygonRings(paths, reverseWinding);
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
  var clone = {};
  for (var key in obj) {
    clone[key] = obj[key];
  }
  return clone;
}
