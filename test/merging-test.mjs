import api from '../mapshaper.js';
import assert from 'assert';

var utils = api.utils,
    ArcCollection = api.internal.ArcCollection;

var arcs1 = [[[1, 0], [2, 1]], [[3, 0], [4, 1]]];

var arcs2 = [[[5, 2], [6, 3], [7, 2], [8, 3]]];

var arcs3 = [[[9, 4], [10, 5]]];

var data1 = {
  arcs: new ArcCollection(arcs1),
  layers: [{
    name: "polys",
    geometry_type: 'polyline',
    shapes: [[[0, 1]]],
    data: new api.internal.DataTable([{id: 1}])
  }]
};

var data2 = {
  arcs: new ArcCollection(arcs2),
  layers: [{
    name: "polys",
    geometry_type: 'polyline',
    shapes: [[[~1]], [[0]]],
    data: new api.internal.DataTable([{id: 2}, {id: 3}])
  }]
};

var data3 = {
  layers: [{
    name: "points",
    geometry_type: 'point',
    shapes: [[[0, 1]]]
  }]
};

var data4 = {
  layers: [{
    name: "points",
    geometry_type: 'point',
    shapes: [null, [[2, 3], [4, 5]]]
  }]
};

describe('mapshaper-merging.js', function () {
  describe('mergeArcs()', function () {
    it('merge three sets of arcs', function () {
      var mergedArcs = api.internal.mergeArcs([
          new ArcCollection(arcs1),
          new ArcCollection(arcs2),
          new ArcCollection(arcs3)
      ]);
      var data = mergedArcs.getVertexData();
      var result = {
        xx: utils.toArray(data.xx),
        yy: utils.toArray(data.yy),
        nn: utils.toArray(data.nn)
      };
      var target = {
        xx: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        yy: [0, 1, 0, 1, 2, 3, 2, 3, 4, 5],
        nn: [2, 2, 4, 2]
      }
      assert.deepEqual(result, target);
    })
  })

  describe('mergeDatasets() + mergeLayers()', function () {
    it('merge two datasets', function () {
      var merged = api.internal.mergeDatasets([data1, data2]);
      merged.layers = api.cmd.mergeLayers(merged.layers, {});
      assert.deepEqual(merged.layers[0].shapes, [[[0, 1]], [[~3]], [[2]]]);
      assert.deepEqual(merged.layers[0].data.getRecords(), [{id: 1}, {id: 2}, {id: 3}]);
    })
  })
})
