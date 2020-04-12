var api = require('../'),
  internal = api.internal,
  assert = require('assert');

describe('mapshaper-command-parser.js', function () {

  describe('parseStringList()', function () {
    var list1 = '"County FIPS,State FIPS"',
        list2 = '"County FIPS","State FIPS"';

    function test(str, target) {
      assert.deepEqual(api.internal.parseStringList(str), target);
    }

    it(list1, function() {
      test(list1, ["County FIPS", "State FIPS"]);
    })

    it(list2, function() {
      test(list2, ["County FIPS", "State FIPS"]);
    })

    it('Internal quotes are ignored', function() {
      var str = "Clinton '16,Hubbell '18";
      test(str, ["Clinton '16", "Hubbell '18"]);
    })

    it('splits list containing quoted strings', function () {
      test('foo,"foo bar",baz', ['foo', 'foo bar', 'baz']);
    })

    it('splits list containing apostrophes', function () {
      test('Clinton \'16,Hubbell \'18,16+\'18 Votes', ['Clinton \'16', 'Hubbell \'18', '16+\'18 Votes']);
    })

    it('splits list containing apostrophes 2', function () {
      test('"Clinton \'16","Hubbell \'18","16+\'18 Votes"', ['Clinton \'16', 'Hubbell \'18', '16+\'18 Votes']);
    })

    it('ignores empty strings', function () {
      test('mapshaper,', ['mapshaper']);
      test('foo,,,bar', ['foo', 'bar']);
    })
  })

  describe('parseColorList()', function () {
    var list1 = '"white black"',
        list2 = '"white","black"',
        list3 = '"white, black"',
        list4 = '"white", "black"',
        expected = ['white', 'black'];

    var list5 = 'rgba(0, 0, 0, 0), rgb(22,32,0),aliceblue',
        expected5 = ['rgba(0,0,0,0)', 'rgb(22,32,0)', 'aliceblue'];

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
    it(list5, function() {
      assert.deepEqual(internal.parseColorList(list5), expected5);
    })
  })
})
