import api from '../mapshaper.js';
import assert from 'assert';
var internal = api.internal;


describe('mapshaper-data-aggregation.js', function () {
  describe('getMultiFieldKeyFunction()', function () {
    var f = internal.getMultiFieldKeyFunction;
    it('single keys', function () {
      assert.equal(f(['foo'])({foo: 'bar'}), 'bar');
      assert.equal(f(['foo'])({foo: 100.23}), '100.23');
      assert.equal(f(['foo'])({foo: true}), 'true');
      assert.equal(f(['foo'])({}), 'undefined');
    })
    it('multiple keys', function () {
      assert.equal(f(['foo','bar','baz'])({foo:'a', bar:0, baz:null}), 'a~~0~~null');
    })
  })

})
