import fs from 'fs';
import api from '../mapshaper.js';
import assert from 'assert';


describe('Issue #304 (centroid of tiny polygons can fall outside the polygon)', function () {
  function pointInBBox(point, polygon) {
    var polyCoords = polygon.coordinates[0];
    var xx = polyCoords.map(function(p) {return p[0]});
    var yy = polyCoords.map(function(p) {return p[1]});
    var minx = Math.min.apply(xx, xx);
    var maxx = Math.max.apply(xx, xx);
    var miny = Math.min.apply(yy, yy);
    var maxy = Math.max.apply(yy, yy);
    var p = point.coordinates;
    return p[0] > minx && p[0] < maxx && p[1] > miny && p[1] < maxy;
  }

  it ('test1', function(done) {
    // from user-submitted data
    var coords = [[15.191851000000042,55.32173700000004],[15.191819000000066,55.32171500000004],[15.191767000000084,55.32172300000008],[15.191820000000064,55.32175200000006],[15.191851000000042,55.32173700000004]];
    var input = {
      type: 'Polygon',
      coordinates: [coords]
    };
    var cmd = '-i data.json -points -o';
    api.applyCommands(cmd, {'data.json': input}, function(err, output) {
      assert(pointInBBox(JSON.parse(output['data.json']).geometries[0], input));
      done();
    });
  });

});
