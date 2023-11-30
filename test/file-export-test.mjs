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
      var paths = [fixPath("data/two_states.json")],
          opts = {},
          target = [fixPath("data/two_states-ms.json")];
      assert.deepEqual(api.internal.getOutputPaths(paths, opts), target);
    })
    */

    it('allow file collisions by default', function() {
      var paths = [fixPath("data/two_states.json")],
          opts = {},
          target = [fixPath("data/two_states.json")];
      assert.deepEqual(api.internal.getOutputPaths(paths, opts), target);
    })

  })
})
