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


  it ('create a polyline', function(done) {
    api.applyCommands('-shape coordinates=10,10 offsets=0,10,10,0,0,-10 -o out.json', {}, function(err, output) {
      var line = JSON.parse(output['out.json']).geometries[0];
      assert.deepEqual(line, {
        type: 'LineString',
        coordinates: [[10,10], [10,20], [20,20], [20,10]]
      })
      done();
    })
  })

  it ('create a polygon with closed and offsets= option', function(done) {
    api.applyCommands('-shape coordinates=10,10 offsets=0,10,10,0,0,-10 closed -o out.json', {}, function(err, output) {
      var line = JSON.parse(output['out.json']).geometries[0];
      assert.deepEqual(line, {
        type: 'Polygon',
        coordinates: [[[10,10], [10,20], [20,20], [20,10], [10,10]]]
      })
      done();
    })
  })

  it ('create a polygon from coordinates', function(done) {
    api.applyCommands('-shape coordinates=10,10,10,20,20,20,20,10,10,10 -o out.json', {}, function(err, output) {
      var line = JSON.parse(output['out.json']).geometries[0];
      assert.deepEqual(line, {
        type: 'Polygon',
        coordinates: [[[10,10], [10,20], [20,20], [20,10], [10,10]]]
      })
      done();
    })
  })

})
