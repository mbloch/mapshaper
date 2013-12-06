/* @requires mapshaper-shapes */

MapShaper.splitLayersOnField = function(layers, arcs, field) {
  var splitLayers = [];
  Utils.forEach(layers, function(lyr) {
    splitLayers = splitLayers.concat(MapShaper.splitOnField(lyr, arcs, field));
  });
  return splitLayers;
};

MapShaper.splitOnField = function(lyr0, arcs, field) {
  var dataTable = lyr0.data;
  if (!dataTable) error("[splitOnField] Missing a data table");
  if (!dataTable.fieldExists(field)) error("[splitOnField] Missing field:", field);

  var index = {},
      properties = dataTable.getRecords(),
      shapes = lyr0.shapes,
      splitLayers = [];

  Utils.forEach(shapes, function(shp, i) {
    var rec = properties[i],
        key = rec[field],
        lyr, idx;

    if (key in index === false) {
      idx = splitLayers.length;
      index[key] = idx;
      splitLayers.push({
        name: key || Utils.getUniqueName("layer"),
        properties: [],
        shapes: []
      });
    } else {
      idx = index[key];
    }

    lyr = splitLayers[idx];
    lyr.shapes.push(shapes[i]);
    lyr.properties.push(properties[i]);
  });

  return Utils.map(splitLayers, function(obj) {
    return Opts.copyNewParams({
      name: obj.name,
      shapes: obj.shapes,
      data: new DataTable(obj.properties)
    }, lyr0);
  });
};


// Split the shapes in a layer according to a grid
// Return array of layers and an index with the bounding box of each cell
//
MapShaper.splitOnGrid = function(lyr, arcs, rows, cols) {
  var shapes = lyr.shapes,
      bounds = arcs.getBounds(),
      xmin = bounds.xmin,
      ymin = bounds.ymin,
      w = bounds.width(),
      h = bounds.height(),
      properties = lyr.data ? lyr.data.getRecords() : null,
      groups = [];

  function groupId(shpBounds) {
    var c = Math.floor((shpBounds.centerX() - xmin) / w * cols),
        r = Math.floor((shpBounds.centerY() - ymin) / h * rows);
    c = Utils.clamp(c, 0, cols-1);
    r = Utils.clamp(r, 0, rows-1);
    return r * cols + c;
  }

  function groupName(i) {
    var c = i % cols + 1,
        r = Math.floor(i / cols) + 1;
    return "r" + r + "c" + c;
  }

  Utils.forEach(shapes, function(shp, i) {
    var bounds = arcs.getMultiShapeBounds(shp),
        idx = groupId(bounds),
        group = groups[idx];
    if (!group) {
      group = groups[idx] = {
        shapes: [],
        properties: properties ? [] : null,
        bounds: new Bounds(),
        name: groupName(idx)
      };
    }
    group.shapes.push(shp);
    group.bounds.mergeBounds(bounds);
    if (group.properties) {
      group.properties.push(properties[i]);
    }
  });

  var index = [],
      layers = [];
  Utils.forEach(groups, function(group, i) {
    if (!group) return; // empty cell
    var groupLyr = {
      shapes: group.shapes,
      name: group.name
    };
    Opts.copyNewParams(groupLyr, lyr);
    if (group.properties) {
      groupLyr.data = new DataTable(group.properties);
    }
    layers.push(groupLyr);
    index.push({
      name: group.name,
      bounds: group.bounds.toArray()
    });
  });

  return {
    index: index,
    layers: layers
  };
};
