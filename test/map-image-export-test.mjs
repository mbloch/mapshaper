import api from '../mapshaper.js';
import assert from 'assert';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';

// The web UI's export is tested in browser-tests/gui-export-smoke.spec.mjs
describe('PNG and JPEG output', function () {
  var FRAME = '-rectangle bbox=0,0,2,1 name=frame -frame width=200 ' +
    '-style fill="#2166ac" target=frame';

  it('-o out.png writes a PNG at twice the frame size', async function () {
    var out = await api.applyCommands(FRAME + ' -o out.png');
    var png = PNG.sync.read(out['out.png']);
    assert.equal(png.width, 400);
    assert.equal(png.height, 200);
    // the frame's fill, at the center of the image
    var i = (100 * 400 + 200) * 4;
    assert.deepEqual(Array.from(png.data.subarray(i, i + 3)), [0x21, 0x66, 0xac]);
  });

  it('-o out.jpg writes a JPEG at the pixel-ratio= option', async function () {
    var out = await api.applyCommands(FRAME + ' -o out.jpg pixel-ratio=1');
    var img = jpeg.decode(out['out.jpg']);
    assert.equal(img.width, 200);
    assert.equal(img.height, 100);
  });

  ['png', 'jpg', 'jpeg'].forEach(function(fmt) {
    it('format=' + fmt + ' writes a file with the format\'s extension', async function () {
      var out = await api.applyCommands(FRAME + ' -o format=' + fmt);
      assert.deepEqual(Object.keys(out), ['output' + (fmt == 'png' ? '.png' : '.jpg')]);
    });
  });

  it('infers the format from a .png or .jpg filename', function () {
    var infer = api.internal.inferOutputFormat;
    assert.equal(infer('map.png'), 'png');
    assert.equal(infer('map.jpg'), 'jpg');
    assert.equal(infer('map.JPEG'), 'jpg');
  });
});
