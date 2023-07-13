
import { absArcId } from '../paths/mapshaper-arc-utils';
import { forEachArcId } from '../paths/mapshaper-path-utils';
import { forEachShapePart } from '../paths/mapshaper-shape-utils';
import { getRightmostArc } from '../paths/mapshaper-pathfinder-utils';
import { debug } from '../utils/mapshaper-logging';

// Functions for redrawing polygons for clipping / erasing / flattening / division
// These functions use 8 bit codes to control forward and reverse traversal of each arc.
//
// Function of arc bits 0-7:
// 0-3 FWD direction
// 0: is fwd arc hidden or visible? (0=hidden, 1=visible)
// 1: is fwd arc open or closed for traversal? (0=closed, 1=open)
// 2: was fwd arc visited in the traversal?
// 3: was fwd arc used in output shape?
// 4-7 REV direction
// 4: is rev arc hidden or visible?
// 5: is rev arc open or closed for traversal?
// 6: was rev arc visited in the traversal?
// 7: was rev arc used in output shape?
//
// Example codes:
// 0x3 (3): forward path is visible and open, reverse path is hidden and closed
// 0x10 (16): forward path is hidden and closed, reverse path is visible and closed
//

var FWD_VISIBLE = 0x1;
var REV_VISIBLE = 0x10;
var FWD_OPEN = 0x2;
var REV_OPEN = 0x20;
var FWD_VISITED = 0x4;
var REV_VISITED = 0x40;
var FWD_USED = 0x8;
var REV_USED = 0x80;

export function setBits(bits, arcBits, mask) {
  return (bits & ~mask) | (arcBits & mask);
}

export function andBits(bits, arcBits, mask) {
  return bits & (~mask | arcBits);
}

export function setRouteBits(arcBits, arcId, routesArr) {
  var idx = absArcId(arcId), // get index of path in
      mask;
  if (idx == arcId) { // arcBits controls fwd path
    mask = ~3; // target fwd bits
  } else { // arcBits controls rev. path
    mask = ~0x30; // target rev bits
    arcBits = arcBits << 4; // shift code to target rev path
  }
  routesArr[idx] &= (arcBits | mask);
}

export function getRouteBits(arcId, routesArr) {
  var idx = absArcId(arcId),
      bits = routesArr[idx];
  if (idx != arcId) bits = bits >> 4;
  return bits & 7;
}

export function markPathsAsUsed(paths, routesArr) {
  forEachArcId(paths, function(arcId) {
    if (arcId < 0) {
      routesArr[~arcId] |= REV_USED;
    } else {
      routesArr[arcId] |= FWD_USED;
    }
  });
}

// Open arc pathways in a single shape or array of shapes
//
export function openArcRoutes(paths, arcColl, routesArr, fwd, rev, dissolve, orBits) {
  forEachArcId(paths, function(arcId) {
    var isInv = arcId < 0,
        idx = isInv ? ~arcId : arcId,
        currBits = routesArr[idx],
        openFwd = isInv ? rev : fwd,
        openRev = isInv ? fwd : rev,
        newBits = currBits;

    // error condition: lollipop arcs can cause problems; ignore these
    if (arcColl.arcIsLollipop(arcId)) {
      debug('lollipop');
      newBits = 0; // unset (i.e. make invisible)
    } else {
      if (openFwd) {
        newBits |= 3; // set fwd path to visible and open
      }
      if (openRev) {
        newBits |= 0x30; // set rev. path to visible and open
      }

      // placing this in front of dissolve - dissolve has to be able to hide
      // pathways that are made visible by orBits
      if (orBits > 0) {
        newBits |= orBits;
      }

      // dissolve hides arcs that have both fw and rev pathways open
      // (these arcs represent shared borders and will not be part of the dissolved path)
      //
      if (dissolve && (newBits & 0x22) === 0x22) {
        newBits &= ~0x11; // make invisible
      }
    }

    routesArr[idx] = newBits;
  });
}

export function closeArcRoutes(arcIds, arcs, routesArr, fwd, rev, hide) {
  forEachArcId(arcIds, function(arcId) {
    var isInv = arcId < 0,
        idx = isInv ? ~arcId : arcId,
        currBits = routesArr[idx],
        mask = 0xff,
        closeFwd = isInv ? rev : fwd,
        closeRev = isInv ? fwd : rev;

    if (closeFwd) {
      if (hide) mask &= ~1;
      mask ^= 0x2;
    }
    if (closeRev) {
      if (hide) mask &= ~0x10;
      mask ^= 0x20;
    }
    routesArr[idx] = currBits & mask;
  });
}

// Return a function for generating a path across a graph of connected arcs
// useRoute: function(arcId) {}
//           Tries to extend path to the given arc
//           Returns true and extends path by one arc on success
//           Returns false and rejects the entire path on failure
// routeIsUsable (optional): function(arcId) {}
//           An optional filter function; pathfinder ignores the given arc if
//           this function returns false;
// TODO: add option to use spherical geometry for lat-lng coords
//
export function getPathFinder(nodes, useRoute, routeIsUsable) {
  var testArc = null;
  if (routeIsUsable) {
    testArc = function(arcId) {
      return routeIsUsable(~arcId); // outward path must be traversable
    };
  }

  function getNextArc(prevId) {
    // reverse arc to point onwards
    return ~getRightmostArc(prevId, nodes, testArc);
  }

  function isEmptyArc(id) {
    return nodes.arcs.getArcLength(id) > 1 === false;
  }

  return function(startId) {
    var path = [],
        nextId, msg,
        candId = startId;

    if (isEmptyArc(startId)) {
      return null;
    }

    do {
      if (useRoute(candId)) {
        path.push(candId);
        nextId = candId;
        candId = getNextArc(nextId);
      } else {
        return null;
      }

      if (candId == ~nextId) {
        // TODO: handle or prevent this error condition
        debug("Pathfinder warning: dead-end path");
        return null;
      }
    } while (candId != startId);
    return path.length === 0 ? null : path;
  };
}

// Returns a function for flattening or dissolving a collection of rings
// Assumes rings are oriented in CW direction
//
export function getRingIntersector(nodes, flagsArr) {
  var arcs = nodes.arcs;
  var findPath = getPathFinder(nodes, useRoute, routeIsActive);
  flagsArr = flagsArr || new Uint8Array(arcs.size());

  // types: "dissolve" "flatten"
  return function(rings, type) {
    var dissolve = type == 'dissolve',
        openFwd = true,
        openRev = type == 'flatten',
        output;
    // even single rings get transformed (e.g. to remove spikes)
    if (rings.length > 0) {
      output = [];
      openArcRoutes(rings, arcs, flagsArr, openFwd, openRev, dissolve);
      forEachShapePart(rings, function(ids) {
        var path;
        for (var i=0, n=ids.length; i<n; i++) {
          path = findPath(ids[i]);
          if (path) {
            output.push(path);
          }
        }
      });
      closeArcRoutes(rings, arcs, flagsArr, openFwd, openRev, true);
    } else {
      output = rings;
    }
    return output;
  };

  function routeIsActive(arcId) {
    var bits = getRouteBits(arcId, flagsArr);
    return (bits & 1) == 1;
  }

  function useRoute(arcId) {
    var route = getRouteBits(arcId, flagsArr),
        isOpen = false;
    if (route == 3) {
      isOpen = true;
      setRouteBits(1, arcId, flagsArr); // close the path, leave visible
    }
    return isOpen;
  }
}

// function debugFlags(flags) {
//   var arr = [];
//   utils.forEach(flags, function(flag) {
//     arr.push(bitsToString(flag));
//   });
//   message(arr);

//   function bitsToString(bits) {
//     var str = "";
//     for (var i=0; i<8; i++) {
//       str += (bits & (1 << i)) > 0 ? "1" : "0";
//       if (i < 7) str += ' ';
//       if (i == 3) str += ' ';
//     }
//     return str;
//   }
// }
