import { mergeArcs } from '../dataset/mapshaper-merging';
import { forEachArcId } from '../paths/mapshaper-path-utils';
import { getDatasetBounds } from '../dataset/mapshaper-dataset-utils';
import { forEachPoint } from '../points/mapshaper-point-utils';
import { countArcsInShapes } from '../paths/mapshaper-path-utils';
import { compileFeatureExpression } from '../expressions/mapshaper-feature-expressions';
import { layerHasGeometry } from '../dataset/mapshaper-layer-utils';
import { getDatasetCRS } from '../crs/mapshaper-projections';
import { convertIntervalPair } from '../geom/mapshaper-units';
import { ArcCollection } from '../paths/mapshaper-arcs';
import utils from '../utils/mapshaper-utils';
import cmd from '../mapshaper-cmd';
import { absArcId } from '../paths/mapshaper-arc-utils';

// Apply rotation, scale and/or shift to some or all of the features in a dataset
//
cmd.affine = function(targetLayers, dataset, opts) {
  // Need to separate the targeted shapes from any other shapes that share
  // the same topology. So we duplicate any arcs that are shared by the targeted
  // shapes and their topological neighbors and remap arc references in the
  // neighbors to point to the copies.
  // TODO: explore alternative: if some arcs are shared between transformed and
  //   non-transformed shapes, first remove topology, then tranform, then rebuild topology
  //
  var rotateArg = opts.rotate || 0;
  var scaleArg = opts.scale || 1;
  var shiftArg = opts.shift ? convertIntervalPair(opts.shift, getDatasetCRS(dataset)) : [0, 0];
  var arcs = dataset.arcs;
  var targetShapes = [];
  var otherShapes = [];
  var targetPoints = [];
  var targetFlags, otherFlags, transform, transformOpts;
  dataset.layers.filter(layerHasGeometry).forEach(function(lyr) {
    var hits = [],
        misses = [],
        test;
    if (targetLayers.indexOf(lyr) == -1) {
      misses = lyr.shapes;
    } else if (opts.where) {
      test = compileFeatureExpression(opts.where, lyr, dataset.arcs);
      lyr.shapes.forEach(function(shp, i) {
        (test(i) ? hits : misses).push(shp);
      });
    } else {
      hits = lyr.shapes;
    }
    if (lyr.geometry_type == 'point') {
      targetPoints = targetPoints.concat(hits);
    } else {
      targetShapes = targetShapes.concat(hits);
      otherShapes = otherShapes.concat(misses);
    }
  });
  var anchorArg = getAffineAnchor({arcs: dataset.arcs, layers: [{
    geometry_type: 'point', shapes: targetPoints}, {geometry_type: 'polyline',
    shapes: targetShapes}]}, opts);
  transform = getAffineTransform(rotateArg, scaleArg, shiftArg, anchorArg);
  if (targetShapes.length > 0) {
    targetFlags = new Uint8Array(arcs.size());
    otherFlags = new Uint8Array(arcs.size());
    countArcsInShapes(targetShapes, targetFlags);
    if (otherShapes.length > 0) {
      countArcsInShapes(otherShapes, otherFlags);
      applyArrayMask(otherFlags, targetFlags);
      dataset.arcs = duplicateSelectedArcs(otherShapes, arcs, otherFlags);
    }
    dataset.arcs.transformPoints(function(x, y, arcId) {
      if (arcId < targetFlags.length && targetFlags[arcId] > 0) {
        return transform(x, y);
      }
    });
  }
  forEachPoint(targetPoints, function(p) {
    var p2 = transform(p[0], p[1]);
    p[0] = p2[0];
    p[1] = p2[1];
  });
};

function getAffineAnchor(dataset, opts) {
  var anchor, bounds;
  if (opts.anchor) {
    anchor = opts.anchor;
  } else {
    // get bounds of selected shapes to calculate center of rotation/scale
    bounds = getDatasetBounds(dataset);
    anchor = [bounds.centerX(), bounds.centerY()];
  }
  return anchor;
}

// TODO: handle problems with unprojected datasets
//   option 1: don't allow affine transformation of unprojected data
//   option 2: error if transformed data exceeds valid coordinate range
// source: http://mathworld.wolfram.com/AffineTransformation.html
export function getAffineTransform(rotation, scale, shift, anchor) {
  var angle = rotation * Math.PI / 180;
  var a = scale * Math.cos(angle);
  var b = -scale * Math.sin(angle);
  return function(x, y) {
    var x2 = a * (x - anchor[0]) - b * (y - anchor[1]) + shift[0] + anchor[0];
    var y2 = b * (x - anchor[0]) + a * (y - anchor[1]) + shift[1] + anchor[1];
    return [x2, y2];
  };
}

function applyArrayMask(destArr, maskArr) {
  for (var i=0, n=destArr.length; i<n; i++) {
    if (maskArr[i] === 0) destArr[i] = 0;
  }
}

function duplicateSelectedArcs(shapes, arcs, flags) {
  var arcCount = 0;
  var vertexCount = 0;
  var data = arcs.getVertexData();
  var xx = [], yy = [], nn = [], map = [], n;
  for (var i=0, len=flags.length; i<len; i++) {
    if (flags[i] > 0) {
      map[i] = arcs.size() + arcCount;
      n = data.nn[i];
      utils.copyElements(data.xx, data.ii[i], xx, vertexCount, n);
      utils.copyElements(data.yy, data.ii[i], yy, vertexCount, n);
      nn.push(n);
      vertexCount += n;
      arcCount++;
    }
  }
  forEachArcId(shapes, function(id) {
    var absId = absArcId(id);
    if (flags[absId] > 0) {
      return id < 0 ? ~map[absId] : map[absId];
    }
  });
  return mergeArcs([arcs, new ArcCollection(nn, xx, yy)]);
}
