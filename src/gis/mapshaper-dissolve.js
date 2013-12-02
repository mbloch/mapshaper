/* @requires mapshaper-common, mapshaper-data-table */

// Dissolve a polygon layer into one or more derived layers
// @dissolve comma-separated list of fields or true
//
MapShaper.dissolveLayer = function(lyr, arcs, dissolve) {
  if (lyr.geometry_type != 'polygon') {
    error("[dissolveLayer()] Expected a polygon layer");
  }
  if (!Utils.isString(dissolve)) {
    dissolve = "";
  }
  var layers = Utils.map(dissolve.split(','), function(f) {
    return MapShaper.dissolve(lyr, arcs, f || null);
  });
  return layers;
};

// Generate a dissolved layer
// @field name of dissolve field or null
//
MapShaper.dissolve = function(lyr, arcs, field) {
  var shapes = lyr.shapes,
      properties = lyr.data ? lyr.data.getRecords() : null,
      dissolveLyr,
      dissolveRecords,
      getDissolveKey;

  T.start();

  if (field) {
    if (!properties) {
      error("[dissolveLayer()] Layer is missing a data table");
    }
    if (field && !lyr.data.fieldExists(field)) {
      error("[dissolveLayer()] Missing field:",
        field, '\nAvailable fields:', lyr.data.getFields().join(', '));
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
    dissolveRecords = MapShaper.calcDissolveData(first.keys, second.index, properties, field);
    dissolveLyr.data = new DataTable(dissolveRecords);
  }
  Opts.copyNewParams(dissolveLyr, lyr);

  T.stop('dissolve');
  return dissolveLyr;
};

function dissolveFirstPass(shapes, getKey) {
  var groups = [],
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
  }

  MapShaper.traverseShapes(shapes, procArc, null, procShape);
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

    while (nextArc && nextArc != firstArc) {
      newArcs.push(nextArc.arcId);
      nextArc.used = true;
      nextArc = getNextArc(nextArc);
      if (nextArc.used) error("buildRing() topology error");
    }

    if (!nextArc) error("buildRing() traversal error");
    firstArc.used = true;

    addRing(newArcs, firstArc.shape.dissolveKey);
  }

  // Get the next segment in a dissolved polygon ring
  // @obj an undissolvable arc instance
  //
  function getNextArc(obj) {
    var partLen = obj.part.arcs.length,
        offs = 1,
        next, match;
    if (partLen == 1) {
      next = obj;
    } else {
      if (obj.i + offs == partLen) {
        offs -= partLen;
      }
      next = segments[obj.segId + offs];
      match = findDissolveArc(next);
      if (match) {
        if (match.part.arcs.length == 1) {
          next = getNextArc(next);
        } else {
          next = getNextArc(match);
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
    var dissolveKey = obj.shape.dissolveKey;
    var matchId = Utils.find(obj.group, function(i) {
      if (i === obj.segId) return false;
      var other = segments[i];
      return !other.used && other.shape.dissolveKey === dissolveKey && obj.arcId == ~other.arcId;
    });
    if (matchId === null) return null;
    return segments[matchId];
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

// Return a properties array for a set of dissolved shapes
// Records contain dissolve field data (or are empty if not dissolving on a field)
// TODO: copy other user-specified fields
//
// @keys array of dissolve keys, indexed on original shape ids
// @index hash of dissolve shape ids, indexed on dissolve keys
// @properties original records
// @field name of dissolve field, or null
//
MapShaper.calcDissolveData = function(keys, index, properties, field) {
  var arr = [];
  Utils.forEach(keys, function(key, i) {
    if (key in index === false) return;
    var idx = index[key],
        rec;
    if (idx in arr) return;
    rec = {};
    if (field) {
      rec[field] = properties[i][field];
    }
    arr[idx] = rec;
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
