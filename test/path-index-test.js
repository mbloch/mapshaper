var api = require('../'),
    assert = require('assert'),
    ArcCollection = api.internal.ArcCollection;

describe('mapshaper-path-index.js', function () {

  describe('Fig. 1', function () {

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
    var arcs = new ArcCollection(coords),
        lyr1 = {
          shapes: [[[0]]]
        },
        lyr2 = {
          shapes: [[[1]]]
        };

    it('#pathIsEnclosed()', function () {
      var index = new api.internal.PathIndex(lyr1.shapes, arcs);
      assert.equal(index.pathIsEnclosed([1]), false)
    })

    it('#findEnclosedPaths()', function () {
      var index = new api.internal.PathIndex(lyr1.shapes, arcs);
      assert.deepEqual(index.findEnclosedPaths([1]), [[0]]);
    })


    it('#pathIsEnclosed() test 2', function () {
      var index = new api.internal.PathIndex(lyr2.shapes, arcs);
      assert.equal(index.pathIsEnclosed([0]), true)
    })

    it('#findEnclosedPaths() test 2', function () {
      var index = new api.internal.PathIndex(lyr2.shapes, arcs);
      assert.deepEqual(index.findEnclosedPaths([0]), null);
    })

  })


});