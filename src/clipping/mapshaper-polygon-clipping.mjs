import { reversePath } from '../paths/mapshaper-path-utils';
import { forEachShapePart } from '../paths/mapshaper-shape-utils';
import {
  closeArcRoutes,
  openArcRoutes,
  getPathFinder,
  setBits,
  markPathsAsUsed } from '../paths/mapshaper-pathfinder';
import { getPolygonDissolver } from '../dissolve/mapshaper-polygon-dissolver';
import { PathIndex } from '../paths/mapshaper-path-index';
import { absArcId } from '../paths/mapshaper-arc-utils';

// TODO: remove dependency on old polygon dissolve function

// assumes layers and arcs have been prepared for clipping
export function clipPolygons(targetShapes, clipShapes, nodes, type, optsArg) {
  var arcs = nodes.arcs;
  var opts = optsArg || {};
  var clipFlags = new Uint8Array(arcs.size());
  var routeFlags = new Uint8Array(arcs.size());
  var clipArcTouches = 0;
  var clipArcUses = 0;
  var usedClipArcs = [];
  var findPath = getPathFinder(nodes, useRoute, routeIsActive);
  var dissolvePolygon = getPolygonDissolver(nodes);

  // The following cleanup step is a performance bottleneck (it often takes longer than
  // other clipping operations) and is usually not needed. Furthermore, it only
  // eliminates a few kinds of problems, like target polygons with abnormal winding
  // or overlapping rings. TODO: try to optimize or remove it for all cases

  // skipping shape cleanup when using the experimental fast bbox clipping option
  if (!opts.bbox2) {
    // clean each target polygon by dissolving its rings
    targetShapes = targetShapes.map(dissolvePolygon);
  }

  // Originally, clip shapes were dissolved here as an optimization, using
  // an unreliable dissolve function.
  // Now, clip shapes are dissolved using a more reliable (but slower)
  // function in mapshaper-clip-erase.js
  // clipShapes = [dissolvePolygon(internal.concatShapes(clipShapes))];

  // Open pathways in the clip/erase layer
  // Need to expose clip/erase routes in both directions by setting route
  // in both directions to visible -- this is how cut-out shapes are detected
  // Or-ing with 0x11 makes both directions visible (so reverse paths will block)
  openArcRoutes(clipShapes, arcs, clipFlags, type == 'clip', type == 'erase', !!"dissolve", 0x11);
  var index = new PathIndex(clipShapes, arcs);
  var clippedShapes = targetShapes.map(function(shape, i) {
    if (shape) {
      return clipPolygon(shape, type, index);
    }
    return null;
  });

  markPathsAsUsed(clippedShapes, routeFlags); // to help us find unused paths later


  // add clip/erase polygons that are fully contained in a target polygon
  // need to index only non-intersecting clip shapes
  // (Intersecting shapes have one or more arcs that have been scanned)

  // first, find shapes that do not intersect the target layer
  // (these could be inside or outside the target polygons)

  var undividedClipShapes = findUndividedClipShapes(clipShapes);

  closeArcRoutes(clipShapes, arcs, routeFlags, true, true); // not needed?
  index = new PathIndex(undividedClipShapes, arcs);
  targetShapes.forEach(function(shape, shapeId) {
    // find clipping paths that are internal to this target polygon
    var paths = shape ? findInteriorPaths(shape, type, index) : null;
    if (paths) {
      clippedShapes[shapeId] = (clippedShapes[shapeId] || []).concat(paths);
    }
  });

  return clippedShapes;

  function clipPolygon(shape, type, index) {
    var dividedShape = [],
        clipping = type == 'clip',
        erasing = type == 'erase';

    // open pathways for entire polygon rather than one ring at a time --
    // need to create polygons that connect positive-space rings and holes
    openArcRoutes(shape, arcs, routeFlags, true, false, false);

    forEachShapePart(shape, function(ids) {
      var path;
      for (var i=0, n=ids.length; i<n; i++) {
        clipArcTouches = 0;
        clipArcUses = 0;
        path = findPath(ids[i]);
        if (path) {
          // if ring doesn't touch/intersect a clip/erase polygon, check if it is contained
          // if (clipArcTouches === 0) {
          // if ring doesn't incorporate an arc from the clip/erase polygon,
          // check if it is contained (assumes clip shapes are dissolved)
          if (clipArcTouches === 0 || clipArcUses === 0) { //
            var contained = index.pathIsEnclosed(path);
            if (clipping && contained || erasing && !contained) {
              dividedShape.push(path);
            }
            // TODO: Consider breaking if polygon is unchanged
          } else {
            dividedShape.push(path);
          }
        }
      }
    });


    // Clear pathways of current target shape to hidden/closed
    closeArcRoutes(shape, arcs, routeFlags, true, true, true);
    // Also clear pathways of any clip arcs that were used
    if (usedClipArcs.length > 0) {
      closeArcRoutes(usedClipArcs, arcs, routeFlags, true, true, true);
      usedClipArcs = [];
    }

    return dividedShape.length === 0 ? null : dividedShape;
  }

  function routeIsActive(id) {
    var fw = id >= 0,
        abs = fw ? id : ~id,
        visibleBit = fw ? 1 : 0x10,
        targetBits = routeFlags[abs],
        clipBits = clipFlags[abs];

    if (clipBits > 0) clipArcTouches++;
    return (targetBits & visibleBit) > 0 || (clipBits & visibleBit) > 0;
  }

  function useRoute(id) {
    var fw = id >= 0,
        abs = fw ? id : ~id,
        targetBits = routeFlags[abs],
        clipBits = clipFlags[abs],
        targetRoute, clipRoute;

    if (fw) {
      targetRoute = targetBits;
      clipRoute = clipBits;
    } else {
      targetRoute = targetBits >> 4;
      clipRoute = clipBits >> 4;
    }
    targetRoute &= 3;
    clipRoute &= 3;

    var usable = false;
    // var usable = targetRoute === 3 || targetRoute === 0 && clipRoute == 3;
    if (targetRoute == 3) {
      // special cases where clip route and target route both follow this arc
      if (clipRoute == 1) {
        // 1. clip/erase polygon blocks this route, not usable
      } else if (clipRoute == 2 && type == 'erase') {
        // 2. route is on the boundary between two erase polygons, not usable
      } else {
        usable = true;
      }

    } else if (targetRoute === 0 && clipRoute == 3) {
      usedClipArcs.push(id);
      usable = true;
    }

    if (usable) {
      if (clipRoute == 3) {
        clipArcUses++;
      }
      // Need to close all arcs after visiting them -- or could cause a cycle
      //   on layers with strange topology
      if (fw) {
        targetBits = setBits(targetBits, 1, 3);
      } else {
        targetBits = setBits(targetBits, 0x10, 0x30);
      }
    }

    targetBits |= fw ? 4 : 0x40; // record as visited
    routeFlags[abs] = targetBits;
    return usable;
  }


  // Filter a collection of shapes to exclude paths that incorporate parts of
  // clip/erase polygons and paths that are hidden (e.g. internal boundaries)
  function findUndividedClipShapes(clipShapes) {
    return clipShapes.map(function(shape) {
      var usableParts = [];
      forEachShapePart(shape, function(ids) {
        var pathIsClean = true,
            pathIsVisible = false;
        for (var i=0; i<ids.length; i++) {
          // check if arc was used in fw or rev direction
          if (!arcIsUnused(ids[i], routeFlags)) {
            pathIsClean = false;
            break;
          }
          // check if clip arc is visible
          if (!pathIsVisible && arcIsVisible(ids[i], clipFlags)) {
            pathIsVisible = true;
          }
        }
        if (pathIsClean && pathIsVisible) usableParts.push(ids);
      });
      return usableParts.length > 0 ? usableParts : null;
    });
  }


  function arcIsUnused(id, flags) {
    var abs = absArcId(id),
        flag = flags[abs];
        return (flag & 0x88) === 0;
        // return id < 0 ? (flag & 0x80) === 0 : (flag & 0x8) === 0;
  }

  function arcIsVisible(id, flags) {
    var flag = flags[absArcId(id)];
    return (flag & 0x11) > 0;
  }

  // search for indexed clipping paths contained in a shape
  // dissolve them if needed
  function findInteriorPaths(shape, type, index) {
    var enclosedPaths = index.findPathsInsideShape(shape),
        dissolvedPaths = [];
    if (!enclosedPaths) return null;
    // ...
    if (type == 'erase') enclosedPaths.forEach(reversePath);
    if (enclosedPaths.length <= 1) {
      dissolvedPaths = enclosedPaths; // no need to dissolve single-part paths
    } else {
      openArcRoutes(enclosedPaths, arcs, routeFlags, true, false, true);
      enclosedPaths.forEach(function(ids) {
        var path;
        for (var j=0; j<ids.length; j++) {
          path = findPath(ids[j]);
          if (path) {
            dissolvedPaths.push(path);
          }
        }
      });
    }

    return dissolvedPaths.length > 0 ? dissolvedPaths : null;
  }
} // end clipPolygons()
