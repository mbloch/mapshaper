var api = require('../'),
    assert = require('assert'),
    DataTable = api.internal.DataTable;

function stringifyEqual(a, b) {
  assert.equal(JSON.stringify(a), JSON.stringify(b));
}

describe('mapshaper-join.js', function () {
  describe('joinAttributesToFeatures()', function () {
    it('apply filter expression', function () {
      var targetRecords = [{STATE: 'CA'}, {STATE: "NV"}];
      var sourceRecords = [
        {ST: 'CA', YEAR: '2000', CASES: 32},
        {ST: 'CA', YEAR: '2005', CASES: 12},
        {ST: 'CA', YEAR: '2010', CASES: 3},
        {ST: 'NV', YEAR: '2000', CASES: 2},
        {ST: 'NV', YEAR: '2005', CASES: 54},
        {ST: 'NV', YEAR: '2010', CASES: 0}
      ];
      var lyr = {
        geometry_type: null,
        data: new api.internal.DataTable(targetRecords)
      };
      var opts = {
        where: "YEAR=='2005'",
        fields: ["CASES"],
        keys: ["STATE", "ST"]
      };
      api.joinAttributesToFeatures(lyr, new api.internal.DataTable(sourceRecords), opts);
      assert.deepEqual(lyr.data.getRecords(),
          [{ STATE: "CA", CASES: 12}, {STATE: "NV", CASES: 54}]);
    })
  })


  describe('joinTables()', function () {
    it('one-to-several mapping', function () {
      var table1 = new DataTable([{foo: 5, bar: 'a'}, {foo: 5, bar: 'b'}]),
          table2 = new DataTable([{shmoo: 5, baz: 'pumpkin'}]);
      api.internal.joinTables(table1, 'foo', ['baz'], table2, 'shmoo', ['baz']);
      assert.deepEqual(table1.getRecords(), [{foo: 5, bar: 'a', baz: 'pumpkin'},
            {foo: 5, bar: 'b', baz: 'pumpkin'}]);
    })

    it('missing values are joined as null', function () {
      var table1 = new DataTable([{foo: 5, bar: 'a'}, {foo: 3, bar: 'b'}]),
          table2 = new DataTable([{shmoo: 5, baz: 'pumpkin'}]);

      api.internal.joinTables(table1, 'foo', ['baz'], table2, 'shmoo', ['baz']);
      assert.deepEqual(table1.getRecords(), [{foo: 5, bar: 'a', baz: 'pumpkin'},
            {foo: 3, bar: 'b', baz: null}]);
    })

  })
})