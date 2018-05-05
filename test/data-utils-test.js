var api = require('../'),
  assert = require('assert');

describe('mapshaper-data-utils.js', function () {
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
