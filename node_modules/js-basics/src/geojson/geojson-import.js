/* @requires core */

function GeoJSON(opts) {
  var defaults = {
    pivot: false // pivot arrays of [x,y] points. 
  };
  opts = Opts.copyAllParams(defaults, opts);

  this.coordinateConverters = {
    MultiPolygon: this.flattenMultiPolygonCoords,
    LineString: function(coords) {return [coords];}  // treat LineString as one-part MultiLineString
  };
}


/*
GeoJSON.prototype.pivotSimpleCoords = function(coords) {
  var arr = [];
  var dimensions = coords[0].length;
  for (var i=0; i<dimensions; i++) {
    var dim = [];
    for (var j=0, coordCount=coords.length; j<coordCount; j++) {
      dim.push(coords[j][i]);
    }
    arr.push(dim);
  }
  return arr;
};

*/

GeoJSON.prototype.flattenMultiPolygonCoords = function(coords) {
  var flattened = [];
  Utils.forEach(coords, function(part) {
    flattened.push.apply(flattened, part);
  });
  
  return flattened;
};


/**
 *  Import all the polygons from a geojson object
 */
GeoJSON.prototype.importCollectionByType = function(obj, targetType) {
  if (Utils.isString(obj)) {
    obj = JSON.parse(obj);
  }
  var shapes = [],
    properties = [];

  if (obj.type == 'GeometryCollection') {
    Utils.forEach(obj.geometries, function(geom) {
      var gotOne = this.importGeometryByType(geom, targetType, shapes);
      gotOne && properties.push({});
    }, this);
  }
  else if (obj.type == 'FeatureCollection') {
    Utils.forEach(obj.features, function(feat) {
      var gotOne = this.importGeometryByType(feat.geometry, targetType, shapes);
      if (gotOne) {
        if (feat.id) {
          feat.properties.id = feat.id;
        }
        properties.push(feat.properties);
      }
    }, this);
  }
  else {
    throw "[GeoJSON.importCollectionByType()] Expected collection type";
  }

  return {shapes:shapes, properties:properties};
};



GeoJSON.prototype.importGeometryByType = function(obj, targetType, shapes) {
  var type = obj.type,
    coords;

  if (targetType == type || type == 'MultiPolygon' && targetType == 'Polygon' || type == 'MultiLineString' && targetType == 'LineString') {
    if (type in this.coordinateConverters) {
      coords = this.coordinateConverters[type](obj.coordinates);
    }
    else {
      coords = obj.coordinates;
    }
    shapes.push(coords);
    return true;
  }
    
  trace("[GeoJSON.importGeometryByType()] invalid type:", type);
  return false;
};
