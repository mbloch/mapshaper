import assert from 'assert';
import api from '../mapshaper.js';


describe('mapshaper-sort.js', function () {
  it ('sort is stable across multiple calls', function(done) {
    var csv = 'name,rank\nbeta,0\nzeta,1\nalpha,0\ngamma,1\ndelta,1\ntheta,0';
    var target = 'name,rank\ndelta,1\ngamma,1\nzeta,1\nalpha,0\nbeta,0\ntheta,0';
    api.applyCommands('in.csv -sort name -sort rank descending -o out.csv', {'in.csv': csv}, function(err, output) {
      assert.equal(output['out.csv'], target);
      done();
    })
  })

  it ('sort ascending on data field', function() {
    var data = new api.internal.DataTable([{foo: -1}, {foo: 5}, {foo: 4}]),
        lyr = {data: data};
    api.cmd.sortFeatures(lyr, null, {expression: 'foo'});
    assert.deepEqual(data.getRecords(), [{foo: -1}, {foo: 4}, {foo: 5}]);
  })

  it ('sort descending on data field', function() {
    var data = new api.internal.DataTable([{foo: -1}, {foo: 5}, {foo: 4}]),
        lyr = {
          data: data,
          geometry_type: 'point',
          shapes: [[[0, 1]], [[2, 2]], [[3, 0]]]
        };
    api.cmd.sortFeatures(lyr, null, {expression: 'foo', descending: true});
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
    api.cmd.sortFeatures(lyr, null, {expression: '$.id', descending: true});
    assert.deepEqual(data.getRecords(), [{foo: 4}, {foo: 5}, {foo: -1}]);
    assert.deepEqual(lyr.shapes, [[[3, 0]], [[2, 2]], [[0, 1]]]);
  })

})
