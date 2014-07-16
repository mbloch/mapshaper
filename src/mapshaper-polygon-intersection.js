/* @requires
mapshaper-dataset-utils
mapshaper-endpoints
mapshaper-shape-geom
mapshaper-path-index
mapshaper-path-division
*/

// Functions for redrawing polygons for clipping / erasing / flattening / division

MapShaper.setBits = function(src, flags, mask) {
  return (src & ~mask) | (flags & mask);
};

MapShaper.andBits = function(src, flags, mask) {
  return src & (~mask | flags);
};


function getRouteBits(id, flags) {
  var abs = absArcId(id),
      bits = flags[abs];
  if (abs != id) bits = bits >> 4;
  return bits & 7;
}

// enable arc pathways in a single shape or array of shapes
// Uses 6 bits to control traversal of each arc
// 0-2: forward arc; 4-6: rev arc
// fwd/rev bits: 0/4: path is visible; 1/5 = path is open; 3/6: path was used
//
MapShaper.openArcRoutes = function(arcIds, arcs, flags, fwd, rev, dissolve, orBits) {
  MapShaper.forEachArcId(arcIds, function(id) {
    var isInv = id < 0,
        absId = isInv ? ~id : id,
        currFlag = flags[absId],
        openFwd = isInv ? rev : fwd,
        openRev = isInv ? fwd : rev,
        newFlag = currFlag;

    // error condition: lollipop arcs can cause problems; ignore these
    if (arcs.arcIsLollipop(id)) {
      trace('lollipop');
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

MapShaper.closeArcRoutes = function(arcIds, arcs, flags, fwd, rev, hide) {
  MapShaper.forEachArcId(arcIds, function(id) {
    var isInv = id < 0,
        absId = isInv ? ~id : id,
        currFlag = flags[absId],
        mask = 0xff,
        closeFwd = isInv ? rev : fwd,
        closeRev = isInv ? fwd : rev;

    if (closeFwd) { // fwd and pos or rev and inv
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

function flagsToArray(flags) {
  return Utils.map(flags, function(flag) {
    return bitsToString(flag);
  });
}

function bitsToString(bits) {
  var str = "";
  for (var i=0; i<8; i++) {
    str += (bits & (1 << i)) > 0 ? "1" : "0";
    if (i < 7) str += ' ';
    if (i == 3) str += ' ';
  }
  return str;
}


// Return a function for generating a path across a field of intersecting arcs
MapShaper.getPathFinder = function(nodes, useRoute, routeIsVisible, chooseRoute) {
  var arcs = nodes.arcs,
      coords = arcs.getVertexData(),
      xx = coords.xx,
      yy = coords.yy,
      nn = coords.nn,
      splitter;

  function getNextArc(prevId) {
    var ai = arcs.indexOfVertex(prevId, -2),
        ax = xx[ai],
        ay = yy[ai],
        bi = arcs.indexOfVertex(prevId, -1),
        bx = xx[bi],
        by = yy[bi],
        nextId = NaN,
        nextAngle = 0;

    nodes.forEachConnectedArc(prevId, function(candId) {
      if (!routeIsVisible(~candId)) return;
      if (arcs.getArcLength(candId) < 2) error("[clipPolygon()] defective arc");

      var ci = arcs.indexOfVertex(candId, -2),
          cx = xx[ci],
          cy = yy[ci],

          // sanity check: make sure both arcs share the same vertex;
          di = arcs.indexOfVertex(candId, -1),
          dx = xx[di],
          dy = yy[di],
          candAngle;
      if (dx !== bx || dy !== by) {
        console.log("cd:", cx, cy, dx, dy, 'arc:', candId);
        error("Error in node topology");
      }

      candAngle = signedAngle(ax, ay, bx, by, cx, cy);

      // if (prevId == 261) console.log(prevId, "v", candId, "angle:", candAngle)

      if (candAngle > 0) {
        if (nextAngle === 0) {
          nextId = candId;
          nextAngle = candAngle;
        } else {
          var choice = chooseRoute(~nextId, nextAngle, ~candId, candAngle, prevId);
          if (choice == 2) {
            nextId = candId;
            nextAngle = candAngle;
          }
        }
      } else {
        // candAngle is NaN or 0
        trace("#getNextArc() Invalid angle; id:", candId, "angle:", candAngle);
        nodes.debugNode(prevId);
      }
    });

    if (nextId === prevId) {
      // TODO: confirm that this can't happen
      nodes.debugNode(prevId);
      error("#getNextArc() nextId === prevId");
    }
    return ~nextId; // reverse arc to point onwards
  }

  return function(startId) {
    var path = [],
        nextId, msg,
        candId = startId,
        verbose = false; // MapShaper.TRACING;

    do {
      if (verbose) msg = (nextId === undefined ? " " : "  " + nextId) + " -> " + candId;
      if (useRoute(candId)) {
        /*
        // debug zambia_congo test
        if (candId == 261) {
          // debug zambia_congo.shp
          nodes.debugNode(candId)
          console.log("\nLAKE nodes:")
          nodes.debugNode(267)
          nodes.debugNode(268)
          nodes.debugNode(269)
          nodes.debugNode(270)
          nodes.debugNode(271)
        }
        */
        path.push(candId);
        nextId = candId;
        if (verbose) console.log(msg);
        candId = getNextArc(nextId);
        if (verbose && candId == startId ) console.log("  o", geom.getPathArea4(path, arcs));
      } else {
        if (verbose) console.log(msg + " x");
        return null;
      }

      if (candId == ~nextId) {
        console.log("dead-end"); // TODO: handle or prevent this error condition
        return null;
      }
    } while (candId != startId);
    return path.length === 0 ? null : path;
  };

};
