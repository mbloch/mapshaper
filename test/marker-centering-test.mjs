import api from '../mapshaper.js';
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

// Through the bundle, which is where Node's font measurement is installed
var {resolveLabelPosition, getCapCentredOffset} = api.internal;
var {setCapHeightFunction, clearTextWidthCache} = api.internal.svg;
var {measureCapHeight, clearFontCache, clearMeasuredFontCache} = api.internal.fonts;

var SOURCE_SANS = fileURLToPath(new URL('../www/assets/SourceSans3-VariableFont_wght.ttf', import.meta.url));

function marker(o) {
  return Object.assign({'label-text': '1', 'label-pos': 'c', icon: 'square'}, o);
}

describe('Text centred on a symbol', function () {
  afterEach(function () {
    setCapHeightFunction(measureCapHeight);
    clearTextWidthCache();
  });

  it('is centred on its capitals, at half a typical cap height without a measurement', function () {
    setCapHeightFunction(null);
    assert.equal(resolveLabelPosition(marker()).dy, '0.35em');
  });

  it('by the measured cap height of its font', function () {
    setCapHeightFunction(function(rec) {
      return rec['font-family'] == 'Tall' ? 0.8 : null;
    });
    clearTextWidthCache();
    assert.equal(resolveLabelPosition(marker({'font-family': 'Tall'})).dy, '0.4em');
    assert.equal(resolveLabelPosition(marker({'font-family': 'Other'})).dy, '0.35em');
  });

  it('a dy of its own wins, as it does over any position', function () {
    assert.equal(resolveLabelPosition(marker({dy: 3})).dy, 3);
    assert.equal(resolveLabelPosition(marker({dy: 0})).dy, 0);
  });

  it('a centred label with no symbol keeps the position\'s own offset', function () {
    assert.equal(resolveLabelPosition({'label-text': 'Paris', 'label-pos': 'c'}).dy, '0.25em');
  });

  it('exported to SVG at the offset', async function () {
    setCapHeightFunction(null);
    var out = await api.applyCommands('-labels coordinates=0,0 text=2 label-pos=c ' +
      'icon=circle icon-size=20 icon-fill=#c00 fill=#fff -o format=svg out.svg', {});
    assert(/<text y="0\.35em"/.test(String(out['out.svg'])));
  });

  describe('measured from a font file in Node', function () {
    var fontPath, dir;

    before(function () {
      fontPath = process.env.MAPSHAPER_FONT_PATH;
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mapshaper-fonts-'));
      fs.copyFileSync(SOURCE_SANS, path.join(dir, path.basename(SOURCE_SANS)));
      process.env.MAPSHAPER_FONT_PATH = dir;
      clearFontCache();
      clearMeasuredFontCache();
    });

    after(function () {
      if (fontPath === undefined) {
        delete process.env.MAPSHAPER_FONT_PATH;
      } else {
        process.env.MAPSHAPER_FONT_PATH = fontPath;
      }
      fs.rmSync(dir, {recursive: true, force: true});
      clearFontCache();
      clearMeasuredFontCache();
    });

    it("reads the font's cap height", function () {
      // Source Sans 3's capitals are 660 of its 1000 units
      assert.equal(measureCapHeight({'font-family': 'Source Sans 3'}), 0.66);
      assert.equal(getCapCentredOffset({'font-family': 'Source Sans 3'}), '0.33em');
    });

    it('a font that is not here has no cap height', function () {
      assert.equal(measureCapHeight({'font-family': 'No Such Font'}), null);
    });
  });
});
