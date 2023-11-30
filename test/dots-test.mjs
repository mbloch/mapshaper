import {
  getDataRecord
} from '../src/commands/mapshaper-dots';
import api from '../mapshaper.js';
import assert from 'assert';


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

    it('values option', function () {
      var out = getDataRecord(1, null, {values: ['a', 'b']});
      assert.deepEqual(out, {fill: 'b', r: 1.3})
    })

    it('save-as option', function () {
      var out = getDataRecord(0, null, {values: ['a', 'b'], save_as: 'name'});
      assert.deepEqual(out, {name: 'a', r: 1.3})
    })


  })

})
