import api from '../mapshaper.js';
import assert from 'assert';
import { fixPath } from './helpers';
import path from 'path';
var DataTable = api.internal.DataTable;

function stringifyEqual(a, b) {
  assert.equal(JSON.stringify(a), JSON.stringify(b));
}


describe('mapshaper-join.js', function () {

  describe('-join command', function () {

    it('self join works with calc= expressions', async function() {
      var data = 'type\na\nb\na\nb\nb';
      var cmd = 'data.csv -join data keys=type,type calc="n = count()" -o';
      var out = await api.applyCommands(cmd, {'data.csv': data});
      assert.equal(out['data.csv'], 'type,n\na,2\nb,3\na,2\nb,3\nb,3');
    })

    it('join two tables with duplication flag', function(done) {
      var a = 'id,name\n1,foo';
      var b = 'key,score\n1,100\n1,200\n1,300';
      api.applyCommands('a.csv -join b.csv duplication keys=id,key fields=score -o', {'a.csv': a, 'b.csv': b}, function(err, out) {
        assert.deepEqual(out['a.csv'], 'id,name,score\n1,foo,100\n1,foo,200\n1,foo,300');
        done();
      });
    })

    it('join data to points layer with duplication flag', function(done) {
      var a = 'id,name,lng,lat\n1,foo,10,10';
      var b = 'key,score\n1,100\n1,200\n1,300';
      api.applyCommands('a.csv -points -join b.csv duplication keys=id,key fields=score -o format=geojson', {'a.csv': a, 'b.csv': b}, function(err, out) {
        const target = {
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            properties: {id: 1, name: 'foo', lng: 10, lat: 10, score: 100},
            geometry: {
              type: 'Point',
              coordinates: [10, 10]
            }
          }, {
           type: 'Feature',
            properties: {id: 1, name: 'foo', lng: 10, lat: 10, score: 200},
            geometry: {
              type: 'Point',
              coordinates: [10, 10]
            }
          }, {
           type: 'Feature',
            properties: {id: 1, name: 'foo', lng: 10, lat: 10, score: 300},
            geometry: {
              type: 'Point',
              coordinates: [10, 10]
            }
          }]
        }
        assert.deepEqual(JSON.parse(out['a.json']), target);
        done();
      });
    })

    it('add error msg when joining to a layer without attributes', function(done) {
      var targ = {
        type: 'Point',
        coordinates: [0, 0]
      };
      var data = [{id: 'foo'}];
      var cmd = '-i point.json -join data.json keys=id,id -o';
      api.applyCommands(cmd, {'point.json': targ, 'data.json': data}, function(err, out) {
        assert.equal(err.name, 'UserError');
        assert(err.message.includes('missing an attribute table'));
        done();
      })

    });

    it('includes source key with fields=* option', function(done) {
      var a = 'id,name\n1,foo';
      var b = 'key,score\n1,100';
      api.applyCommands('a.csv -join b.csv keys=id,key fields=* -o', {'a.csv': a, 'b.csv': b}, function(err, out) {
        assert.deepEqual(out['a.csv'], 'id,name,key,score\n1,foo,1,100');
        done();
      });
    });

    it('don\'t throw an error if external table is empty', function(done) {
      var a = 'id,name\n1,foo';
      var b = 'key,score';
      api.applyCommands('a.csv -join b.csv keys=id,key fields=* -o', {'a.csv': a, 'b.csv': b}, function(err, out) {
        assert.deepEqual(out['a.csv'], 'id,name\n1,foo');
        done();
      });

    });

    it('error if source and target key fields have different types', function(done) {
      var a = 'id,name\n1,foo';
      var b = 'key,score\n1,100';
      api.applyCommands('a.csv string-fields=id -join b.csv keys=id,key fields=* -o', {'a.csv': a, 'b.csv': b}, function(err, out) {
        assert(err.message.indexOf('string and number') > -1);
        done();
      });
    })

    it('error if source key field has null values', function(done) {
      var a = [{id: null, name: 'foo'}];
      var b = [{key: 1, score: 100}];
      api.applyCommands('a.json -join b.json keys=id,key fields=* -o', {'a.json': a, 'b.json': b}, function(err, out) {
        assert(err.message.indexOf('unsupported data type') > -1);
        done();
      });
    })

    it('error if target key field has null values', function(done) {
      var a = [{id: 1, name: 'foo'}];
      var b = [{key: null, score: 100}];
      api.applyCommands('a.json -join b.json keys=id,key fields=* -o', {'a.json': a, 'b.json': b}, function(err, out) {
        assert(err.message.indexOf('unsupported data type') > -1);
        done();
      });
    })

    it('excludes source key by default', function(done) {
      var a = 'id\n1';
      var b = 'key,score\n1,100';
      api.applyCommands('a.csv -join b.csv keys=id,key -o', {'a.csv': a, 'b.csv': b}, function(err, out) {
        assert.deepEqual(out['a.csv'], 'id,score\n1,100');
        done();
      });
    });

    it('prefix= option adds prefix to external fields', function(done) {
      var a = 'id\n1';
      var b = 'key,score\n1,100';
      api.applyCommands('a.csv -join b.csv keys=id,key prefix="b-" -o', {'a.csv': a, 'b.csv': b}, function(err, out) {
        assert.deepEqual(out['a.csv'], 'id,b-score\n1,100');
        done();
      });
    });

    it('prefix= option prevents conflicts', function(done) {
      var a = 'id,foo\n1,50';
      var b = 'key,foo\n1,100';
      api.applyCommands('a.csv -join b.csv keys=id,key prefix="b-" -o', {'a.csv': a, 'b.csv': b}, function(err, out) {
        assert.deepEqual(out['a.csv'], 'id,foo,b-foo\n1,50,100');
        done();
      });
    });

    it('calc assignments add values to unmatched records', function(done) {
      var a = 'id\n1\n2';
      var b = 'id\n1';
      api.applyCommands('a.csv -join b.csv keys=id,id calc="JOINS=count(), AVG=average(id)" -o format=json', {'a.csv': a, 'b.csv': b}, function(err, out) {
        var json = JSON.parse(out['a.json']);
        assert.deepEqual(json, [{id: 1, JOINS: 1, AVG: 1}, {id: 2, JOINS: 0, AVG: null}]);
        done();
      });
    });

    it('calc() assignments supersede fields= assignments', function(done) {
      var a = 'id\n1\n2';
      var b = 'id,COUNT\n1,45\n1,35';
      api.applyCommands('a.csv -join b.csv keys=id,id calc="COUNT=count()" fields=COUNT -o format=json', {'a.csv': a, 'b.csv': b}, function(err, out) {
        var json = JSON.parse(out['a.json']);
        assert.deepEqual(json, [{id: 1, COUNT: 2}, {id: 2, COUNT: 0}]);
        done();
      });
    });

    it('fields= option with an empty list copies no fields', function(done) {
      var a = 'id\n1';
      var b = 'id,PARTIAL,TOTAL\n1,4,35';
      api.applyCommands('a.csv -join b.csv keys=id,id calc="COUNT=count()" fields= -o format=json', {'a.csv': a, 'b.csv': b}, function(err, out) {
        var json = JSON.parse(out['a.json']);
        assert.deepEqual(json, [{id: 1, COUNT: 1}]);
        done();
      });
    });

    it('calc= functions can use the same field as input and output', function(done) {
      var a = 'id\n1';
      var b = 'id,COUNT\n1,4\n1,3';
      api.applyCommands('a.csv -join b.csv keys=id,id calc="COUNT=sum(COUNT)" -o format=json', {'a.csv': a, 'b.csv': b}, function(err, out) {
        var json = JSON.parse(out['a.json']);
        assert.deepEqual(json, [{id: 1, COUNT: 7}]);
        done();
      });
    });

    it('test1, with field-types= option', function (done) {
      var shp = "test/data/two_states.shp";
      var csv = "test/data/text/states.csv";
      var cmd = api.utils.format("-i %s -join %s keys=FIPS,STATE_FIPS fields=POP2010,SUB_REGION field-types=STATE_FIPS:str", shp, csv),
          target = [{"STATE_NAME":"Oregon","FIPS":"41","STATE":"OR","LAT":43.94,"LONG":-120.55,"POP2010":3831074,"SUB_REGION":"Pacific"},
          {"STATE_NAME":"Washington","FIPS":"53","STATE":"WA","LAT":47.38,"LONG":-120.00,"POP2010":6724540,"SUB_REGION":"Pacific"}];
      api.internal.testCommands(cmd, function(err, data) {
        if (err) throw err;
        assert.deepEqual(data.layers[0].data.getRecords(), target);
        done();
      });
    })

    it('test2, with string-fields= option', function (done) {
      var shp = "test/data/two_states.shp";
      var csv = "test/data/text/states.csv";
      var cmd = api.utils.format("-i %s -join %s keys=FIPS,STATE_FIPS fields=POP2010,SUB_REGION string-fields=STATE_FIPS,POP2010", shp, csv),
          target = [{"STATE_NAME":"Oregon","FIPS":"41","STATE":"OR","LAT":43.94,"LONG":-120.55,"POP2010":"3831074","SUB_REGION":"Pacific"},
          {"STATE_NAME":"Washington","FIPS":"53","STATE":"WA","LAT":47.38,"LONG":-120.00,"POP2010":"6724540","SUB_REGION":"Pacific"}];
      api.internal.testCommands(cmd, function(err, data) {
        if (err) throw err;
        assert.deepEqual(data.layers[0].data.getRecords(), target);
        done();
      });
    })

    it('join layers from two separately loaded datasets', function(done) {
      var shp = "test/data/two_states.shp";
      var csv = "test/data/text/states.csv";
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
      api.internal.joinAttributesToFeatures(lyr, new api.internal.DataTable(sourceRecords), opts);
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
      api.internal.joinAttributesToFeatures(lyr, new api.internal.DataTable(sourceRecords), opts);
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
      api.internal.joinAttributesToFeatures(lyr, new api.internal.DataTable(sourceRecords), opts);
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
      api.internal.joinAttributesToFeatures(lyr, sourceTable, opts);
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
      api.internal.joinAttributesToFeatures(target, table2, opts);
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
      api.internal.joinAttributesToFeatures(target, table2, opts);
      assert.deepEqual(table1.getRecords(), [{foo: 5, bar: 'a', baz: 'pumpkin'},
            {foo: 3, bar: 'b', baz: null}]);
    })

  })

  /*
  describe('getCountFieldName', function () {
    it('avoid collisions with other fields', function () {
      var fields = ['joins', 'joins_1', 'joins_2'];
      assert.equal(api.internal.getCountFieldName(fields), 'joins_3')
    })
  })
  */

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

  describe('findCollisionFields()', function() {
    var src = {foo: null, bar: 'a', baz: 0},
        dest = {foo: 1, bar: undefined, baz: 0},
        fields = [];
    api.internal.findCollisionFields(dest, src, ['foo', 'bar', 'baz'], fields);
    assert.deepEqual(fields, ['foo', 'bar']);

  });

  describe('getFieldsToJoin()', function () {
    it('Use fields option, if present', function () {
      var fields = api.internal.getFieldsToJoin([], ['st', 'co'], {fields: ['st']})
      assert.deepEqual(fields, ['st']);
    })

    it('Use all fields, if fields option contains "*"', function () {
      var fields = api.internal.getFieldsToJoin([], ['st', 'co'], {fields: ['*']})
      assert.deepEqual(fields, ['st', 'co']);
    })

    it('Use all fields, if fields option is missing', function () {
      var fields = api.internal.getFieldsToJoin([], ['st', 'co'], {})
      assert.deepEqual(fields, ['st', 'co']);
    })

    it('Exclude source key, if fields option is missing', function () {
      var fields = api.internal.getFieldsToJoin([], ['st', 'co'], {keys: ['id', 'st']})
      assert.deepEqual(fields, ['co']);
    })

    it('Include source key, if fields option in "*"', function () {
      var fields = api.internal.getFieldsToJoin([], ['st', 'co'], {fields: ['*'], keys: ['id', 'st']})
      assert.deepEqual(fields, ['st','co']);
    })

    it('Do not join fields that are already present in dest table', function () {
      var fields = api.internal.getFieldsToJoin(['st'], ['st', 'co'], {})
      assert.deepEqual(fields, ['co']);
    })

    it('Join fields that are already present in dest table if the "force" option is present', function () {
      var fields = api.internal.getFieldsToJoin(['st'], ['st', 'co'], {force: true})
      assert.deepEqual(fields, ['st', 'co']);
    })

    // Original behavior: copy all fields even if calc= is present (for consistency)
    // v0.5.59: don't copy fields by default when calc= is present
    //
    it('Do not copy all fields by default if calc= option is present', function () {
      var fields = api.internal.getFieldsToJoin([], ['st', 'co'], {calc: 'n=count()'})
      assert.deepEqual(fields, []);
    })

    it('Error if type hints are present', function() {
      assert.throws(function() {
        var fields = api.internal.getFieldsToJoin([], ['st', 'co'], {fields: ['st:str']})
      })
    })

  })

})
