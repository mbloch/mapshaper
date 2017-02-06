var api = require('../'),
  assert = require('assert'),
  cli = api.cli;

describe('mapshaper-cli-lib.js', function () {

  describe('expandInputFiles()', function () {
    it('files without wildcards are passed through (even missing files)', function () {
      assert.deepEqual(cli.expandInputFiles(['missing.json']), ['missing.json']);
    })

    it('expands wild cards', function() {
      assert.deepEqual(cli.expandInputFiles(['test/test_data/centroids/*.shp']),
        ['test/test_data/centroids/a.shp', 'test/test_data/centroids/b.shp']);
    })

    it('API error if wild card expansion fails', function() {
      assert.throws(function() {
        cli.expandInputFiles(['missing/dir/*.shp']);
      }, function(e) {
        return e.name == 'APIError';
      });
    });

    it('API error if wild card expression matches no files', function() {
      assert.throws(function() {
        cli.expandInputFiles(['test/*.shp']);
      }, function(e) {
        return e.name == 'APIError';
      });
    });

  })

})