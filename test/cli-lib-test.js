var api = require('../'),
  assert = require('assert'),
  cli = api.cli;

describe('mapshaper-cli-lib.js', function () {

  describe('validateInputFiles()', function () {
    it('error on missing file', function () {
      assert.throws(function() {
        cli.validateInputFiles(['missing.json']);
      });
    })

    it('expands wild cards', function() {
      assert.deepEqual(cli.validateInputFiles(['test/test_data/centroids/*.shp']),
        ['test/test_data/centroids/a.shp', 'test/test_data/centroids/b.shp']);
    })
  })

})