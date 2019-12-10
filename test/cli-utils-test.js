var api = require('../'),
  assert = require('assert'),
  cli = api.cli;

describe('mapshaper-cli-lib.js', function () {

  describe('expandInputFiles()', function () {
    it('files without wildcards are passed through (even missing files)', function () {
      assert.deepEqual(cli.expandInputFiles(['missing.json']), ['missing.json']);
    });

    it('expands wild cards', function() {
      assert.deepEqual(cli.expandInputFiles(['test/data/features/centroids/*.shp']),
        ['test/data/features/centroids/a.shp', 'test/data/features/centroids/b.shp']);
    })

    it('API error if wild card expansion fails', function() {
      assert.throws(function() {
        cli.expandInputFiles(['missing/dir/*.shp']);
      }, function(e) {
        return e.name == 'UserError';
      });
    });

    it('API error if wild card expression matches no files', function() {
      assert.throws(function() {
        cli.expandInputFiles(['test/*.shp']);
      }, function(e) {
        return e.name == 'UserError';
      });
    });

  })
})
