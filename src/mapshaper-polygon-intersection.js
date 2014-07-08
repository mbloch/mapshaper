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

// enable arc pathways in a single shape or array of shapes
// Uses 8 bits to control traversal of each arc
// 0-2: forward arc; 4-6: rev arc
// 3, 7: marker bits
// fwd/rev bits: 0/4: path is visible; 1/5 = path is open; 3/6: path was used
//
MapShaper.openArcPathways = function(arcIds, arcs, flags, fwd, rev, dissolve, orBits, targetBits) {
  MapShaper.forEachArcId(arcIds, function(id) {
    var isInv = id < 0,
        absId = isInv ? ~id : id,
        currFlag = flags[absId],
        openFwd = isInv ? rev : fwd,
        openRev = isInv ? fwd : rev,
        newFlag = currFlag;

    if (targetBits > 0 && (targetBits & currFlag) === 0) {
      return;
    }

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

MapShaper.closeArcPathways = function(arcIds, arcs, flags, fwd, rev, hide, targetBits) {
  MapShaper.forEachArcId(arcIds, function(id) {
    var isInv = id < 0,
        absId = isInv ? ~id : id,
        currFlag = flags[absId],
        mask = 0xff,
        closeFwd = isInv ? rev : fwd,
        closeRev = isInv ? fwd : rev;

    if (targetBits && (currFlag & targetBits) === 0) return;

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

/*
function flagsToArray(flags) {
  return Utils.map(flags, function(flag) {
    return flag.toString(16);
  });
}
*/

// Return a function for generating a path across a field of intersecting arcs
MapShaper.getPathFinder = function(arcs, flags) {
  var nodes = new NodeCollection(arcs),
      coords = arcs.getVertexData(),
      xx = coords.xx,
      yy = coords.yy,
      nn = coords.nn,
      splitter;

  function testArc(id) {
    var fw = id >= 0,
        abs = fw ? id : ~id,
        visibleBit = fw ? 1 : 0x10,
        currFlags = flags[abs];

    if ((currFlags & 0x80) > 0) splitter.marked = true; // kludge
    return (currFlags & visibleBit) > 0;
  }

  function useArc(id) {
    var fw = id >= 0,
        abs = fw ? id : ~id,
        currFlag = flags[abs];

    var bits = fw ? currFlag & 0xf : currFlag >> 4,
        isOpen = (bits & 3) == 3; // arc is visible and open

    if (isOpen) {
      // Need to close all shapes -- or could cause a cycle on layers with strange topology
      bits &= 8; // retain marker bit
      bits |= 5; // set to visible / closed / used;

      if (fw) {
        flags[abs] = MapShaper.setBits(currFlag, bits, 0xf);
      } else {
        flags[abs] = MapShaper.setBits(currFlag, bits << 4, 0xf0);
      }

    }
    return isOpen;
  }

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
      if (!testArc(~candId)) return;
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
        if (nextAngle === 0 || candAngle < nextAngle) {
          nextId = candId;
          nextAngle = candAngle;
        }
        else if (candAngle == nextAngle) {
          // TODO: handle equal angles by prioritizing the pathway with
          // flag 0x8 set (marker bit for target layer arc)
          var flag = flags[absArcId(candId)];
          if ((flag & 0x8) > 0) {
            nextId = candId;
          }
          trace("duplicate angle:", candAngle);
          /*
            console.log("id1:", nextId, "id2:", candId);
            console.log("len1:", nn[absArcId(nextId)], "len2:", nn[absArcId(candId)]);
            console.log("arc1:", arcs.getArc(nextId).toString());
            console.log("arc2:", arcs.getArc(candId).toString());
            this.debugNode(candId);
          */
        }
      } else {
        // candAngle is NaN or 0
        if (candAngle === 0) {
          trace("#getNextArc() cand angle === 0; candId:", candId);
          nodes.debugNode(prevId);
        }
      }
    });

    if (nextId === prevId) {
      // TODO: confirm that this can't happen
      nodes.debugNode(prevId);
      error("#getNextArc() nextId === prevId");
    }
    return ~nextId; // reverse arc to point onwards
  }

  splitter = function(startId) {
    var path = [],
        nextId, msg,
        candId = startId,
        verbose = false; // MapShaper.TRACING;

    splitter.marked = false;
    do {
      if (verbose) msg = (nextId === undefined ? " " : "  " + nextId) + " -> " + candId;
      if (useArc(candId)) {
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

  return splitter;
};
