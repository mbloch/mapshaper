
import api from '../mapshaper.js';
import assert from 'assert';
import { getBlackiClassifier } from '../src/classification/mapshaper-blacki';
import { DataTable } from '../src/datatable/mapshaper-data-table';

describe('mapshaper-blacki', function() {

  describe('-classify method=blacki', function() {

    it('test1', async function() {
      var data = [{
          foo: ['A']
        }, {
          foo: ['B']
        }, {
          foo: ['A']
        }];

      var cmd = '-i data.json -classify foo method=blacki -filter-fields class -o';
      var out = await api.applyCommands(cmd, {'data.json': data});
      var result = JSON.parse(out['data.json']);
      assert.deepEqual(result, [{class: 0}, {class: 1}, {class: 0}]);

    });

  })

  describe('getBlackiClassifier()', function() {

    it ('test1', function() {
      var lyr = {
        data: new DataTable([{
          foo: ['A']
        }, {
          foo: ['A']
        }, {
          foo: ['B']
        }])
      }
      var func = getBlackiClassifier(lyr, 'foo');
      assert.equal(func(0), 0);
      assert.equal(func(1), 0);
      assert.equal(func(2), 1);
    })

    it ('test2', function() {
      var lyr = {
        data: new DataTable([{
          foo: ['A']
        }, {
          foo: ['B']
        }, {
          foo: ['B', 'A']
        }])
      }
      var func = getBlackiClassifier(lyr, 'foo');
      assert.equal(func(0), 0);
      assert.equal(func(1), 0);
      assert.equal(func(2), 0);
    })

    it ('test3', function() {
      var lyr = {
        data: new DataTable([{
          foo: ['A']
        }, {
          foo: ['B']
        }, {
          foo: ['C']
        }, {
          foo: ['A', 'B']
        }])
      }
      var func = getBlackiClassifier(lyr, 'foo');
      assert.equal(func(0), 0);
      assert.equal(func(1), 0);
      // class ids are now compressed to remove holes in sequence
      // assert.equal(func(2), 2);
      assert.equal(func(2), 1);
      assert.equal(func(3), 0);
    })

    it ('test4', function() {
      var lyr = {
        data: new DataTable([{
          foo: ['A', 'B', 'C']
        }, {
          foo: ['D']
        }, {
          foo: ['C']
        }, {
          foo: ['B', 'E']
        }])
      }
      var func = getBlackiClassifier(lyr, 'foo');
      assert.equal(func(0), 0);
      assert.equal(func(1), 1);
      assert.equal(func(2), 0);
      assert.equal(func(3), 0);
    })

    it ('test5', function() {
      var lyr = {
        data: new DataTable([{
          foo: ['A', 'B', 'C', 'D']
        }, {
          foo: ['D', 'E', 'F', 'G']
        }, {
          foo: ['C', 'H']
        }, {
          foo: ['I', 'J', 'K', 'A']
        }])
      }
      var func = getBlackiClassifier(lyr, 'foo');
      assert.equal(func(0), 0);
      assert.equal(func(1), 0);
      assert.equal(func(2), 0);
      assert.equal(func(3), 0);
    })

    it ('test6', function() {
      var lyr = {
        data: new DataTable([{
          foo: []
        }, {
          foo: null
        }, {
          foo: ['A']
        }, {
          foo: 3
        }, {
          foo: 'B'
        }])
      }
      var func = getBlackiClassifier(lyr, 'foo');
      assert.equal(func(0), -1);
      assert.equal(func(1), -1);
      assert.equal(func(2), 0);
      assert.equal(func(3), -1);
      assert.equal(func(4), -1);
    })

  });

});
