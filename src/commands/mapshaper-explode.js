/* @requires mapshaper-common */

MapShaper.explodeLayers = function(layers, arcs) {
  for (var i=0; i<layers.length; i++) {
    MapShaper.explode(layers[i], arcs);
  }
};

MapShaper.explode = function(lyr, arcs) {
  var properties = lyr.data ? lyr.data.getRecords() : null,
      explodedProperties = [],
      explodedShapes = [];

  Utils.forEach(lyr.shapes, function(shp, shapeId) {
    var rec2, shp2;
    if (shp && shp.length > 0) {
      for (var i=0; i<shp.length; i++) {
        if (shp.length > 1) {
          shp2 = [shp[i]];
        } else {
          shp2 = shp;
        }
        explodedShapes.push(shp2);

        if (properties) {
          if (i > 0) {
            rec2 = Utils.extend({}, properties[shapeId]);
          } else {
            rec2 = properties[shapeId];
          }
          explodedProperties.push(rec2);
        }
      }
    } else {
      if (properties) {
        explodedProperties.push(properties[shapeId]);
      }
      explodedShapes.push(shp);
    }
  });

  if (properties) {
    lyr.data = new DataTable(explodedProperties);
  }
  lyr.shapes = explodedShapes;
};
