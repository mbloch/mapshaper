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

MapShaper.closeArcPathways = function(arcIds, arcs, flags, fwd, rev) {
  MapShaper.forEachArcId(arcIds, function(id) {
    var isInv = id < 0,
        absId = isInv ? ~id : id,
        mask = 0xff;

    if (fwd) mask ^= isInv ? 0x20 : 2;
    if (rev) mask ^= isInv ? 2 : 0x20;

    flags[absId] &= mask;
  });
};


// enable arc pathways in a single shape or array of shapes
// Uses 8 bits to control traversal of each arc
// 0-3: forward arc; 4-7: rev arc
// 0: visible path; 1 = open path; 3: used path; 4: marked
//
MapShaper.openArcPathways = function(arcIds, arcs, flags, fwd, rev, dissolve, marked) {
  MapShaper.forEachArcId(arcIds, function(id) {
    var isInv = id < 0,
        absId = isInv ? ~id : id,
        currFlag = flags[absId],
        openFwd = isInv ? rev : fwd,
        openRev = isInv ? fwd : rev,
        newFlag = 0;

    // error condition: lollipop arcs can cause problems; ignore these
    if (arcs.arcIsLollipop(id)) {
      trace('lollipop');
      newFlag = 0; // unset (i.e. make invisible)
    } else {
      newFlag = currFlag | 0x11; // make visible
      // ignore used pathways
      openFwd = openFwd && (currFlag & 4) === 0;
      openRev = openRev && (currFlag & 0x40) === 0;

      if (openFwd) {
        newFlag |= 2; // open fw
      }
      if (openRev) {
        newFlag |= 0x20; // open rev
      }
      // @dissolve hides arcs that have both fw and rev pathways open
      if (dissolve && (newFlag & 0x22) === 0x22) {
        newFlag &= ~0x11; // make invisible
      }

      if (marked) {
        newFlag |= 0x88;
      }
    }

    flags[absId] = newFlag;
  });
};

function flagsToArray(flags) {
  return Utils.map(flags, function(flag) {
    return flag.toString(16);
  });
}

MapShaper.getPathSplitter = function(arcs, flags) {
  var nodes = new NodeCollection(arcs),
      coords = arcs.getVertexData(),
      xx = coords.xx,
      yy = coords.yy,
      splitter;

  function testArc(id) {
    var fw = id >= 0,
        abs = fw ? id : ~id,
        visibleBit = fw ? 1 : 0x10,
        currFlags = flags[abs];

    if ((currFlags & 0x88) > 0) splitter.marked = true; // kludge
    return (currFlags & visibleBit) > 0;
  }

  function useArc(id) {
    var fw = id >= 0,
        abs = fw ? id : ~id,
        currFlag = flags[abs];

    var bits = fw ? currFlag & 0xf : currFlag >> 4,
        isOpen = (bits & 3) == 3; // arc is visible and open

    if (isOpen) {
      bits = 5 | (bits & 8); // set to visible / closed / used; preserve marker bit
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
      var ci = arcs.indexOfVertex(candId, -2),
          cx = xx[ci],
          cy = yy[ci],
          // sanity check: make sure vertex is same (else error);
          di = arcs.indexOfVertex(candId, -1),
          dx = xx[di],
          dy = yy[di],
          candAngle;

      if (dx !== bx || dy !== by) {
        console.log("cd:", cx, cy, dx, dy, 'arc:', candId);
        error("node error:");
      }

      candAngle = signedAngle(ax, ay, bx, by, cx, cy);
      if (candAngle > 0 && testArc(~candId)) {
        if (nextAngle === 0 || candAngle < nextAngle) {
          nextId = candId;
          nextAngle = candAngle;
        }
        else if (candAngle == nextAngle) {
          // TODO: handle this, e.g. by prioritizing one of the source polygons
          trace("duplicate angle:", candAngle);
          /*  console.log("id1:", nextId, "id2:", candId);
            console.log("len1:", nn[absArcId(nextId)], "len2:", nn[absArcId(candId)]);
            console.log("arc1:", arcs.getArc(nextId).toString());
            console.log("arc2:", arcs.getArc(candId).toString());
            this.debugNode(candId);
          */
        }
      } else {
        // candAngle is NaN or 0
        if (candAngle === 0) {
          trace("#getNextArc() cand angle === 0");
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
        verbose = MapShaper.TRACING;

    splitter.marked = false;
    do {
      if (verbose) msg = (nextId === undefined ? " " : "  " + nextId) + " -> " + candId;
      if (useArc(candId)) {
        path.push(candId);
        nextId = candId;
        if (verbose) console.log(msg);
        candId = getNextArc(nextId);
        if (verbose && candId == startId ) console.log("  o");
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
