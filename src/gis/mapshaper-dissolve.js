/* @requires mapshaper-common, mapshaper-data-table */

MapShaper.dissolveLayers = function(layers) {
  T.start();
  if (!Utils.isArray(layers)) error ("[dissolveLayers()] Expected an array of layers");
  var dissolvedLayers = [],
      args = Utils.toArray(arguments);

  Utils.forEach(layers, function(lyr) {
    args[0] = lyr;
    var layers2 = MapShaper.dissolveLayer.apply(null, args);
    dissolvedLayers.push.apply(dissolvedLayers, layers2);
  });
  T.stop('Dissolve polygons');
  return dissolvedLayers;
};

// Dissolve a polygon layer into one or more derived layers
// @dissolve comma-separated list of fields or true
//
MapShaper.dissolveLayer = function(lyr, arcs, dissolve, opts) {
  if (lyr.geometry_type != 'polygon') {
    error("[dissolveLayer()] Expected a polygon layer");
  }
  if (!Utils.isString(dissolve)) {
    dissolve = "";
  }
  var layers = Utils.map(dissolve.split(','), function(f) {
    return MapShaper.dissolve(lyr, arcs, f || null, opts);
  });
  return layers;
};

// Generate a dissolved layer
// @field Name of data field to dissolve on or null to dissolve all polygons
//
MapShaper.dissolve = function(lyr, arcs, field, opts) {
  var shapes = lyr.shapes,
      dataTable = lyr.data || null,
      properties = dataTable ? dataTable.getRecords() : null,
      dissolveLyr,
      dissolveRecords,
      getDissolveKey;

  opts = opts || {};
  // T.start();

  if (field) {
    if (!dataTable) {
      error("[dissolveLayer()] Layer is missing a data table");
    }
    if (field && !dataTable.fieldExists(field)) {
      error("[dissolveLayer()] Missing field:",
        field, '\nAvailable fields:', dataTable.getFields().join(', '));
    }
    getDissolveKey = function(shapeId) {
      var record = properties[shapeId];
      return record[field];
    };
  } else {
    getDissolveKey = function(shapeId) {
      return "";
    };
  }

  //T.start();
  var first = dissolveFirstPass(shapes, getDissolveKey);
  //T.stop("dissolve first pass");
  //T.start();
  var second = dissolveSecondPass(first.segments, shapes, first.keys);
  //T.stop('dissolve second pass');
  dissolveLyr = {
    shapes: second.shapes,
    name: field || 'dissolve',
  };
  if (properties) {
    dissolveRecords = MapShaper.calcDissolveData(first.keys, second.index, properties, field, opts);
    dissolveLyr.data = new DataTable(dissolveRecords);
  }
  Opts.copyNewParams(dissolveLyr, lyr);

  // T.stop('Dissolve polygons');
  return dissolveLyr;
};

// First pass -- identify pairs of segments that can be dissolved
//
function dissolveFirstPass(shapes, getKey) {
  var groups = [],
      largeGroups = [],
      segments = [],
      keys = [];

  function procShape(shapeId) {
    var key = getKey(shapeId);
    keys[shapeId] = key;
  }

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
    return arc1.arcId === ~arc2.arcId && keys[arc1.shapeId] ===
        keys[arc2.shapeId];
  }

  function updateGroupIds(ids) {
    Utils.forEach(ids, function(id) {
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
      group = Utils.filter(group, function(i) {
        return !Utils.contains(group2, i);
      });
      updateGroupIds(group);
      updateGroupIds(group2);
      // Split again if reduced group is still large
      if (group.length > 2) splitGroup(group);
    }
  }

  MapShaper.traverseShapes(shapes, procArc, null, procShape);
  Utils.forEach(largeGroups, splitGroup);

  return {
    segments: segments,
    keys: keys
  };
}

// Second pass -- generate dissolved shapes
//
function dissolveSecondPass(segments, shapes, keys) {
  var dissolveIndex = {},  // new shape ids indexed by dissolveKey
      dissolveShapes = []; // dissolved shapes

  function addRing(arcs, key) {
    var i;
    if (key in dissolveIndex === false) {
      i = dissolveShapes.length;
      dissolveIndex[key] = i;
      dissolveShapes[i] = [];
    } else {
      i = dissolveIndex[key];
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
    addRing(newArcs, keys[firstArc.shapeId]);
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
    var dissolveKey = keys[obj.shapeId], // obj.shape.dissolveKey,
        match, matchId;
    matchId = Utils.find(obj.group, function(i) {
      var a = obj,
          b = segments[i];
      if (a == b ||
          b.used ||
          keys[b.shapeId] != dissolveKey ||
          // don't prevent rings from dissolving with themselves (risky?)
          // a.shapeId == b.shapeId && a.partId == b.partId ||
          a.arcId != ~b.arcId) return false;
      return true;
    });
    match = matchId === null ? null : segments[matchId];
    return match;
  }

  // @obj is an arc instance
  function procSegment(obj) {
    if (obj.used) return;
    var match = findDissolveArc(obj);
    if (!match) buildRing(obj);
  }

  Utils.forEach(segments, procSegment);
  return {
    index: dissolveIndex,
    shapes: dissolveShapes
  };
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
// @keys array of dissolve keys, indexed on original shape ids
// @index hash of dissolve shape ids, indexed on dissolve keys
// @properties original records
// @field name of dissolve field, or null
//
MapShaper.calcDissolveData = function(keys, index, properties, field, opts) {
  var arr = [];
  var sumFields = opts.sum_fields,
      copyFields = opts.copy_fields || [];

  if (field) {
    copyFields.push(field);
  }

  Utils.forEach(keys, function(key, i) {
    if (key in index === false) return;
    var idx = index[key],
        rec = properties[i],
        dissolveRec;

    if (!rec) return;

    if (idx in arr) {
      dissolveRec = arr[idx];
    } else {
      arr[idx] = dissolveRec = {};
      Utils.forEach(copyFields, function(f) {
        dissolveRec[f] = rec[f];
      });
    }

    Utils.forEach(sumFields, function(f) {
      dissolveRec[f] = (rec[f] || 0) + (dissolveRec[f] || 0);
    });
  });
  return arr;
};

MapShaper.traverseShapes = function traverseShapes(shapes, cbArc, cbPart, cbShape) {
  var segId = 0;
  Utils.forEach(shapes, function(parts, shapeId) {
    if (!parts || parts.length === 0) return; // null shape
    var arcIds, arcId, partData;
    if (cbShape) {
      cbShape(shapeId);
    }
    for (var i=0, m=parts.length; i<m; i++) {
      arcIds = parts[i];
      if (cbPart) {
        cbPart({
          i: i,
          shapeId: shapeId,
          shape: parts,
          arcs: arcIds
        });
      }

      for (var j=0, n=arcIds.length; j<n; j++, segId++) {
        if (cbArc) {
          arcId = arcIds[j];
          cbArc({
            i: j,
            shapeId: shapeId,
            partId: i,
            arcId: arcId,
            segId: segId
          });
        }
      }
    }
  });
};
