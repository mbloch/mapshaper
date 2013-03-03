/* @requires mapshaper-common, core.geo, arrayutils */

//
//

// Strings
// A simple json format for test data
// Examples:
//
/*

{
  "polygons":[
    "2,0 2,2 0,2 0,0 2,0"
  ]

}
    "2,0 2,2 0,2 0,0 2,0"
  ]

  {
    type: "polygon",
    coordinates: [
      "2,0 2,2 0,2 0,0 2,0"
    ]
  }

*/

var Testing = {};

Testing.importTestData = function(obj) {
  var data;
  if (Utils.isString(obj)) {
    obj = JSON.parse(obj);
  }

  if (Utils.isArray(obj)) {
    data = MapShaper.importTestDataPolygons(obj);
  } else if (obj.type == 'polygon' && 'coordinates' in obj) {
    data = MapShaper.importTestDataPolygons(obj.coordinates);
  } else {
    error("[importTestData()] Missing parsable data.");
  }

  return data;
};



Testing.parseStringData = function(arr) {
  var shapeIds = [],
      partIds = [],
      xx = [],
      yy = [],
      shapeId = 0,
      partId = 0;

  var coordRxp = /(-?[\d]+(?:\.[\d]+)?), ?(-?[\d]+(?:\.[\d]+)?))/g;

  Utils.forEach(arr, function(str) {
    var parts = str.split(';');
    Utils.forEach(parts, function(partStr) {
      var match;
      while (match = coordRxp.exec(partStr)) {
        partIds.push(partId);
        xx.push(parseFloat(match[1]));
        yy.push(parseFloat(match[2]));
      }
      shapeIds.push(shapeId);
      partId++;
    });
    shapeId++;
  });
  return {shapeIds: shapeIds, partIds: partIds, xx: xx, yy: yy};
};


// Receive: array of array/s of points
//
//
Testing.generateAsciiDiagram = function(lines) {
  var labelIndex = {},
      left = "//   ",
      pre = "//\n",
      post = "//\n",
      MAX_LINE = "82";

  // get extents
  var bb = new BoundingBox();
  Utils.forEach(lines, function(line) {
    Utils.forEach(line, function(p) {
      bb.mergePoint(p[0], p[1])
    });
  });

  trace(bb);

};

