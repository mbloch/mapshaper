import assert from 'assert';
import api from '../mapshaper.js';

var Bounds = api.internal.Bounds;

describe('mapshaper-rectangle.js', function () {

  describe('applyAspectRatio()', function () {
    var applyAspectRatio = api.internal.applyAspectRatio;
    it('Handle max ratio', function () {
      var bounds = new Bounds(1, 1, 4, 2); // wide box
      applyAspectRatio(',1', bounds)
      assert.deepEqual(bounds.toArray(), [1, 0, 4, 3]);
    })

    it('Handle min ratio', function () {
      var bounds = new Bounds(1, 1, 2, 4); // tall box
      applyAspectRatio('1,', bounds)
      assert.deepEqual(bounds.toArray(), [0, 1, 3, 4]);
    })

    it('Handle fixed ratio', function () {
      var bounds = new Bounds(0, 0, 2, 2); // tall box
      applyAspectRatio('2', bounds);
      assert.deepEqual(bounds.toArray(), [-1, 0, 3, 2]);
    })

    it('Handle min and max ratio 1', function () {
      var bounds = new Bounds(0, 0, 2, 2); // tall box
      applyAspectRatio('1,2', bounds);
      assert.deepEqual(bounds.toArray(), [0, 0, 2, 2]); // box fits
    })

    it('Handle min and max ratio 2', function () {
      var bounds = new Bounds(0, 0, 4, 1); // tall box
      applyAspectRatio('1,2', bounds);
      assert.deepEqual(bounds.toArray(), [0, -0.5, 4, 1.5]); // pad vertically
    })


    it('Handle min and max ratio 3 -- min,max order reversed', function () {
      var bounds = new Bounds(0, 0, 4, 1); // tall box
      applyAspectRatio('2,1', bounds);
      assert.deepEqual(bounds.toArray(), [0, -0.5, 4, 1.5]); // pad vertically
    })
  })

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
    api.applyCommands('-rectangle bbox=1,1,4,4 offset=1 -o gj2008 out.json', {}, function(err, out) {
      var geom = JSON.parse(out['out.json']).geometries[0];
      assert.deepEqual(geom, {
        type: 'Polygon',
        coordinates: [[[0,0], [0,5], [5,5], [5,0], [0,0]]]
      });
      done();
    });
  })

  it ('-rectangle with a projected bbox', function(done) {
    api.applyCommands('-rectangle bbox=100,100,1000,1000 offset=1 -o out.json', {}, function(err, out) {
      var geom = JSON.parse(out['out.json']).geometries[0];
      assert.deepEqual(geom, {
        type: 'Polygon',
        coordinates: [[ [ 99, 99 ], [ 1001, 99 ], [ 1001, 1001 ], [ 99, 1001 ], [ 99, 99 ] ]]
      });
      done();
    });
  })

  it ('create a rectangle from an existing layer with percentage offsets', function(done) {
    var geom = {
      type: 'LineString',
      coordinates: [[0, 1], [1, 2], [2, 1], [1, 0]]
    };
    api.applyCommands('-i in.json -rectangle offset=50%,100%,150%,200% -o gj2008 out.json',
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
