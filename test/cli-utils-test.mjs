import api from '../mapshaper.js';
import assert from 'assert';
var cli = api.cli;

describe('mapshaper-cli-lib.js', function () {

  describe('expandInputFiles()', function () {
    it('files without wildcards are passed through (even missing files)', function () {
      assert.deepEqual(cli.expandInputFiles(['missing.json']), ['missing.json']);
    });

    it('expands wild cards', function() {
      assert.deepEqual(cli.expandInputFiles(['test/data/features/centroids/*.shp']),
        ['test/data/features/centroids/a.shp', 'test/data/features/centroids/b.shp']);
    })

    it('expands wild cards 2', function() {
      assert.deepEqual(cli.expandInputFiles(['README*']),
        ['README.md']);
    })

    it('expands wild card directories', function() {
      assert.deepEqual(cli.expandInputFiles(['test/data/features/centroids*/*.shp']),
        ['test/data/features/centroids/a.shp', 'test/data/features/centroids/b.shp']);
    })

    it('expands wild card directories, ignores matching directories with no matching files', function() {
      assert.deepEqual(cli.expandInputFiles(['*/affine-test.mjs']),
        ['test/affine-test.mjs']);
    })


    it('expands wild card directories 2', function() {
      assert.deepEqual(cli.expandInputFiles(['test/*/six_counties.shp']),
        ['test/data/six_counties.shp']);
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
