import api from '../mapshaper.js';
import assert from 'assert';

function testInnerPoints(file, cmd, done) {
  var cmd = file + " " + cmd;
  api.internal.testCommands(cmd, function(err, data) {
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


describe('mapshaper-anchor-points.js', function () {
  describe('inner points test', function () {

    var a = "-each 'cx=$.innerX, cy=$.innerY' -points x=cx y=cy +";
    var b = "-points inner +";
    it('file A', function(done) {
      testInnerPoints('test/data/features/centroids/a.shp', a, done);
    })
    it('file B', function(done) {
      testInnerPoints('test/data/features/centroids/b.shp', a, done);
    })
    it('file C', function(done) {
      testInnerPoints('test/data/six_counties.shp', a, done);
    })
    it('file A v2', function(done) {
      testInnerPoints('test/data/features/centroids/a.shp', b, done);
    })
    it('file B v2', function(done) {
      testInnerPoints('test/data/features/centroids/b.shp', b, done);
    })
  })

  it('"-points inner" converts collapsed polygon to null geometry', function () {
    var shp = [[[0]]];
    var arcs = new api.internal.ArcCollection([[[0, 0], [0, 0], [0, 0], [0, 0]]]);
    var p = api.internal.findAnchorPoint(shp, arcs);
    assert.equal(p, null);
  })

  it('"-points inner" finds center of a rectangle', function () {
    var shape = [[0]];
    var arcs = new api.internal.ArcCollection([[[0, 0], [0, 1], [2, 1], [2, 0], [0, 0]]]);
    var p = api.internal.findAnchorPoint(shape, arcs);
    assert.equal(p.x, 1);
    assert.equal(p.y, 0.5);
  })

})
