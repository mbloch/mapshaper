import api from '../mapshaper.js';
import assert from 'assert';


describe('mapshaper-calc-utils.js', function() {

  describe('getModeData()', function() {
    it('multiple modes', function() {
      var values = [1, 3, 4, 4, 3, 0 ,0];
      assert.deepEqual(api.internal.getModeData(values), {modes: [3, 4, 0], margin: 0, count: 2});
    })

    it('multiple modes with verbose data', function() {
      var values = [1, 3, 4, 4, 3, 0 ,0];
      assert.deepEqual(api.internal.getModeData(values, true), {modes: [3, 4, 0], margin: 0, count: 2, values: [1, 3, 4, 0], counts: [1, 2, 2, 2]});
    })

    it('single value', function() {
      var values = [1];
      assert.deepEqual(api.internal.getModeData(values), {modes: [1], margin: 1, count: 1});
    })

    it('single value with verbose data', function() {
      var values = [1];
      assert.deepEqual(api.internal.getModeData(values, true), {modes: [1], margin: 1, count: 1, values: [1], counts: [1]});
    })

    it('strings', function() {
      var values = ['a', 'b', 'c', 'b', 'd'];
      assert.deepEqual(api.internal.getModeData(values), {modes: ['b'], margin: 1, count: 2});
    })

  })

});