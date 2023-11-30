import api from '../mapshaper.js';
import assert from 'assert';
import fs from 'fs';

describe('mapshaper-explode.js', function () {

  it('nesting fix', function(done) {
    // test fix for a bug that caused a hole to sometimes be assigned to the wrong
    // polygon when the hole was w/in the bbox of multiple rings.
    var json = fs.readFileSync('test/data/features/explode/ex2_nesting.json');
    var cmd = '-i data.json -explode -o';
    api.applyCommands(cmd, {'data.json': json}, function(err, out) {
      var json = JSON.parse(out['data.json']);
      assert.equal(json.geometries[0].coordinates.length, 3)
      assert.equal(json.geometries[1].coordinates.length, 2)
      done();
    });
  })

  it('nesting function fix', function(done) {
    // Quick test for issue #433, relating to invalid data being passed to
    // a function in mapshaper-ring-nesting.js
    var json = fs.readFileSync('test/data/features/explode/ex2_nesting.json');
    var cmd = '-i data.json  -o';
    api.applyCommands(cmd, {'data.json': json}, function(err, out) {
      assert(!err);
      done();
    });
  })

  describe('explodeFeatures()', function () {
    it('point layer', function () {

      var lyr = {
        geometry_type: 'point',
        data: new api.internal.DataTable([{a: "foo", b: "bar"}]),
        shapes: [[[2 ,3], [4, 5], [6, 7]]]
      };

      var exploded = api.cmd.explodeFeatures(lyr);

      assert.deepEqual(exploded.data.getRecords(),
        [{a: "foo", b: "bar"}, {a: "foo", b: "bar"}, {a: "foo", b: "bar"}]);
      assert.deepEqual(exploded.shapes, [[[2, 3]], [[4, 5]], [[6, 7]]]);
    })

    it('multi polygon', function () {

      //   Fig. 1
      //
      //      b --- d
      //     / \   /
      //    /   \ /
      //   a --- c
      //
      //   cab, bc, bdc
      //   0,   1,  2
      //
      var coords = [[[3, 1], [1, 1], [2, 3]],
          [[2, 3], [3, 1]],
          [[2, 3], [4, 3], [3, 1]]];

      var arcs = new api.internal.ArcCollection(coords);
      var lyr = {
        geometry_type: 'polygon',
        shapes: [[[0, 1], [2, ~1], [0, 2]]]
      };

      var exploded = api.cmd.explodeFeatures(lyr, arcs);
      assert.deepEqual(exploded.shapes,
          [[[0, 1]], [[2, ~1]], [[0, 2]]]);

    })

    // rings with holes are not exploded
    it('polygon with hole and null polygon', function() {

      //       e
      //      / \
      //     /   \
      //    /  a  \
      //   /  / \  \
      //  h  d   b  f
      //   \  \ /  /
      //    \  c  /
      //     \   /
      //      \ /
      //       g
      //
      //   abcda, efghe
      //   0,     1

      var coords = [[[3, 4], [4, 3], [3, 2], [2, 3], [3, 4]],
          [[3, 5], [5, 3], [3, 1], [1, 3], [3, 5]]];
      var arcs = new api.internal.ArcCollection(coords);

      var lyr = {
        geometry_type: 'polygon',
        shapes: [null, [[1], [~0]]],
        data: new api.internal.DataTable([{a: "foo"}, {a: "bar"}])
      };

      var exploded = api.cmd.explodeFeatures(lyr, arcs);

      assert.deepEqual(exploded.data.getRecords(), [{a: "foo"}, {a: "bar"}]);
      assert.deepEqual(exploded.shapes, [null, [[1], [~0]]]);

    });
  })
});
