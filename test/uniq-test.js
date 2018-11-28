var assert = require('assert'),
    api = require("../");

describe('mapshaper-uniq.js', function () {

  it ('remove features with duplicate ids', function() {
    var data = new api.internal.DataTable([{foo: 'a'}, {foo: 'b'}, {foo: 'a'}, {foo: 'a'}]),
        shapes = [[[1, 2]], [[3, 4]], [[5, 6]], [[7, 8]]],
        lyr = {data: data, shapes: shapes, geometry_type: 'point'};
    api.uniq(lyr, null, {expression: 'foo'});
    assert.deepEqual(lyr.data.getRecords(), [{foo: 'a'}, {foo: 'b'}]);
    assert.deepEqual(lyr.shapes, [[[1, 2]], [[3, 4]]]);
  })

  it ('-uniq max-count=2', function() {
    var data = new api.internal.DataTable([{foo: 'a'}, {foo: 'b'}, {foo: 'a'}, {foo: 'a'}]),
        shapes = [[[1, 2]], [[3, 4]], [[5, 6]], [[7, 8]]],
        lyr = {data: data, shapes: shapes, geometry_type: 'point'};
    api.uniq(lyr, null, {expression: 'foo', max_count: 2});
    assert.deepEqual(lyr.data.getRecords(), [{foo: 'a'}, {foo: 'b'}, {foo: 'a'}]);
    assert.deepEqual(lyr.shapes, [[[1, 2]], [[3, 4]], [[5, 6]]]);
  })

  it ('-uniq invert', function() {
    var data = new api.internal.DataTable([{foo: 'a', id: 0}, {foo: 'b', id: 1},
      {foo: 'a', id: 2}, {foo: 'a', id: 3}]),
        shapes = [[[1, 2]], [[3, 4]], [[5, 6]], [[7, 8]]],
        lyr = {data: data, shapes: shapes, geometry_type: 'point'};
    api.uniq(lyr, null, {expression: 'foo', invert: true});
    assert.deepEqual(lyr.data.getRecords(), [{foo: 'a', id: 2}, {foo: 'a', id: 3}]);
    assert.deepEqual(lyr.shapes, [[[5, 6]], [[7, 8]]]);
  })

})
