var api = require('../'),
    assert = require('assert'),
    DataTable = api.internal.DataTable;

function stringifyEqual(a, b) {
  assert.equal(JSON.stringify(a), JSON.stringify(b));
}

function fixPath(p) {
  return require('path').join(__dirname, p);
}

describe('mapshaper-join.js', function () {

  describe('-join command', function () {
    it('test1', function (done) {
      var shp = "test/test_data/two_states.shp";
      var csv = "test/test_data/text/states.csv";
      var cmd = api.utils.format("-i %s -join %s keys=FIPS,STATE_FIPS fields=POP2010,SUB_REGION field-types=STATE_FIPS:str", shp, csv),
          target = [{"STATE_NAME":"Oregon","FIPS":"41","STATE":"OR","LAT":43.94,"LONG":-120.55,"POP2010":3831074,"SUB_REGION":"Pacific"},
          {"STATE_NAME":"Washington","FIPS":"53","STATE":"WA","LAT":47.38,"LONG":-120.00,"POP2010":6724540,"SUB_REGION":"Pacific"}];
      api.internal.testCommands(cmd, function(err, data) {
        if (err) throw err;
        assert.deepEqual(data.layers[0].data.getRecords(), target);
        done();
      });
    })

    it('join layers from two separately loaded datasets', function(done) {
      var shp = "test/test_data/two_states.shp";
      var csv = "test/test_data/text/states.csv";
      var cmd = api.utils.format("-i %s -i %s field-types=STATE_FIPS:str -join target=two_states states keys=FIPS,STATE_FIPS fields=POP2010,SUB_REGION ", shp, csv);
      var target = [{"STATE_NAME":"Oregon","FIPS":"41","STATE":"OR","LAT":43.94,"LONG":-120.55,"POP2010":3831074,"SUB_REGION":"Pacific"},
          {"STATE_NAME":"Washington","FIPS":"53","STATE":"WA","LAT":47.38,"LONG":-120.00,"POP2010":6724540,"SUB_REGION":"Pacific"}];
      api.internal.testCommands(cmd, function(err, data) {
        if (err) throw err;
        var records = data.layers[0].data.getRecords();
        assert.deepEqual(records, target);
        done();
      });

    })

    it('test "-join force" option, topojson input', function(done) {
      var src = {
        type: "Topology",
        objects: {
          a: {
            type: "GeometryCollection",
            geometries: [{type: null, properties: {foo: 'a', bar: "old"}},
              {type: null, properties: {foo: 'b', bar: 'old'}}]
          },
          b: {
            type: "GeometryCollection",
            geometries: [{type: null, properties: {fooz: 'a', bar: "new", baz: 'new'}}]
          }
        }
      };
      var cmd = "-join b target=a keys=foo,fooz force";
      api.applyCommands(cmd, src, function(err, data) {
        var output = JSON.parse(data);
        // source hasn't changed
        // v0.4 - only one layer is output by default
        // assert.deepEqual(output.objects.b, src.objects.b);
        // dest value has been overwritten
        assert.deepEqual(output.objects.a.geometries,
          [{type: null, properties: {foo: 'a', bar: "new", baz: "new"}},
            {type: null, properties: {foo: 'b', bar: 'old', baz: null}}]);
        done();
      });
    })

    it('test "unmatched" and "unjoined" flags', function(done) {
      var src = {
        type: "Topology",
        objects: {
          a: {
            type: "GeometryCollection",
            geometries: [{type: null, properties: {foo: 'a'}},
              {type: null, properties: {foo: 'b'}},
              {type: null, properties: {foo: 'a'}}
            ]
          },
          b: {
            type: "GeometryCollection",
            geometries: [
              {type: null, properties: {fooz: 'b', bar: "beta"}},
              {type: null, properties: {fooz: 'c', bar: "gamma"}},
            ]
          }
        }
      };
      var cmd = "-join b unjoined unmatched target=a keys=foo,fooz -o target=unjoined,unmatched";
      api.applyCommands(cmd, src, function(err, data) {
        var output = JSON.parse(data);
        assert.deepEqual(output.objects.unjoined.geometries,
          [{type: null, properties: {fooz: 'c', bar: 'gamma'}}])
        assert.deepEqual(output.objects.unmatched.geometries,
          [{type: null, properties: {foo: 'a'}}, {type: null, properties: {foo: 'a'}}])
        done();
      })
    })
  })

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

    it('Issue #67 -- join shouldn\'t convert 0 values to null', function () {
      var targetRecords = [{key1: 1}, {key1: 0}];
      var sourceRecords = [{key2: 1, foo: 0}, {key2: 0, foo: 1}];
      var lyr = {
        geometry_type: null,
        data: new api.internal.DataTable(targetRecords)
      };
      var opts = {
        keys: ["key1", "key2"]
      };
      api.joinAttributesToFeatures(lyr, new api.internal.DataTable(sourceRecords), opts);
      assert.deepEqual(lyr.data.getRecords(),
          [{ key1: 1, foo: 0}, { key1: 0, foo: 1 }]);
    })

    it('Missing values in source table are converted to null', function () {
      var targetRecords = [{key1: 1}, {key1: 0}];
      var sourceRecords = [{key2: 1, foo: 0}, {key2: 0}];
      var lyr = {
        geometry_type: null,
        data: new api.internal.DataTable(targetRecords)
      };
      var opts = {
        keys: ["key1", "key2"]
      };
      api.joinAttributesToFeatures(lyr, new api.internal.DataTable(sourceRecords), opts);
      assert.deepEqual(lyr.data.getRecords(),
          [{ key1: 1, foo: 0}, { key1: 0, foo: null }]);
    })

    //
    it('Should be unaffected by non-data properties of Object', function () {
      var targetRecords = [{key1: 'a'}, {key1: 'b'}];
      var sourceRecords = [{key2: 'a', 'constructor': 'c', 'hasOwnProperty': 'd'}, {key2: 'b'}];
      var sourceTable = new api.internal.DataTable(sourceRecords);
      var lyr = {
        geometry_type: null,
        data: new api.internal.DataTable(targetRecords)
      };
      var opts = {
        keys: ["key1", "key2"]
      };
      api.joinAttributesToFeatures(lyr, sourceTable, opts);
      assert.deepEqual(lyr.data.getRecords(),
          [{ key1: 'a', 'constructor': 'c', 'hasOwnProperty': 'd'}, { key1: 'b', 'constructor': null, 'hasOwnProperty': null }]);
    })

    it('one-to-several mapping', function () {
      var table1 = new DataTable([{foo: 5, bar: 'a'}, {foo: 5, bar: 'b'}]),
          table2 = new DataTable([{shmoo: 5, baz: 'pumpkin'}]);
      var target = {
        data: table1
      };
      var opts = {
        keys: ['foo', 'shmoo'],
        fields: ['baz']
      };
      api.joinAttributesToFeatures(target, table2, opts);
      assert.deepEqual(table1.getRecords(), [{foo: 5, bar: 'a', baz: 'pumpkin'},
            {foo: 5, bar: 'b', baz: 'pumpkin'}]);
    })

    it('missing values are joined as null', function () {
      var table1 = new DataTable([{foo: 5, bar: 'a'}, {foo: 3, bar: 'b'}]),
          table2 = new DataTable([{shmoo: 5, baz: 'pumpkin'}]);
      var target = {data: table1};
      var opts = {
        keys: ['foo', 'shmoo'],
        fields: ['baz']
      };
      api.joinAttributesToFeatures(target, table2, opts);
      assert.deepEqual(table1.getRecords(), [{foo: 5, bar: 'a', baz: 'pumpkin'},
            {foo: 3, bar: 'b', baz: null}]);
    })

  })

  /*
  describe('importJoinTable()', function() {
    it('should not adjust types of dbf table fields', function() {
      var opts = {
        keys: ['STFIPS', 'FIPS']
      };
      var table = api.importJoinTable(fixPath("test_data/two_states.dbf"), opts);
      assert.strictEqual(table.getRecords()[0].FIPS, '41')
    })

    it('should adjust types of csv table fields', function() {
      var opts = {
        keys: ['STFIPS', 'FIPS']
      };
      var table = api.importJoinTable(fixPath("test_data/text/two_states.csv"), opts);
      assert.strictEqual(table.getRecords()[0].FIPS, 41)
    })

    it('should accept type hints for csv table fields', function() {
      var opts = {
        fields: ['LAT:str'],
        keys: ['STFIPS', 'FIPS:str']
      };
      var table = api.importJoinTable(fixPath("test_data/text/two_states.csv"), opts);
      assert.strictEqual(table.getRecords()[0].FIPS, '41')
      assert.strictEqual(table.getRecords()[0].LAT, '43.94')
    })

    it('should accept type hints for csv table fields (2)', function() {
      var opts = {
        fields: ['LAT'],
        keys: ['STFIPS', 'FIPS'],
        field_types: ['LAT:str', 'FIPS:str']
      };
      var table = api.importJoinTable(fixPath("test_data/text/two_states.csv"), opts);
      assert.strictEqual(table.getRecords()[0].FIPS, '41')
      assert.strictEqual(table.getRecords()[0].LAT, '43.94')
    })
  })
  */

  describe('getCountFieldName', function () {
    it('avoid collisions with other fields', function () {
      var fields = ['joins', 'joins_1', 'joins_2'];
      assert.equal(api.internal.getCountFieldName(fields), 'joins_3')
    })
  })

  describe('updateUnmatchedRecord()', function () {
    it('should init fields to null / empty', function () {
      var rec = {};
      api.internal.updateUnmatchedRecord(rec, ['foo'], ['tally'])
      assert.deepEqual(rec, {foo: null, tally: 0});
    })

    it('should preserve pre-existing data', function () {
      var rec = {foo: 'a', tally: 5};
      api.internal.updateUnmatchedRecord(rec, ['foo', 'bar'], ['tally'])
      assert.deepEqual(rec, {foo: 'a', tally: 5, bar: null});
    })
  })

})
