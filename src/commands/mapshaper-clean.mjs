import { dissolvePolygonGroups2 } from '../dissolve/mapshaper-polygon-dissolve2';
import { cleanPolylineLayerGeometry } from '../polylines/mapshaper-polyline-clean';
import {
  collapseDuplicateBoundaries,
  pinchOuterCrackMouths
} from '../polygons/mapshaper-close-gaps';
import { partitionPolygonMosaicGaps } from '../polygons/mapshaper-partition-gaps';
import { applyDefaultGapWidthOpts } from '../polygons/mapshaper-slivers';
import { dissolveArcs } from '../paths/mapshaper-arc-dissolve';
import { layerHasGeometry, layerHasPaths } from '../dataset/mapshaper-layer-utils';
import { addIntersectionCuts } from '../paths/mapshaper-intersection-cuts';
import { traversePaths } from '../paths/mapshaper-path-utils';
import { rewindPolygons } from '../polygons/mapshaper-ring-nesting';
import { buildTopology } from '../topology/mapshaper-topology';
import { profileStart, profileEnd } from '../utils/mapshaper-profile';
import utils from '../utils/mapshaper-utils';
import cmd from '../mapshaper-cmd';
import {
  markArcsChanged,
  markLayerChanged,
  noteArcsWillChange,
  noteLayerWillChange,
  withActiveUndoTransaction
} from '../undo/mapshaper-undo-tracking';

cmd.cleanLayers = cleanLayers;

export function cleanLayers(layers, dataset, optsArg) {
  profileStart('cleanLayers');
  var opts = optsArg || {};
  var deepClean = !opts.only_arcs;
  var pathClean = utils.some(layers, layerHasPaths);
  var nodes;
  // Collapsing duplicate boundaries runs unconditionally, and only ever merges
  // banks that differ by floating-point rounding. Left in place, such a seam
  // becomes an enclosed sliver that gap filling awards to one neighbor, giving
  // that feature a zero-width spike along the shared border.
  if (pathClean && dataset.arcs) {
    profileStart('collapseDuplicateBoundaries');
    noteArcsWillChange(dataset.arcs, {operation: 'clean-closeGaps'});
    var polygonLayers = layers.filter(function(lyr) {
      return lyr.geometry_type == 'polygon';
    });
    polygonLayers.forEach(function(lyr) {
      noteLayerWillChange(lyr, {operation: 'clean-closeGaps', unit: 'arc-ids'});
    });
    if (collapseDuplicateBoundaries(layers, dataset)) {
      markArcsChanged(dataset.arcs, {operation: 'clean-closeGaps'});
      polygonLayers.forEach(function(lyr) {
        markLayerChanged(lyr, {operation: 'clean-closeGaps', unit: 'arc-ids'});
      });
    }
    profileEnd('collapseDuplicateBoundaries');
  }
  if (opts.debug) {
    addIntersectionCuts(dataset, opts);
    profileEnd('cleanLayers');
    return;
  }
  layers.forEach(function(lyr) {
    if (!layerHasGeometry(lyr)) return;
    if (lyr.geometry_type == 'polygon' && opts.rewind) {
      profileStart('rewindPolygons');
      rewindPolygons(lyr, dataset.arcs);
      profileEnd('rewindPolygons');
    }
    if (deepClean) {
      if (!nodes) {
        nodes = addIntersectionCuts(dataset, opts);
      }
      if (lyr.geometry_type == 'polygon') {
        // Pinching the mouths of cracks that open to the outside encloses them,
        // so that the passes below fill or divide them like any other gap. It
        // comes first for that reason, and only the pinched vertices move.
        if (opts.close_outer_gaps) {
          profileStart('pinchOuterCrackMouths');
          noteArcsWillChange(dataset.arcs, {operation: 'clean-pinchGapMouths'});
          noteLayerWillChange(lyr,
            {operation: 'clean-pinchGapMouths', unit: 'arc-ids'});
          if (pinchOuterCrackMouths(lyr, dataset, nodes, opts)) {
            markArcsChanged(dataset.arcs, {operation: 'clean-pinchGapMouths'});
            markLayerChanged(lyr,
              {operation: 'clean-pinchGapMouths', unit: 'arc-ids'});
            // A pinched pair only touches: the cutter turns each touch into a
            // node, which is what makes the crack a tile of the mosaic. Undo
            // already holds everything this re-cut changes, captured above.
            withActiveUndoTransaction(null, function() {
              nodes = addIntersectionCuts(dataset, opts);
            });
          }
          profileEnd('pinchOuterCrackMouths');
        }
        delete opts._mosaic_cut_arcs;
        profileStart('partitionPolygonMosaicGaps');
        noteArcsWillChange(dataset.arcs, {operation: 'clean-partitionGaps'});
        var cutLayer = partitionPolygonMosaicGaps(lyr, dataset, nodes, opts);
        if (cutLayer) {
          markArcsChanged(dataset.arcs, {operation: 'clean-partitionGaps'});
          // The arc collection the partition just installed is a throwaway: undo
          // puts back the collection this command started with, which the
          // partition captured. Capturing this one too would store a second copy
          // of the arc table to no purpose. Every layer baseline the re-cut needs
          // was captured by the addIntersectionCuts() call above.
          withActiveUndoTransaction(null, function() {
            nodes = addIntersectionCuts(dataset, opts);
          });
          opts._mosaic_cut_arcs = collectArcIds(cutLayer.shapes);
          dataset.layers.splice(dataset.layers.indexOf(cutLayer), 1);
        }
        profileEnd('partitionPolygonMosaicGaps');
        profileStart('cleanPolygonLayerGeometry');
        cleanPolygonLayerGeometry(lyr, dataset, opts);
        profileEnd('cleanPolygonLayerGeometry');
        delete opts._mosaic_cut_arcs;
      } else if (lyr.geometry_type == 'polyline') {
        profileStart('cleanPolylineLayerGeometry');
        cleanPolylineLayerGeometry(lyr, dataset, opts);
        profileEnd('cleanPolylineLayerGeometry');
      } else if (lyr.geometry_type == 'point') {
        cleanPointLayerGeometry(lyr, dataset, opts);
      }
    }
    if (!opts.allow_empty) {
      profileStart('filterFeatures');
      cmd.filterFeatures(lyr, dataset.arcs, {remove_empty: true, verbose: opts.verbose});
      profileEnd('filterFeatures');
    }
  });

  if (!opts.no_arc_dissolve && pathClean && dataset.arcs) {
    profileStart('dissolveArcs');
    noteArcsWillChange(dataset.arcs, {operation: 'clean-dissolveArcs'});
    dissolveArcs(dataset);
    markArcsChanged(dataset.arcs, {operation: 'clean-dissolveArcs'});
    profileEnd('dissolveArcs');
  }
  profileEnd('cleanLayers');
}

function cleanPolygonLayerGeometry(lyr, dataset, opts) {
  // clean polygons by apply the 'dissolve2' function to each feature
  opts = applyDefaultGapWidthOpts(opts);
  var groups = lyr.shapes.map(function(shp, i) {
    return [i];
  });
  noteLayerWillChange(lyr, {operation: 'cleanPolygonLayerGeometry', unit: 'shapes'});
  lyr.shapes = dissolvePolygonGroups2(groups, lyr, dataset, opts);
  markLayerChanged(lyr, {operation: 'cleanPolygonLayerGeometry', unit: 'shapes'});
}

function collectArcIds(shapes) {
  var ids = {};
  traversePaths(shapes, function(o) {
    ids[o.arcId < 0 ? ~o.arcId : o.arcId] = true;
  });
  return ids;
}

// Remove duplicate points from multipoint geometries
// TODO: consider checking for invalid coordinates
function cleanPointLayerGeometry(lyr, dataset, opts) {
  var index, parts;
  noteLayerWillChange(lyr, {operation: 'cleanPointLayerGeometry', unit: 'shapes'});
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
  markLayerChanged(lyr, {operation: 'cleanPointLayerGeometry', unit: 'shapes'});

  function onPoint(p) {
    var key = p.join('~');
    if (key in index) return;
    index[key] = true;
    parts.push(p);
  }
}

