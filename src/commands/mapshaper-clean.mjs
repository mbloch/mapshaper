import { dissolvePolygonGroups2 } from '../dissolve/mapshaper-polygon-dissolve2';
import { cleanPolylineLayerGeometry } from '../polylines/mapshaper-polyline-clean';
import { dissolveArcs } from '../paths/mapshaper-arc-dissolve';
import { layerHasGeometry, layerHasPaths } from '../dataset/mapshaper-layer-utils';
import { addIntersectionCuts } from '../paths/mapshaper-intersection-cuts';
import { rewindPolygons } from '../polygons/mapshaper-ring-nesting';
import { buildTopology } from '../topology/mapshaper-topology';
import utils from '../utils/mapshaper-utils';
import cmd from '../mapshaper-cmd';

cmd.cleanLayers = cleanLayers;

export function cleanLayers(layers, dataset, optsArg) {
  var opts = optsArg || {};
  var deepClean = !opts.only_arcs;
  var pathClean = utils.some(layers, layerHasPaths);
  var nodes;
  if (opts.debug) {
    addIntersectionCuts(dataset, opts);
    return;
  }
  layers.forEach(function(lyr) {
    if (!layerHasGeometry(lyr)) return;
    if (lyr.geometry_type == 'polygon' && opts.rewind) {
      rewindPolygons(lyr, dataset.arcs);
    }
    if (deepClean) {
      if (!nodes) {
        nodes = addIntersectionCuts(dataset, opts);
      }
      if (lyr.geometry_type == 'polygon') {
        cleanPolygonLayerGeometry(lyr, dataset, opts);
      } else if (lyr.geometry_type == 'polyline') {
        cleanPolylineLayerGeometry(lyr, dataset, opts);
      } else if (lyr.geometry_type == 'point') {
        cleanPointLayerGeometry(lyr, dataset, opts);
      }
    }
    if (!opts.allow_empty) {
      cmd.filterFeatures(lyr, dataset.arcs, {remove_empty: true, verbose: opts.verbose});
    }
  });

  if (!opts.no_arc_dissolve && pathClean && dataset.arcs) {
    // remove leftover endpoints within contiguous lines
    dissolveArcs(dataset);
  }
}

function cleanPolygonLayerGeometry(lyr, dataset, opts) {
  // clean polygons by apply the 'dissolve2' function to each feature
  opts = Object.assign({gap_fill_area: 'auto'}, opts);
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

