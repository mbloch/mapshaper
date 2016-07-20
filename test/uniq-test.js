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
})
