/* @requires
mapshaper-dataset-utils
mapshaper-nodes
mapshaper-shape-geom
mapshaper-path-index
mapshaper-path-division
mapshaper-polygon-repair
mapshaper-pathfinder-utils
*/

// Functions for redrawing polygons for clipping / erasing / flattening / division

internal.setBits = function(src, flags, mask) {
  return (src & ~mask) | (flags & mask);
};

internal.andBits = function(src, flags, mask) {
  return src & (~mask | flags);
};

internal.setRouteBits = function(bits, id, flags) {
  var abs = absArcId(id),
      mask;
  if (abs == id) { // fw
    mask = ~3;
  } else {
    mask = ~0x30;
    bits = bits << 4;
  }
  flags[abs] &= (bits | mask);
};

internal.getRouteBits = function(id, flags) {
  var abs = absArcId(id),
      bits = flags[abs];
  if (abs != id) bits = bits >> 4;
  return bits & 7;
};


// enable arc pathways in a single shape or array of shapes
// Uses 8 bits to control traversal of each arc
// 0-3: forward arc; 4-7: rev arc
// 0: fw path is visible
// 1: fw path is open for traversal
// ...
//
internal.openArcRoutes = function(arcIds, arcs, flags, fwd, rev, dissolve, orBits) {
  internal.forEachArcId(arcIds, function(id) {
    var isInv = id < 0,
        absId = isInv ? ~id : id,
        currFlag = flags[absId],
        openFwd = isInv ? rev : fwd,
        openRev = isInv ? fwd : rev,
        newFlag = currFlag;

    // error condition: lollipop arcs can cause problems; ignore these
    if (arcs.arcIsLollipop(id)) {
      debug('lollipop');
      newFlag = 0; // unset (i.e. make invisible)
    } else {
      if (openFwd) {
        newFlag |= 3; // visible / open
      }
      if (openRev) {
        newFlag |= 0x30; // visible / open
      }

      // placing this in front of dissolve - dissolve has to be able to hide
      // arcs that are set to visible
      if (orBits > 0) {
        newFlag |= orBits;
      }

      // dissolve hides arcs that have both fw and rev pathways open
      if (dissolve && (newFlag & 0x22) === 0x22) {
        newFlag &= ~0x11; // make invisible
      }
    }

    flags[absId] = newFlag;
  });
};

internal.closeArcRoutes = function(arcIds, arcs, flags, fwd, rev, hide) {
  internal.forEachArcId(arcIds, function(id) {
    var isInv = id < 0,
        absId = isInv ? ~id : id,
        currFlag = flags[absId],
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
    flags[absId] = currFlag & mask;
  });
};

// Return a function for generating a path across a field of intersecting arcs
// useRoute: function(arcId) {}
//           Tries to extend path to the given arc
//           Returns true and extends path by one arc on success
//           Returns false and rejects the entire path on failure
// routeIsUsable (optional): function(arcId) {}
//           An optional filter function; pathfinder ignores the given arc if
//           this function returns false;
// TODO: add option to use spherical geometry for lat-lng coords
//
internal.getPathFinder = function(nodes, useRoute, routeIsUsable) {
  var testArc = null;
  if (routeIsUsable) {
    testArc = function(arcId) {
      return routeIsUsable(~arcId); // outward path must be traversable
    };
  }

  function getNextArc(prevId) {
    // reverse arc to point onwards
    return ~internal.getRightmostArc(prevId, nodes, testArc);
  }

  return function(startId) {
    // console.log(" # from:" ,startId);
    var path = [],
        nextId, msg,
        candId = startId;

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
};

// types: "dissolve" "flatten"
// Returns a function for flattening or dissolving a collection of rings
// Assumes rings are oriented in CW direction
//
internal.getRingIntersector = function(nodes, type, flags) {
  var arcs = nodes.arcs;
  var findPath = internal.getPathFinder(nodes, useRoute, routeIsActive);
  flags = flags || new Uint8Array(arcs.size());

  return function(rings) {
    var dissolve = type == 'dissolve',
        openFwd = true,
        openRev = type == 'flatten',
        output;
    // even single rings get transformed (e.g. to remove spikes)
    if (rings.length > 0) {
      output = [];
      internal.openArcRoutes(rings, arcs, flags, openFwd, openRev, dissolve);
      internal.forEachPath(rings, function(ids) {
        var path;
        for (var i=0, n=ids.length; i<n; i++) {
          path = findPath(ids[i]);
          if (path) {
            output.push(path);
          }
        }
      });
      internal.closeArcRoutes(rings, arcs, flags, openFwd, openRev, true);
    } else {
      output = rings;
    }
    return output;
  };

  function routeIsActive(arcId) {
    var bits = internal.getRouteBits(arcId, flags);
    return (bits & 1) == 1;
  }

  function useRoute(arcId) {
    var route = internal.getRouteBits(arcId, flags),
        isOpen = false;
    if (route == 3) {
      isOpen = true;
      internal.setRouteBits(1, arcId, flags); // close the path, leave visible
    }
    return isOpen;
  }
};

internal.debugFlags = function(flags) {
  var arr = [];
  utils.forEach(flags, function(flag) {
    arr.push(bitsToString(flag));
  });
  message(arr);

  function bitsToString(bits) {
    var str = "";
    for (var i=0; i<8; i++) {
      str += (bits & (1 << i)) > 0 ? "1" : "0";
      if (i < 7) str += ' ';
      if (i == 3) str += ' ';
    }
    return str;
  }
};
