/* @requires mapshaper-common, mapshaper-data-table, mapshaper-shape-utils */

// Generate a dissolved layer
// @opts.field (optional) name of data field (dissolves all if falsy)
// @opts.sum-fields (Array) (optional)
// @opts.copy-fields (Array) (optional)
api.dissolvePolygons = // TODO: remove deprecated name
api.dissolve = function(lyr, arcs, opts) {
  var getGroupId = MapShaper.getCategoryClassifier(opts.field, lyr.data),
      dissolveShapes = null,
      dissolveData = null,
      lyr2;

  if (lyr.geometry_type) {
    MapShaper.requirePolygonLayer(lyr, "[dissolve] Only polygon type layers can be dissolved");
    dissolveShapes = dissolvePolygonGeometry(lyr.shapes, getGroupId);
  }
  if (lyr.data) {
    dissolveData = MapShaper.calcDissolveData(lyr.data.getRecords(), getGroupId, opts);
    // replace missing shapes with nulls
    for (var i=0, n=dissolveData.length; i<n; i++) {
      if (dissolveShapes && !dissolveShapes[i]) {
        dissolveShapes[i] = null;
      }
    }
  }
  lyr2 = {
    name: opts.no_replace ? null : lyr.name,
    shapes: dissolveShapes,
    data: dissolveData ? new DataTable(dissolveData) : null,
    geometry_type: lyr.geometry_type
  };
  if (!opts.silent) {
    MapShaper.printDissolveMessage(lyr, lyr2);
  }
  return lyr2;
};

MapShaper.printDissolveMessage = function(pre, post, cmd) {
  var n1 = MapShaper.getFeatureCount(pre),
      n2 = MapShaper.getFeatureCount(post),
      msg = utils.format('[%s] Dissolved %,d feature%s into %,d feature%s',
        cmd || 'dissolve', n1, utils.pluralSuffix(n1), n2,
        utils.pluralSuffix(n2));
  message(msg);
};

// Get a function to convert original feature ids into ids of combined features
// Use categorical classification (a different id for each unique value)
MapShaper.getCategoryClassifier = function(field, data) {
  if (!field) return function(i) {return 0;};
  if (!data || !data.fieldExists(field)) {
    stop("[dissolve] Data table is missing field:", field);
  }
  var index = {},
      count = 0,
      records = data.getRecords();
  return function(i) {
    var val = String(records[i][field]);
    if (val in index === false) {
      index[val] = count++;
    }
    return index[val];
  };
};

function dissolvePolygonGeometry(shapes, getGroupId) {
  var segments = dissolveFirstPass(shapes, getGroupId);
  return dissolveSecondPass(segments, shapes, getGroupId);
}

// First pass -- identify pairs of segments that can be dissolved
function dissolveFirstPass(shapes, getGroupId) {
  var groups = [],
      largeGroups = [],
      segments = [],
      ids = shapes.map(function(shp, i) {
        return getGroupId(i);
      });

  MapShaper.traverseShapes(shapes, procArc);
  largeGroups.forEach(splitGroup);
  return segments;

  function procArc(obj) {
    var arcId = obj.arcId,
        idx = arcId < 0 ? ~arcId : arcId,
        segId = segments.length,
        group = groups[idx];
    if (!group) {
      group = [];
      groups[idx] = group;
    }
    group.push(segId);
    obj.group = group;
    segments.push(obj);

    // Three or more segments sharing the same arc is abnormal topology...
    // Need to try to identify pairs of matching segments in each of these
    // groups.
    //
    if (group.length == 3) {
      largeGroups.push(group);
    }
  }

  function findMatchingPair(group, cb) {
    var arc1, arc2;
    for (var i=0; i<group.length - 1; i++) {
      arc1 = segments[group[i]];
      for (var j=i+1; j<group.length; j++) {
        arc2 = segments[group[j]];
        if (cb(arc1, arc2)) {
          return [arc1.segId, arc2.segId];
        }
      }
    }
    return null;
  }

  function checkFwExtension(arc1, arc2) {
    return getNextSegment(arc1, segments, shapes).arcId ===
        ~getNextSegment(arc2, segments, shapes).arcId;
  }

  function checkBwExtension(arc1, arc2) {
    return getPrevSegment(arc1, segments, shapes).arcId ===
        ~getPrevSegment(arc2, segments, shapes).arcId;
  }

  function checkDoubleExtension(arc1, arc2) {
    return checkPairwiseMatch(arc1, arc2) &&
        checkFwExtension(arc1, arc2) &&
        checkBwExtension(arc1, arc2);
  }

  function checkSingleExtension(arc1, arc2) {
    return checkPairwiseMatch(arc1, arc2) &&
        (checkFwExtension(arc1, arc2) ||
        checkBwExtension(arc1, arc2));
  }

  function checkPairwiseMatch(arc1, arc2) {
    return arc1.arcId === ~arc2.arcId && ids[arc1.shapeId] ===
        ids[arc2.shapeId];
  }

  function updateGroupIds(ids) {
    ids.forEach(function(id) {
      segments[id].group = ids;
    });
  }

  // split a group of segments into pairs of matching segments + a residual group
  // @group Array of segment ids
  //
  function splitGroup(group) {
    // find best-match segment pair
    var group2 = findMatchingPair(group, checkDoubleExtension) ||
        findMatchingPair(group, checkSingleExtension) ||
        findMatchingPair(group, checkPairwiseMatch);
    if (group2) {
      group = group.filter(function(i) {
        return !utils.contains(group2, i);
      });
      updateGroupIds(group);
      updateGroupIds(group2);
      // Split again if reduced group is still large
      if (group.length > 2) splitGroup(group);
    }
  }
}

// Second pass -- generate dissolved shapes
//
function dissolveSecondPass(segments, shapes, getGroupId) {
  var dissolveShapes = [];
  segments.forEach(procSegment);
  return dissolveShapes;

  // @obj is an arc instance
  function procSegment(obj) {
    if (obj.used) return;
    var match = findDissolveArc(obj);
    if (!match) buildRing(obj);
  }

  function addRing(arcs, i) {
    if (i in dissolveShapes === false) {
      dissolveShapes[i] = [];
    }
    dissolveShapes[i].push(arcs);
  }

  // Generate a dissolved ring
  // @firstArc the first arc instance in the ring
  //
  function buildRing(firstArc) {
    var newArcs = [firstArc.arcId],
        nextArc = getNextArc(firstArc);
        firstArc.used = true;

    while (nextArc && nextArc != firstArc) {
      newArcs.push(nextArc.arcId);
      nextArc.used = true;
      nextArc = getNextArc(nextArc);
      if (nextArc && nextArc != firstArc && nextArc.used) error("buildRing() topology error");
    }

    if (!nextArc) error("buildRing() traversal error");
    firstArc.used = true;
    addRing(newArcs, getGroupId(firstArc.shapeId));
  }

  // Get the next arc in a dissolved polygon ring
  // @obj an undissolvable arc instance
  //
  function getNextArc(obj, depth) {
    var next = getNextSegment(obj, segments, shapes),
        match;
    depth = depth || 0;
    if (next != obj) {
      match = findDissolveArc(next);
      if (match) {
        if (depth > 100) {
          error ('[dissolve] deep recursion -- unhandled topology problem');
        }
        // if (match.part.arcs.length == 1) {
        if (shapes[match.shapeId][match.partId].length == 1) {
          // case: @obj has an island inclusion -- keep traversing @obj
          // TODO: test case if @next is first arc in the ring
          next = getNextArc(next, depth + 1);
        } else {
          next = getNextArc(match, depth + 1);
        }
      }
    }
    return next;
  }

  // Look for an arc instance that can be dissolved with segment @obj
  // (must be going the opposite direction and have same dissolve key, etc)
  // Return matching segment or null if no match
  //
  function findDissolveArc(obj) {
    var dissolveId = getGroupId(obj.shapeId), // obj.shape.dissolveKey,
        match, matchId;
    matchId = utils.find(obj.group, function(i) {
      var a = obj,
          b = segments[i];
      if (a == b ||
          b.used ||
          getGroupId(b.shapeId) !== dissolveId ||
          // don't prevent rings from dissolving with themselves (risky?)
          // a.shapeId == b.shapeId && a.partId == b.partId ||
          a.arcId != ~b.arcId) return false;
      return true;
    });
    match = matchId === null ? null : segments[matchId];
    return match;
  }
}

function getNextSegment(seg, segments, shapes) {
  return getSegmentByOffs(seg, segments, shapes, 1);
}

function getPrevSegment(seg, segments, shapes) {
  return getSegmentByOffs(seg, segments, shapes, -1);
}

function getSegmentByOffs(seg, segments, shapes, offs) {
  var arcs = shapes[seg.shapeId][seg.partId],
      partLen = arcs.length,
      nextOffs = (seg.i + offs) % partLen,
      nextSeg;
  if (nextOffs < 0) nextOffs += partLen;
  nextSeg = segments[seg.segId - seg.i + nextOffs];
  if (!nextSeg || nextSeg.shapeId != seg.shapeId) error("index error");
  return nextSeg;
}

// Return a properties array for a set of dissolved shapes
// Records contain dissolve field data (or are empty if not dissolving on a field)
// TODO: copy other user-specified fields
//
// @properties original records
// @index hash of dissolve shape ids, indexed on dissolve keys
//
MapShaper.calcDissolveData = function(properties, getGroupId, opts) {
  var arr = [];
  var sumFields = opts.sum_fields || [],
      copyFields = opts.copy_fields || [];

  if (opts.field) {
    copyFields.push(opts.field);
  }

  properties.forEach(function(rec, i) {
    if (!rec) return;
    var idx = getGroupId(i),
        dissolveRec;

    if (idx in arr) {
      dissolveRec = arr[idx];
    } else {
      arr[idx] = dissolveRec = {};
      copyFields.forEach(function(f) {
        dissolveRec[f] = rec[f];
      });
    }

    sumFields.forEach(function(f) {
      // TODO: handle strings
      dissolveRec[f] = (rec[f] || 0) + (dissolveRec[f] || 0);
    });
  });
  return arr;
};
