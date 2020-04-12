import { forEachShapePart } from '../paths/mapshaper-shape-utils';
import { getArcPresenceTest } from '../paths/mapshaper-path-utils';
import { dissolvePolygonGroups2 } from '../dissolve/mapshaper-polygon-dissolve2';
import { dissolveArcs } from '../paths/mapshaper-arc-dissolve';
import { layerHasGeometry } from '../dataset/mapshaper-layer-utils';
import { addIntersectionCuts } from '../paths/mapshaper-intersection-cuts';
import { NodeCollection } from '../topology/mapshaper-nodes';
import cmd from '../mapshaper-cmd';

cmd.cleanLayers = function(layers, dataset, opts) {
  var nodes;
  opts = opts || {};
  if (opts.debug) {
    addIntersectionCuts(dataset, opts);
    return;
  }
  if (!opts.arcs) { // arcs option only removes unused arcs
    nodes = addIntersectionCuts(dataset, opts);
    layers.forEach(function(lyr) {
      if (!layerHasGeometry(lyr)) return;
      if (lyr.geometry_type == 'polygon') {
        cleanPolygonLayerGeometry(lyr, dataset, opts);
      } else if (lyr.geometry_type == 'polyline') {
        cleanPolylineLayerGeometry(lyr, dataset, opts);
      } else if (lyr.geometry_type == 'point') {
        cleanPointLayerGeometry(lyr, dataset, opts);
      }
      if (!opts.allow_empty) {
        cmd.filterFeatures(lyr, dataset.arcs, {remove_empty: true});
      }
    });
  }

  if (!opts.no_arc_dissolve && dataset.arcs) {
    // remove leftover endpoints within contiguous lines
    dissolveArcs(dataset);
  }
};

function cleanPolygonLayerGeometry(lyr, dataset, opts) {
  var groups = lyr.shapes.map(function(shp, i) {
    return [i];
  });
  lyr.shapes = dissolvePolygonGroups2(groups, lyr, dataset, opts);
}

// Remove duplicate points from multipoint geometries
// TODO: consider checking for invalid coordinates
function cleanPointLayerGeometry(lyr, dataset, opts) {
  var index, parts;
  lyr.shapes = lyr.shapes.map(function(shp, i) {
    if (!shp || shp.length > 0 === false) {
      return null;
    }
    if (shp.length == 1) {
      return shp; // single part
    }
    // remove duplicate points from multipoint geometry
    index = {};
    parts = [];
    shp.forEach(onPoint);
    if (parts.length === 0) {
      return null;
    }
    return parts;
  });

  function onPoint(p) {
    var key = p.join('~');
    if (key in index) return;
    index[key] = true;
    parts.push(p);
  }
}

// Assumes intersection cuts have been added and duplicated points removed
// TODO: consider closing undershoots (see mapshaper-undershoots.js)
function cleanPolylineLayerGeometry(lyr, dataset, opts) {
  var filter = getArcPresenceTest(lyr.shapes, dataset.arcs);
  var nodes = new NodeCollection(dataset.arcs, filter);
  var shape;
  lyr.shapes = lyr.shapes.map(function(shp, i) {
    if (!shp) return null;
    shape = [];
    forEachShapePart(shp, onPart);
    return shape;
  });

  function onPart(ids) {
    var n = ids.length;
    var id, connected;
    var ids2 = [];
    for (var i=0; i<n; i++) {
      // check each segment of the current part (equivalent to a LineString)
      id = ids[i];
      ids2.push(id);
      if (i < n-1 && nodes.getConnectedArcs(id).length > 1) {
        // divide the current part if the front endpoint of the current segment
        // touches any other segment than the next segment in this part
        // TODO: consider not dividing if the intersection does not involve
        // the current feature (ie. it is not a self-intersection).
        // console.log('connections:', nodes.getConnectedArcs(id))
        shape.push(ids2);
        ids2 = [];
      }
    }
    if (ids2.length > 0) shape.push(ids2);
  }
}
