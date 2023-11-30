import api from '../mapshaper.js';
import assert from 'assert';

var internal = api.internal;
var NodeCollection = internal.NodeCollection;

describe('mapshaper-polyline-clipping.js', function () {

  describe('Fig 1', function () {
    //
    //  a --------- b
    //  |           |
    //  |   e - f   |
    //  |       |   |
    //  |   h - g   |
    //  |           |
    //  d --------- c
    //
    var coords = [[[1, 4], [4, 4], [4, 1], [1, 1], [1, 4]],  // abcda
          [[2, 3], [3, 3], [3, 2], [2, 2]]];         // efgh

    var clip = [[[0]]];
    var target = [[[1]]];
    var nodes = new NodeCollection(coords);

    it ("clip enclosed polyline", function() {
      var clipped = internal.clipPolylines(target, clip, nodes, 'clip');
      assert.deepEqual(clipped, [[[1]]]);
    })

    it ("erase enclosed polyline", function() {
      var clipped = internal.clipPolylines(target, clip, nodes, 'erase');
      assert.deepEqual(clipped, [null]);
    })

  });

  describe('Fig 2', function () {
    //
    //      g
    //      |
    //  a - b - c
    //  |   |   |
    //  |   h-- d
    //  |       |
    //  f ----- e --i
    //
    var coords = [[[1, 3], [2, 3]], // ab
          [[2, 3], [3, 3], [3, 2]], // bcd
          [[3, 2], [3, 1]],         // de
          [[3, 1], [1, 1], [1, 3]], // efa
          [[2, 4], [2, 3]],         // gb
          [[2, 3], [2, 2], [3, 2]], // bhe
          [[3, 1], [4, 1]]];        // ei

    var clip = [[[0, 1, 2, 3]]];
    var target = [[[4, 5, 2, 6]]];
    var nodes = new NodeCollection(coords);

    it ("clip partly enclosed polyline", function() {
      var clipped = internal.clipPolylines(target, clip, nodes, 'clip');
      assert.deepEqual(clipped, [[[5, 2]]]);
    })

    it ("erase partly enclosed polyline", function() {
      var clipped = internal.clipPolylines(target, clip, nodes, 'erase');
      assert.deepEqual(clipped, [[[4], [6]]]);
    })

  });

});
