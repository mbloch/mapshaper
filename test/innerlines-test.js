var assert = require('assert'),
    api = require("../");

describe('mapshaper-innerlines.js', function () {
  //
  //      b --- d
  //     / \   /
  //    /   \ /
  //   a --- c
  //
  //   cab, bc,   bdc
  //   0,   1/-2, 2

  var arcs = [[[3, 1], [1, 1], [2, 3]],
      [[2, 3], [3, 1]],
      [[2, 3], [4, 3], [3, 1]]];
  arcs = new api.internal.ArcCollection(arcs);
  var lyr = {
        name: 'shape',
        geometry_type: 'polygon',
        data: new api.internal.DataTable([{foo: 'a'}, {foo: 'b'}]),
        shapes: [[[0, 1]], [[-2, 2]]]
      };

  //  a -- b -- c
  //  |    |    |
  //  d -- e -- f
  //  |    |    |
  //  g -- h -- i
  //
  // dab, be, ed, bcf, fe, eh, hgd, fih
  // 0,   1,  2,  3,   4,  5,  6,   7
  //
  var lyrb = {
    geometry_type: 'polygon',
    data: new api.internal.DataTable([{foo: 'a', bar: 1}, {foo: 'a', bar: 1},
        {foo: 'b', bar: 2}, {foo: 'b', bar: 3}]),
    shapes: [[[0, 1, 2]], [[3, 4, ~1]], [[~2, 5, 6]], [[~4, 7, ~5]]]
  }
  var arcsb = [[[1, 2], [1, 3], [2, 3]],
      [[2, 3], [2, 2]],
      [[2, 2], [1, 2]],
      [[2, 3], [3, 3], [3, 2]],
      [[3, 2], [2, 2]],
      [[2, 2], [2, 1]],
      [[2, 1], [1, 1], [1, 2]],
      [[3, 2], [3, 1], [2, 1]]];
  arcsb = new api.internal.ArcCollection(arcsb);

  describe('convertPolygonsToInnerLines()', function () {
    it('test 1', function () {
      var lyr2 = api.convertPolygonsToInnerLines(lyr, arcs);
      assert.deepEqual(lyr2.shapes, [[[1]]]);
      assert.equal(lyr2.geometry_type, 'polyline');
      assert.equal(lyr2.name, 'shape'); // same as original name
    })

    it('test 2', function () {
      var lyr2 = api.convertPolygonsToInnerLines(lyrb, arcsb);
      assert.deepEqual(lyr2.shapes,
          [[[1]], [[2]], [[4]], [[5]]]);
      assert.equal(lyr2.geometry_type, 'polyline');
    })

  })

  describe('convertPolygonsToTypedLines()', function() {
    it( 'test with no field', function() {
      var lyr2 = api.convertPolygonsToTypedLines(lyr, arcs);
      assert.deepEqual(lyr2.shapes, [[[1]], [[0]], [[2]]]);
      assert.equal(lyr2.geometry_type, 'polyline');
      assert.equal(lyr2.name, 'shape'); // same as original name
      assert.deepEqual(lyr2.data.getRecords(), [{TYPE: 1}, {TYPE: 0}, {TYPE: 0}]);
    })

    it('test 2 with no field', function () {
      var lyr2 = api.convertPolygonsToTypedLines(lyrb, arcsb);
      assert.deepEqual(lyr2.shapes,
          [[[1]], [[2]], [[4]], [[5]], [[0]], [[3]], [[6]], [[7]]]);
      assert.equal(lyr2.geometry_type, 'polyline');
    })

    it( 'test with one field', function() {
      var lyr2 = api.convertPolygonsToTypedLines(lyr, arcs, ['foo']);
      assert.deepEqual(lyr2.shapes, [[[1]], [[0]], [[2]]]);
      assert.equal(lyr2.geometry_type, 'polyline');
      assert.equal(lyr2.name, 'shape'); // same as original name
      assert.deepEqual(lyr2.data.getRecords(), [{TYPE: 1}, {TYPE: 0}, {TYPE: 0}]);
    })

    it( 'test 2 with one field', function() {
      var lyr2 = api.convertPolygonsToTypedLines(lyrb, arcsb, ['foo']);
      assert.deepEqual(lyr2.shapes,
          [[[1]], [[5]], [[2]], [[4]], [[0]], [[3]], [[6]], [[7]]]);
      assert.equal(lyr2.geometry_type, 'polyline');
      assert.deepEqual(lyr2.data.getRecords(),
          [{TYPE: 2}, {TYPE: 2}, {TYPE: 1}, {TYPE: 1}, {TYPE: 0}, {TYPE: 0}, {TYPE: 0}, {TYPE: 0}]);
    })

    it( 'test with two fields', function() {
      var lyr2 = api.convertPolygonsToTypedLines(lyrb, arcsb, ['foo', 'bar']);
      assert.deepEqual(lyr2.shapes,
          [[[1]], [[5]], [[2]], [[4]], [[0]], [[3]], [[6]], [[7]]]);
      assert.equal(lyr2.geometry_type, 'polyline');
      assert.deepEqual(lyr2.data.getRecords(),
          [{TYPE: 3}, {TYPE: 2}, {TYPE: 1}, {TYPE: 1}, {TYPE: 0}, {TYPE: 0}, {TYPE: 0}, {TYPE: 0}]);
    })
  })
})
