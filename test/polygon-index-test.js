var assert = require('assert'),
    api = require("../"),
    PolygonIndex = api.internal.PolygonIndex;

describe('mapshaper-polygon-index.js', function () {

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

  it ("handles simple negative tests", function() {
    return;
    var shape = [[1]];
    var index = new PolygonIndex(shape, arcs);

    assert.equal(index.pointInPolygon(1, 1), false);
    assert.equal(index.pointInPolygon(3, 1), false);
    assert.equal(index.pointInPolygon(5, 1), false);
    assert.equal(index.pointInPolygon(5, 5), false);
    assert.equal(index.pointInPolygon(3, 5), false);
    assert.equal(index.pointInPolygon(1, 3), false);
    assert.equal(index.pointInPolygon(3, 3), true);
    assert.equal(index.pointInPolygon(4, 3), true);
    assert.equal(index.pointInPolygon(1.5, 1.5), false);
    assert.equal(index.pointInPolygon(4.5, 1.5), false);
  })

  it ("handles polygon with hole", function() {
    var shape = [[1], [~0]];
    var index = new PolygonIndex(shape, arcs);

    assert.equal(index.pointInPolygon(3, 3), false);
    assert.equal(index.pointInPolygon(3, 1.5), true);
    assert.equal(index.pointInPolygon(3.1, 1.5), true);
    assert.equal(index.pointInPolygon(2, 3), false);
  })


})