import utils from '../utils/mapshaper-utils';
var TopoJSON = {};
export default TopoJSON;

// Iterate over all arrays of arc is in a geometry object
// @cb callback: function(ids)
// callback returns undefined or an array of replacement ids
//
TopoJSON.forEachShapePart = function forEachShapePart(obj, cb) {
  var iterators = {
        GeometryCollection: function(o) {o.geometries.forEach(eachGeom);},
        LineString: function(o) {
          var retn = cb(o.arcs);
          if (retn) o.arcs = retn;
        },
        MultiLineString: function(o) {eachMultiPath(o.arcs);},
        Polygon: function(o) {eachMultiPath(o.arcs);},
        MultiPolygon: function(o) {o.arcs.forEach(eachMultiPath);}
      };

  eachGeom(obj);

  function eachGeom(o) {
    if (o.type in iterators) {
      iterators[o.type](o);
    }
  }

  function eachMultiPath(arr) {
    var retn;
    for (var i=0; i<arr.length; i++) {
      retn = cb(arr[i]);
      if (retn) arr[i] = retn;
    }
  }
};

TopoJSON.forEachArc = function forEachArc(obj, cb) {
  TopoJSON.forEachShapePart(obj, function(ids) {
    var retn;
    for (var i=0; i<ids.length; i++) {
      retn = cb(ids[i]);
      if (utils.isInteger(retn)) {
        ids[i] = retn;
      }
    }
  });
};
