var assert = require('assert'),
    api = require("../");

describe('mapshaper-shape.js', function () {

  it('Rectangles created using -rectangle source= are assigned CRS of source', function(done) {
    var cmd = '-rectangle bbox=0,0,1,1 name=box1 -proj +proj=merc -rectangle source=box1 name=box2' +
        ' -o target=box2 format=shapefile';
    api.applyCommands(cmd, {}, function(err, o) {
      var prj = o['box2.prj'] || '';
      assert(prj.indexOf('Mercator') > -1);
      done();
    });
  });

  it ('create a rectangle using -rectangle bbox= and offset=', function(done) {
    api.applyCommands('-rectangle bbox=1,1,4,4 offset=1 -o out.json', {}, function(err, out) {
      var geom = JSON.parse(out['out.json']).geometries[0];
      assert.deepEqual(geom, {
        type: 'Polygon',
        coordinates: [[[0,0], [0,5], [5,5], [5,0], [0,0]]]
      });
      done();
    });
  })

  it ('create a rectangle from an existing layer with percentage offsets', function(done) {
    var geom = {
      type: 'LineString',
      coordinates: [[0, 1], [1, 2], [2, 1], [1, 0]]
    };
    api.applyCommands('-i in.json -rectangle offset=50%,100%,150%,200% -o out.json',
        {'in.json': geom}, function(err, output) {
      var geom = JSON.parse(output['out.json']);
      var expect = {
        type: 'Polygon',
        coordinates: [[[-1, -2], [-1, 6], [5, 6], [5, -2], [-1, -2]]]
      };
      assert.deepEqual(geom.geometries[0], expect);
      done();
    });


  })




})
