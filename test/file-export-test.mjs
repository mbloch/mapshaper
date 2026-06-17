import api from '../mapshaper.js';
import assert from 'assert';
import path from 'path';
import { fixPath } from './helpers';


describe('mapshaper-file-export.js', function () {
  describe('getOutputPaths()', function () {

    it('append filename to directory', function () {
      var paths = ["file1.json", "file2.json"],
          opts = {directory: "somedir"},
          target = [path.join('somedir', paths[0]),
              path.join('somedir', paths[1])];
      assert.deepEqual(api.internal.getOutputPaths(paths, opts), target);
    })

    it('output dir missing', function () {
      var paths = ["file1.json", "file2.json"],
          opts = {},
          target = paths.concat();
      assert.deepEqual(api.internal.getOutputPaths(paths, opts), target);
    })

    /*
    it('avoid file collisions by default', function () {
      var paths = [fixPath("data/geojson/two_states.json")],
          opts = {},
          target = [fixPath("data/two_states-ms.json")];
      assert.deepEqual(api.internal.getOutputPaths(paths, opts), target);
    })
    */

    it('allow file collisions by default', function() {
      var paths = [fixPath("data/geojson/two_states.json")],
          opts = {},
          target = [fixPath("data/geojson/two_states.json")];
      assert.deepEqual(api.internal.getOutputPaths(paths, opts), target);
    })

  })

  describe('layerNameIsUnsafeFilename()', function () {
    var f = api.internal.layerNameIsUnsafeFilename;

    it('flags path separators and traversal', function () {
      assert.strictEqual(f('../owned'), true);
      assert.strictEqual(f('a/b'), true);
      assert.strictEqual(f('a\\b'), true);
      assert.strictEqual(f('/etc/passwd'), true);
    });

    it('flags a Windows drive prefix', function () {
      assert.strictEqual(f('C:foo'), true);
      assert.strictEqual(f('z:bar'), true);
    });

    it('flags a NUL byte', function () {
      assert.strictEqual(f('a\u0000b'), true);
    });

    it('allows ordinary names, including a bare or mid-name colon', function () {
      assert.strictEqual(f('owned'), false);
      assert.strictEqual(f('..'), false);
      assert.strictEqual(f('my.layer'), false);
      assert.strictEqual(f('state-1'), false);
      assert.strictEqual(f('ns:layer'), false);
      assert.strictEqual(f('12:30'), false);
    });
  })
})
