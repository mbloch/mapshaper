import api from '../mapshaper.js';
import assert from 'assert';


describe('mapshaper-data-utils.js', function () {

  describe('getValueType()', function() {
    var getValueType = api.internal.getValueType;
    it('Date objects are type "date"', function() {
      assert.equal(getValueType(new Date()), 'date');
    });

    it('null is type null, not "object"', function() {
      assert.strictEqual(getValueType(null), null)
    })

    it('undefined is type null', function() {
      assert.strictEqual(getValueType(void 0), null)
      assert.strictEqual(getValueType(undefined), null)
    })

    it('0 is type "number"', function() {
      assert.strictEqual(getValueType(0), "number")
    })
  })

  describe('getColumnType()', function() {
    var getColumnType = api.internal.getColumnType;

    it('missing field is type null', function() {
      assert.strictEqual(getColumnType('foo', [{}]), null)
      assert.strictEqual(getColumnType('foo', []), null)
    })

    // it('only NaN is type null', function() {
    //   assert.strictEqual(getColumnType('foo', [{foo: NaN}]), null)
    // })

    it('string field is type "string"', function() {
      assert.strictEqual(getColumnType('foo', [{}, {foo: ''}]), 'string')
      assert.strictEqual(getColumnType('foo', [{foo: 'bar'}]), 'string')
    })
    it('mixed-type field: first non-empty type (TODO: rethink this)', function() {
      assert.strictEqual(getColumnType('foo', [{foo: 0}, {foo: ''}]), 'number')
    })
  })

  describe('fixInconsistentFields()', function () {

    it('csv output contains all fields from inconsistent JSON table', function(done) {
      var json = [{}, {foo: 'a', bar: 1}, {foo: 'b'}]
      api.applyCommands('-o format=csv', json, function(err, data) {
        assert.equal(data, 'foo,bar\n,\na,1\nb,');
        done();
      });
    })

    it('patches missing fields with undefined', function () {
      if (!assert.deepStrictEqual) return;
      var arr = [{foo: null}, {bar: 0}, null];
      api.internal.fixInconsistentFields(arr);
      assert.deepStrictEqual(arr, [{foo: null, bar: undefined}, {foo: undefined, bar: 0}, {foo: undefined, bar: undefined}])
    })
  })

  describe('getUniqFieldNames()', function () {
    it('truncate fields, without replacing pre-exisiting names', function () {
      var fields = ['foobar2', 'foobar', 'foobar1'];
      var out = api.internal.getUniqFieldNames(fields, 6);
      assert.deepEqual(out, ['foob_1', 'foobar', 'foob_2']);
    })
  })

});
