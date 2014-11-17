var assert = require('assert'),
    api = require("../");

function fixPath(p) {
  return require('path').join(__dirname, p);
}

function testInnerPoints(file, done) {
  var cmd = fixPath(file) + " -each 'cx=$.innerX, cy=$.innerY' -points x=cx y=cy +";
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
  it('file A', function(done) {
    testInnerPoints('test_data/centroids/a.shp', done);
  })
  it('file B', function(done) {
    testInnerPoints('test_data/centroids/b.shp', done);
  })
  it('file C', function(done) {
    testInnerPoints('test_data/six_counties.shp', done);
  })
})
