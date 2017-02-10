var api = require('../'),
    assert = require('assert');

describe('mapshaper-calc-utils.js', function() {

  describe('getModeData()', function() {
    it('multiple modes', function() {
      var values = [1, 3, 4, 4, 3, 0 ,0];
      assert.deepEqual(api.internal.getModeData(values), {modes: [3, 4, 0], margin: 0});
    })

    it('single value', function() {
      var values = [1];
      assert.deepEqual(api.internal.getModeData(values), {modes: [1], margin: 1});
    })

    it('strings', function() {
      var values = ['a', 'b', 'c', 'b', 'd'];
      assert.deepEqual(api.internal.getModeData(values), {modes: ['b'], margin: 1});
    })

  })

});