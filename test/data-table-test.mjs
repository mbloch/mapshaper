import api from '../mapshaper.js';
import assert from 'assert';
import path from 'path';
import helpers from './helpers';

var Utils = api.utils,
    DataTable = api.internal.DataTable;

describe('data-table.js', function () {

  describe('DataTable', function() {
    var data1;

    beforeEach(function() {
      data1 = [{'foo': 'goat', 'bar': 22}, {'foo': 'cat', 'bar': 0}];
    })

    describe("constructor", function() {
      it('initialize empty table', function() {
        var table = new DataTable();
        assert.deepEqual(table.getRecords(), []);
        assert.equal(table.size(), 0);
      })

      it('initialize n empty records', function() {
        var table = new DataTable(1);
        assert.deepEqual(table.getRecords(), [{}]);
        assert.equal(table.size(), 1);
        table = new DataTable(4);
        assert.deepEqual(table.getRecords(), [{}, {}, {}, {}]);
      })

      it('initialize from array of records', function() {
        var records = [{foo: 'a', foo: 'b'}];
        var table = new DataTable(records);
        assert.deepEqual(table.getRecords(), [{foo: 'a', foo: 'b'}]);
        assert.equal(table.getRecords(), records); // returns original data, not copy
      })
    })

    describe('#getRecords()', function() {
      it ("returns array of object records", function() {
        var table = new DataTable(data1);
        assert.deepEqual(table.getRecords(), data1);
      })
    })

    describe('#addField()', function () {
      it('new fields are initialized to a value', function () {
        var table = new DataTable([{foo: 1}, {foo: 2}]);
        table.addField('bar', '');
        assert.deepEqual(table.getRecords(), [{foo:1, bar: ''}, {foo:2, bar: ''}])
      })

      it('initialization value is required', function() {
        var table = new DataTable(3);
        assert.throws(function() {table.addField('foo')})
      })

      it('overwriting a field is not allowed', function() {
        var table = new DataTable([{foo: 'a'}]);
        assert.throws(function() {table.addField('foo', 0)});
      })
    })

    describe('#toString()', function () {
      it('export records as JSON string', function () {
        var records = [{'foo': 'goat', 'bar': 22}, {'foo': 'cat', 'bar': 0}],
            table = new DataTable(records);
        assert.deepEqual(JSON.parse(table.toString()), records);
      })
    })

    describe('#addIdField()', function () {
      it('adds 0-indexed id field', function () {
        var table = new DataTable(3);
        table.addIdField();
        assert.deepEqual(table.getRecords(), [{FID:0}, {FID:1}, {FID:2}])
      })
    })

    describe('#fieldExists()', function() {
      it ('identifies existing fields', function() {
        var table = new DataTable(data1);
        assert.ok(table.fieldExists('bar'))
        assert.ok(table.fieldExists('foo'))
      })

      it ('identifies nonexistent fields', function() {
        var table = new DataTable(data1);
        assert.equal(table.fieldExists('goo'), false)
        assert.equal(table.fieldExists(''), false)
      })
    })

    describe('#clone()', function () {
      it('deep-copies object records', function () {
        var arr = [{a: {foo: 'bar'}}];
        var table = new DataTable(arr);
        var table2 = table.clone();
        table2.getRecords()[0].a.foo = 'baz';
        assert.deepEqual(table.getRecords(), [{a: {foo: 'bar'}}]);
        assert.deepEqual(table2.getRecords(), [{a: {foo: 'baz'}}]);
      })
    })

    describe('#update()', function () {
      it('rename a field', function () {
        var table = new DataTable([{'foo': 'goat', 'bar': 22}, {'foo': 'cat', 'bar': 0}]);
        var updater = function(o) {
          return {
            foo: o.foo,
            baz: o.bar
          };
        };
        table.update(updater);
        var expected = [{'foo': 'goat', 'baz': 22}, {'foo': 'cat', 'baz': 0}];
        assert.deepEqual(table.getRecords(), expected);
      })

      it('remove a field', function() {
        var table = new DataTable([{'foo': 'goat', 'bar': 22}, {'foo': 'cat', 'bar': 0}]);
        table.update(function(o) {
          return {bar: o.bar};
        });
        var expected = [{'bar': 22}, {'bar': 0}];
        assert.deepEqual(table.getRecords(), expected);
      })
    })
  })

  describe('importDbfTable()', function() {
    function readDBF(relpath) {
      var str = path.join(helpers.__dirname, relpath);
      return api.cli.readFile(str);
    }

    describe('#getRecords()', function() {
      it("converts dbf into object records", function() {
        var records = [{
            STATE_NAME: 'Oregon',
            FIPS: '41',
            STATE: 'OR',
            LAT: 43.94,
            LONG: -120.55
          }, {
            STATE_NAME: 'Washington',
            FIPS: '53',
            STATE: 'WA',
            LAT: 47.38,
            LONG: -120.00
          }];

        var table = api.internal.importDbfTable(readDBF("data/two_states.dbf"));
        assert.deepEqual(JSON.stringify(table.getRecords()),
            JSON.stringify(records));
      })
    })

    describe('#fieldExists()', function() {
      it ('identifies existing fields', function() {
        var table = api.internal.importDbfTable(readDBF("data/two_states.dbf"));
        assert.ok(table.fieldExists('LAT'))
        assert.ok(table.fieldExists('STATE_NAME'))
      })
    })
  })

});