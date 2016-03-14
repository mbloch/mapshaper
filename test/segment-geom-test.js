var api = require('../'),
    assert = require('assert'),
    ArcCollection = api.internal.ArcCollection;

describe('mapshaper-segment-geom.js', function () {

  it('getAvgSegment2() works', function() {
    var coords = [[[1, 1], [2, 3], [3, 1], [1, 1]]],
        arcs = new ArcCollection(coords),
        xy = api.internal.getAvgSegment2(arcs);
    assert.deepEqual([4/3, 4/3], xy);

    var coords2 = [[[3, 1], [1, 1], [2, 3]], [[2, 3], [3, 1]], [[2, 3], [4, 3], [3, 1]]],
        arcs2 = new ArcCollection(coords2),
        xy2 = api.internal.getAvgSegment2(arcs2);
    assert.deepEqual([7/5, 6/5], xy2);
  })
})
