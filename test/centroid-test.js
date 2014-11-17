var assert = require('assert'),
    api = require("../");

function fixPath(p) {
  return require('path').join(__dirname, p);
}

function testInnerPoints(file, cmd, done) {
  var cmd = fixPath(file) + " " + cmd;
  api.runCommands(cmd, function(err, data) {
    var polys = data.layers[0],
        points = data.layers[1];

    polys.shapes.forEach(function(shp, i) {
      var p = points.shapes[i][0];
      var isInside = api.geom.testPointInPolygon(p[0], p[1], shp, data.arcs);
      assert(isInside);
    });
    done();
  });
}

describe('mapshaper-centroid.js', function () {
  var a = "-each 'cx=$.innerX, cy=$.innerY' -points x=cx y=cy +";
  var b = "-points inner +";
  it('file A', function(done) {
    testInnerPoints('test_data/centroids/a.shp', a, done);
  })
  it('file B', function(done) {
    testInnerPoints('test_data/centroids/b.shp', a, done);
  })
  it('file C', function(done) {
    testInnerPoints('test_data/six_counties.shp', a, done);
  })
  it('file A v2', function(done) {
    testInnerPoints('test_data/centroids/a.shp', b, done);
  })
  it('file B v2', function(done) {
    testInnerPoints('test_data/centroids/b.shp', b, done);
  })
})
