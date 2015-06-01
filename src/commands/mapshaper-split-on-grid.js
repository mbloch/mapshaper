/* @requires mapshaper-common */

// Split the shapes in a layer according to a grid
// Return array of layers and an index with the bounding box of each cell
//
api.splitLayerOnGrid = function(lyr, arcs, rows, cols) {
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
    c = utils.clamp(c, 0, cols-1);
    r = utils.clamp(r, 0, rows-1);
    return r * cols + c;
  }

  function groupName(i) {
    var c = i % cols + 1,
        r = Math.floor(i / cols) + 1;
    return "r" + r + "c" + c;
  }

  shapes.forEach(function(shp, i) {
    var bounds = arcs.getMultiShapeBounds(shp),
        idx = groupId(bounds),
        group = groups[idx];
    if (!group) {
      group = groups[idx] = {
        shapes: [],
        properties: properties ? [] : null,
        bounds: new Bounds(),
        name: MapShaper.getSplitLayerName(lyr.name, groupName(idx))
      };
    }
    group.shapes.push(shp);
    group.bounds.mergeBounds(bounds);
    if (group.properties) {
      group.properties.push(properties[i]);
    }
  });

  var layers = [];
  groups.forEach(function(group, i) {
    if (!group) return; // empty cell
    var groupLyr = {
      shapes: group.shapes,
      name: group.name
    };
    utils.defaults(groupLyr, lyr);
    if (group.properties) {
      groupLyr.data = new DataTable(group.properties);
    }
    layers.push(groupLyr);
  });

  return layers;
};
