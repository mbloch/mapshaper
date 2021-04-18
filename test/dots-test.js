import {
  getDataRecord
} from '../src/commands/mapshaper-dots';

var api = require('../'),
    assert = require('assert');

describe('mapshaper-dots.js', function () {
  describe('getDataRecord()', function () {
    it('copy_fields option', function () {
      var out = getDataRecord(0, {foo: 2, bar: 'a'}, {copy_fields: ['foo', 'bar']});
      assert.deepEqual(out, {foo: 2, bar: 'a'});
    })

    it('colors option', function () {
      var out = getDataRecord(1, null, {colors: ['red', 'green']});
      assert.deepEqual(out, {fill: 'green', r: 1.3})
    })

  })

})
