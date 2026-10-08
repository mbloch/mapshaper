import api from '../mapshaper.js';
import assert from 'assert';

// PNG and JPEG images of the map are exported by the web UI; see
// browser-tests/gui-export-smoke.spec.mjs
describe('PNG and JPEG output', function () {
  ['png', 'jpg', 'jpeg'].forEach(function(fmt) {
    it('-o format=' + fmt + ' is only available in the web UI', async function () {
      await assert.rejects(api.applyCommands('-rectangle bbox=0,0,1,1 -o format=' + fmt),
        /only available in the web UI/);
    });
  });
});
