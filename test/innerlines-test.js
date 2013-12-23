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

  var arcs = [[[3, 1, 2], [1, 1, 3]],
      [[2, 3], [3, 1]],
      [[2, 4, 3], [3, 3, 1]]];
  arcs = new api.ArcDataset(arcs);
  var lyr = {
        name: 'shape',
        geometry_type: 'polygon',
        data: new api.data.DataTable([{foo: 'a'}, {foo: 'b'}]),
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
    data: new api.data.DataTable([{foo: 'a', bar: 1}, {foo: 'a', bar: 1},
        {foo: 'b', bar: 2}, {foo: 'b', bar: 3}]),
    shapes: [[[0, 1, 2]], [[3, 4, ~1]], [[~2, 5, 6]], [[~4, 7, ~5]]]
  }
  var arcsb = [[[1, 1, 2], [2, 3, 3]],
      [[2, 2], [3, 2]],
      [[2, 1], [2, 2]],
      [[2, 3, 3], [3, 3, 2]],
      [[3, 2], [2, 2]],
      [[2, 2], [2, 1]],
      [[2, 1, 1], [1, 1, 2]],
      [[3, 3, 2], [2, 1, 1]]];
  arcsb = new api.ArcDataset(arcsb);

  describe('convertLayerToInnerLines()', function () {
    it('test 1', function () {
      var lyr2 = api.convertLayerToInnerLines(lyr, arcs);
      assert.deepEqual(lyr2.shapes, [[[1]]]);
      assert.equal(lyr2.geometry_type, 'polyline');
      assert.equal(lyr2.name, 'shape'); // same as original name
    })

    it('test 2', function () {
      var lyr2 = api.convertLayerToInnerLines(lyrb, arcsb);
      assert.deepEqual(lyr2.shapes,
          [[[1]], [[2]], [[4]], [[5]]]);
      assert.equal(lyr2.geometry_type, 'polyline');
    })

  })

  describe('convertLayerToTypedLines()', function() {
    it( 'test with no field', function() {
      var lyr2 = api.convertLayerToTypedLines(lyr, arcs);
      assert.deepEqual(lyr2.shapes, [[[0]], [[2]], [[1]]]);
      assert.equal(lyr2.geometry_type, 'polyline');
      assert.equal(lyr2.name, 'shape'); // same as original name
      assert.deepEqual(lyr2.data.getRecords(), [{TYPE: 0}, {TYPE: 0}, {TYPE: 1}]);
    })

    it('test 2 with no field', function () {
      var lyr2 = api.convertLayerToTypedLines(lyrb, arcsb);
      assert.deepEqual(lyr2.shapes,
          [[[0]], [[3]], [[6]], [[7]], [[1]], [[2]], [[4]], [[5]]]);
      assert.equal(lyr2.geometry_type, 'polyline');
    })

    it( 'test with one field', function() {
      var lyr2 = api.convertLayerToTypedLines(lyr, arcs, ['foo']);
      assert.deepEqual(lyr2.shapes, [[[0]], [[2]], [[1]]]);
      assert.equal(lyr2.geometry_type, 'polyline');
      assert.equal(lyr2.name, 'shape'); // same as original name
      assert.deepEqual(lyr2.data.getRecords(), [{TYPE: 0}, {TYPE: 0}, {TYPE: 1}]);
    })

    it( 'test 2 with one field', function() {
      var lyr2 = api.convertLayerToTypedLines(lyrb, arcsb, ['foo']);
      assert.deepEqual(lyr2.shapes,
          [[[0]], [[3]], [[6]], [[7]], [[2]], [[4]], [[1]], [[5]]]);
      assert.equal(lyr2.geometry_type, 'polyline');
      assert.deepEqual(lyr2.data.getRecords(),
          [{TYPE: 0}, {TYPE: 0}, {TYPE: 0}, {TYPE: 0},
          {TYPE: 1}, {TYPE: 1}, {TYPE: 2}, {TYPE: 2}]);
    })

    it( 'test with two fields', function() {
      var lyr2 = api.convertLayerToTypedLines(lyrb, arcsb, ['foo', 'bar']);
      assert.deepEqual(lyr2.shapes,
          [[[0]], [[3]], [[6]], [[7]], [[2]], [[4]], [[5]], [[1]]]);
      assert.equal(lyr2.geometry_type, 'polyline');
      assert.deepEqual(lyr2.data.getRecords(),
          [{TYPE: 0}, {TYPE: 0}, {TYPE: 0}, {TYPE: 0},
          {TYPE: 1}, {TYPE: 1}, {TYPE: 2}, {TYPE: 3}]);
    })
  })
})
