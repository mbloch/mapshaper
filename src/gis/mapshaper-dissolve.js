/* @requires mapshaper-common, mapshaper-data-table */


MapShaper.dissolveLayers = function(layers) {
  if (!Utils.isArray(layers)) error ("[dissolveLayers()] Expected an array of layers");
  var dissolvedLayers = [],
      args = Utils.toArray(arguments);

  Utils.forEach(layers, function(lyr) {
    args[0] = lyr;
    var layers2 = MapShaper.dissolveLayer.apply(null, args);
    dissolvedLayers.push.apply(dissolvedLayers, layers2);
  });
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
// @field name of dissolve field or null
//
MapShaper.dissolve = function(lyr, arcs, field, opts) {
  var shapes = lyr.shapes,
      dataTable = lyr.data || null,
      properties = dataTable ? dataTable.getRecords() : null,
      dissolveLyr,
      dissolveRecords,
      getDissolveKey;

  opts = opts || {};
  T.start();

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

  var first = dissolveFirstPass(shapes, getDissolveKey);
  var second = dissolveSecondPass(first.segments);
  dissolveLyr = {
    shapes: second.shapes,
    name: field || 'dissolve',
  };
  if (properties) {
    dissolveRecords = MapShaper.calcDissolveData(first.keys, second.index, properties, field, opts);
    dissolveLyr.data = new DataTable(dissolveRecords);
  }
  Opts.copyNewParams(dissolveLyr, lyr);

  T.stop('dissolve');
  return dissolveLyr;
};

function dissolveFirstPass(shapes, getKey) {
  var groups = [],
      largeGroups = [],
      segments = [],
      keys = [];

  function procShape(obj) {
    var key = getKey(obj.i);
    obj.dissolveKey = key;
    keys[obj.i] = key;
  }

  function procArc(obj) {
    var idx = obj.arcIdx,
        segId = segments.length,
        group = groups[idx];
    if (!group) {
      group = [];
      groups[idx] = group;
    }
    group.push(segId);
    obj.group = group;
    segments.push(obj);
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
          return [i, j];
        }
      }
    }
    return null;
  }

  function checkPairwiseExtension(arc1, arc2) {
    return checkPairwiseMatch(arc1, arc2) &&
        getNextArcInRing(arc1, segments).arcId ===
        ~getNextArcInRing(arc2, segments).arcId;
  }

  function checkPairwiseMatch(arc1, arc2) {
    return arc1.arcId === ~arc2.arcId && arc1.shape.dissolveKey ===
        arc2.shape.dissolveKey;
  }

  function updateGroupIds(ids) {
    Utils.forEach(ids, function(id) {
      segments[id].group = ids;
    });
  }

  function splitGroup(group) {
    var group2 = findMatchingPair(group, checkPairwiseExtension);
    if (!group2) {
      group2 = findMatchingPair(group, checkPairwiseMatch);
    }
    if (group2) {
      group = Utils.filter(group, function(i) {
        return !Utils.contains(group, i);
      });
      updateGroupIds(group);
      updateGroupIds(group2);
    }
  }

  MapShaper.traverseShapes(shapes, procArc, null, procShape);
  Utils.forEach(largeGroups, splitGroup);

  return {
    segments: segments,
    keys: keys
  };
}

function dissolveSecondPass(segments) {
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

    addRing(newArcs, firstArc.shape.dissolveKey);
  }

  // Get the next segment in a dissolved polygon ring
  // @obj an undissolvable arc instance
  //
  function getNextArc(obj, depth) {
    var next = getNextArcInRing(obj, segments),
        match;
    depth = depth || 0;
    if (next != obj) {
      match = findDissolveArc(next);
      if (match) {
        if (depth > 1000) {
          error ('[dissolve] deep recursion -- unhandled topology problem');
        }
        if (match.part.arcs.length == 1) {
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
  // (must be going the opposite direction, etc)
  // Return matching segment or null if no match
  //
  function findDissolveArc(obj) {
    var dissolveKey = obj.shape.dissolveKey,
        match, matchId;
    matchId = Utils.find(obj.group, function(i) {
      var other = segments[i];
      return other.segId !== obj.segId && !other.used &&
          other.shape.dissolveKey === dissolveKey && obj.arcId == ~other.arcId;
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


// Return next arc object in ring, or return @obj if ring len == 1
//
function getNextArcInRing(obj, segments) {
  var partLen = obj.part.arcs.length,
      offs = 1;
  if (partLen == 1) return obj;
  if (obj.i + offs == partLen) {
    offs -= partLen;
  }
  return segments[obj.segId + offs];
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
  var segId = 0,
      partId = 0;

  Utils.forEach(shapes, function(parts, shapeId) {
    if (!parts || parts.length === 0) return; // null shape
    var shapeData = {
      i: shapeId,
      parts: parts
    },
    arcIds, arcId, partData;
    if (cbShape) cbShape(shapeData);

    for (var i=0, m=parts.length; i<m; i++, partId++) {
      arcIds = parts[i];
      partData = {
        i: i,
        partId: partId,
        shape: shapeData,
        arcs: arcIds
      };
      if (cbPart) cbPart(partData);

      for (var j=0, n=arcIds.length; j<n; j++, segId++) {
        if (cbArc) {
          arcId = arcIds[j];
          cbArc({
            i: j,
            arcId: arcId,
            arcIdx: arcId < 0 ? ~arcId : arcId,
            segId: segId,
            part: partData,
            shape: shapeData
          });
        }
      }
    }
  });
};
