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

    it('API error if wild card expansion fails', function() {
      assert.throws(function() {
        cli.validateInputFiles(['missing/dir/*.shp']);
      }, function(e) {
        return e.name == 'APIError';
      });
    });

    it('API error if wild card expression matches no files', function() {
      assert.throws(function() {
        cli.validateInputFiles(['test/*.shp']);
      }, function(e) {
        return e.name == 'APIError';
      });
    });

  })

})