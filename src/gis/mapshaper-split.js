/* @requires mapshaper-shapes */


/*


*/
MapShaper.splitOnGrid = function(lyr, arcs, rows, cols) {
  // TODO: combine these
  var shapeIndex = {};
  var boundsIndex = {};
  var propertyIndex = {};

  var shapes = lyr.shapes;
  var bounds = arcs.getBounds(),
      xmin = bounds.xmin,
      ymin = bounds.ymin,
      w = bounds.width(),
      h = bounds.height();
  var shp, shpBounds, key;
  var properties = lyr.data ? lyr.data.getRecords() : lyr.properties || null;

  function getShapeKey(shpBounds) {
    var c = Math.floor((shpBounds.centerX() - xmin) / w * cols) + 1,
        r = Math.floor((shpBounds.centerY() - ymin) / h * rows) + 1;
    if (c < 1 || r < 1 || c > cols || r > rows) {
      trace("   layer bounds:", bounds, "shp:", shpBounds);
      trace("   centerX:", shpBounds.centerX(), "centerY:", shpBounds.centerY());
      error("#spliceOnGrid() error; r, c:", r, c, "rows, cols:", rows, cols);
    }
    return getKey(c, r);
  }

  function getKey(c, r) {
    return "c" + c + "r" + r;
  }

  for (var i=0; i<shapes.length; i++) {
    shp = shapes[i];
    shpBounds = arcs.getMultiShapeBounds(shp);
    key = getShapeKey(shpBounds);
    if (key in shapeIndex) {
      shapeIndex[key].push(shp);
      boundsIndex[key].mergeBounds(shpBounds);
      if (properties) propertyIndex[key].push(properties[i]);
    } else {
      shapeIndex[key] = [shp];
      boundsIndex[key] = shpBounds;
      if (properties) propertyIndex[key] = [properties[i]];
    }
  }

  var json = [],
      layers = [],
      splitLyr,
      indexItem;
  // export layers

  for (var r=1; r<=rows; r++) {
    for (var c=1; c<=cols; c++) {
      key = getKey(c, r);
      splitLyr = Utils.extend({}, lyr);
      //if (properties) splitLyr.properties = [];
      splitLyr.shapes = shapeIndex[key] || [];
      splitLyr.name = key;
      layers.push(splitLyr);
      if (key in boundsIndex) {
        shpBounds = boundsIndex[key];
        splitLyr.data = new DataTable(propertyIndex[key]);
        json.push({
          // properties: propertyIndex[key] || null,
          name: key,
          bounds: shpBounds.toArray()
        });
      }
    }
  }

  return {
    index: JSON.stringify(json),
    layers: layers
  };

};