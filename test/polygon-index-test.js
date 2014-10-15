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

  it ("simple polygon", function() {
    var shape = [[1]];  // outer ring
    var index = new PolygonIndex(shape, arcs);

    assert.equal(index.pointInPolygon(1, 1), 0);
    assert.equal(index.pointInPolygon(3, 1), -1);  // vertex
    assert.equal(index.pointInPolygon(5, 1), 0);
    assert.equal(index.pointInPolygon(5, 5), 0);
    assert.equal(index.pointInPolygon(3, 5), -1);  // vertex
    assert.equal(index.pointInPolygon(1, 3), -1);  // vertex
    assert.equal(index.pointInPolygon(3, 3), 1);
    assert.equal(index.pointInPolygon(4, 3), 1);
    assert.equal(index.pointInPolygon(2, 2), -1);  // on boundary
    assert.equal(index.pointInPolygon(4, 4), -1);  // on boundary
  })

  it ("polygon with hole", function() {
    var shape = [[1], [~0]];
    var index = new PolygonIndex(shape, arcs);

    assert.equal(index.pointInPolygon(3, 3), 0); // inside hole
    assert.equal(index.pointInPolygon(3, 1.5), 1); // inside donut
    assert.equal(index.pointInPolygon(3.1, 1.5), 1); // inside donut
    assert.equal(index.pointInPolygon(2, 3), -1);  // on a hole vertex
  })


})