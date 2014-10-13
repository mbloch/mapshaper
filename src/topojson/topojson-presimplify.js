/* @requires topojson-common, mapshaper-common, mapshaper-geom */


TopoJSON.getPresimplifyFunction = function(arcs) {
  var width = arcs.getBounds().width(),
      quanta = 10000,  // enough for pixel-level detail at 1000px width and 100x zoom
      k = quanta / width;
  return TopoJSON.getZScaler(k);
};

TopoJSON.getZScaler = function(k) {
  // could substitute a rounding function with decimal precision
  return function(z) {
    var thresh = z === Infinity ? 0 : Math.ceil(z * k);
    return thresh;
  };
};
