var api = require('../'),
  internal = api.internal,
  assert = require('assert');

describe('mapshaper-option-parser.js', function () {

  describe('parseStringList()', function () {
    var list1 = '"County FIPS,State FIPS"',
        list2 = '"County FIPS","State FIPS"';

    it(list1, function() {
      assert.deepEqual(internal.parseStringList(list1), ["County FIPS", "State FIPS"]);
    })

    it(list2, function() {
      assert.deepEqual(internal.parseStringList(list2), ["County FIPS", "State FIPS"]);
    })
  })

  describe('parseColorList()', function () {
    var list1 = '"white black"',
        list2 = '"white","black"',
        list3 = '"white, black"',
        list4 = '"white", "black"',
        expected = ['white', 'black'];

    it(list1, function() {
      assert.deepEqual(internal.parseColorList(list1), expected);
    })
    it(list2, function() {
      assert.deepEqual(internal.parseColorList(list2), expected);
    })
    it(list3, function() {
      assert.deepEqual(internal.parseColorList(list3), expected);
    })
    it(list4, function() {
      assert.deepEqual(internal.parseColorList(list4), expected);
    })
  })
})
