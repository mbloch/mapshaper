var assert = require('assert'),
    api = require("../");

describe('mapshaper-merge-files.js', function () {
  describe('getCommonFilePrefix()', function () {
    it('find common filename stem', function () {
      var files = ['states-DC.shp', 'states-MD.shp', 'states-NY.shp']
      assert.equal(api.utils.getCommonFilePrefix(files), 'states-');
    })
    it('returns filename w/o extension of single file', function () {
      var files = ['states-DC.shp']
      assert.equal(api.utils.getCommonFilePrefix(files), 'states-DC');
    })
    it('returns empty string if nothing in common', function () {
      var files = ['states-DC.shp', 'lakes.shp']
      assert.equal(api.utils.getCommonFilePrefix(files), '');
    })
  })

})