var api = require('../'),
    assert = require('assert'),
    DataTable = api.internal.DataTable;

function stringifyEqual(a, b) {
  assert.equal(JSON.stringify(a), JSON.stringify(b));
}

describe('mapshaper-join.js', function () {
  describe('joinTables()', function () {
    it('one-to-several mapping', function () {
      var table1 = new DataTable([{foo: 5, bar: 'a'}, {foo: 5, bar: 'b'}]),
          table2 = new DataTable([{shmoo: 5, baz: 'pumpkin'}]);
      api.joinTables(table1, 'foo', ['baz'], table2, 'shmoo', ['baz']);
      assert.deepEqual(table1.getRecords(), [{foo: 5, bar: 'a', baz: 'pumpkin'},
            {foo: 5, bar: 'b', baz: 'pumpkin'}]);
    })

    it('missing values are joined as null', function () {
      var table1 = new DataTable([{foo: 5, bar: 'a'}, {foo: 3, bar: 'b'}]),
          table2 = new DataTable([{shmoo: 5, baz: 'pumpkin'}]);

      api.joinTables(table1, 'foo', ['baz'], table2, 'shmoo', ['baz']);
      assert.deepEqual(table1.getRecords(), [{foo: 5, bar: 'a', baz: 'pumpkin'},
            {foo: 3, bar: 'b', baz: null}]);
    })

  })
})