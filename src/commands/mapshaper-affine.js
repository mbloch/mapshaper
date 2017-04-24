/* @requires mapshaper-arcs, mapshaper-shape-utils */

// Apply rotation, scale and/or shift to some or all of the features in a dataset
//
api.affine = function(targetLayers, dataset, opts) {
  // Need to separate the targeted shapes from any other shapes that share
  // the same topology. So we duplicate any arcs that are shared by the targeted
  // shapes and their topological neighbors and remap arc references in the
  // neighbors to point to the copies.
  // TODO: explore alternative: if some arcs are shared between transformed and
  //   non-transformed shapes, first remove topology, then tranform, then rebuild topology
  //
  var arcs = dataset.arcs;
  var targetShapes = [];
  var otherShapes = [];
  var targetPoints = [];
  var targetFlags, otherFlags, transform, transformOpts;
  dataset.layers.filter(internal.layerHasGeometry).forEach(function(lyr) {
    var hits = [],
        misses = [],
        test;
    if (targetLayers.indexOf(lyr) == -1) {
      misses = lyr.shapes;
    } else if (opts.where) {
      test = internal.compileValueExpression(opts.where, lyr, dataset.arcs);
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
  opts = internal.getAffineOpts({arcs: dataset.arcs, layers: [{
    geometry_type: 'point', shapes: targetPoints}, {geometry_type: 'polyline',
    shapes: targetShapes}]}, opts);
  transform = internal.getAffineTransform(opts.rotate, opts.scale, opts.shift, opts.anchor);
  if (targetShapes.length > 0) {
    targetFlags = new Uint8Array(arcs.size());
    otherFlags = new Uint8Array(arcs.size());
    internal.countArcsInShapes(targetShapes, targetFlags);
    if (otherShapes.length > 0) {
      internal.countArcsInShapes(otherShapes, otherFlags);
      internal.applyArrayMask(otherFlags, targetFlags);
      dataset.arcs = internal.duplicateSelectedArcs(otherShapes, arcs, otherFlags);
    }
    dataset.arcs.transformPoints(function(x, y, arcId) {
      if (arcId < targetFlags.length && targetFlags[arcId] > 0) {
        return transform(x, y);
      }
    });
  }
  internal.forEachPoint(targetPoints, function(p) {
    var p2 = transform(p[0], p[1]);
    p[0] = p2[0];
    p[1] = p2[1];
  });
};

internal.getAffineOpts = function(dataset, opts) {
  var o = {
    shift: opts.shift || [0, 0],
    rotate: opts.rotate || 0,
    scale: opts.scale || 1
  };
  var bounds;
  if (opts.anchor) {
    o.anchor = opts.anchor;
  } else {
    // get bounds of selected shapes to calculate center of rotation/scale
    bounds = internal.getDatasetBounds(dataset);
    o.anchor = [bounds.centerX(), bounds.centerY()];
  }
  return o;
};

// TODO: handle problems with unprojected datasets
//   option 1: don't allow affine transformation of unprojected data
//   option 2: error if transformed data exceeds valid coordinate range
// source: http://mathworld.wolfram.com/AffineTransformation.html
internal.getAffineTransform = function(rotation, scale, shift, anchor) {
  var angle = rotation * Math.PI / 180;
  var a = scale * Math.cos(angle);
  var b = -scale * Math.sin(angle);
  return function(x, y) {
    var x2 = a * (x - anchor[0]) - b * (y - anchor[1]) + shift[0] + anchor[0];
    var y2 = b * (x - anchor[0]) + a * (y - anchor[1]) + shift[1] + anchor[1];
    return [x2, y2];
  };
};

internal.applyArrayMask = function(destArr, maskArr) {
  for (var i=0, n=destArr.length; i<n; i++) {
    if (maskArr[i] === 0) destArr[i] = 0;
  }
};

internal.duplicateSelectedArcs = function(shapes, arcs, flags) {
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
  internal.forEachArcId(shapes, function(id) {
    var absId = absArcId(id);
    if (flags[absId] > 0) {
      return id < 0 ? ~map[absId] : map[absId];
    }
  });
  return internal.mergeArcs([arcs, new ArcCollection(nn, xx, yy)]);
};
