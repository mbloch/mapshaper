var assert = require('assert'),
    api = require("../");

describe('mapshaper-sort.js', function () {

  it ('sort ascending on data field', function() {
    var data = new api.internal.DataTable([{foo: -1}, {foo: 5}, {foo: 4}]),
        lyr = {data: data};
    api.sortFeatures(lyr, null, {expression: 'foo'});
    assert.deepEqual(data.getRecords(), [{foo: -1}, {foo: 4}, {foo: 5}]);
  })

  it ('sort descending on data field', function() {
    var data = new api.internal.DataTable([{foo: -1}, {foo: 5}, {foo: 4}]),
        lyr = {
          data: data,
          geometry_type: 'point',
          shapes: [[[0, 1]], [[2, 2]], [[3, 0]]]
        };
    api.sortFeatures(lyr, null, {expression: 'foo', descending: true});
    assert.deepEqual(data.getRecords(), [{foo: 5}, {foo: 4}, {foo: -1}]);
    assert.deepEqual(lyr.shapes, [[[2, 2]], [[3, 0]], [[0, 1]]]);
  })

  it ('reverse features', function() {
    var data = new api.internal.DataTable([{foo: -1}, {foo: 5}, {foo: 4}]),
        lyr = {
          data: data,
          geometry_type: 'point',
          shapes: [[[0, 1]], [[2, 2]], [[3, 0]]]
        };
    api.sortFeatures(lyr, null, {expression: '$.id', descending: true});
    assert.deepEqual(data.getRecords(), [{foo: 4}, {foo: 5}, {foo: -1}]);
    assert.deepEqual(lyr.shapes, [[[3, 0]], [[2, 2]], [[0, 1]]]);
  })

})
