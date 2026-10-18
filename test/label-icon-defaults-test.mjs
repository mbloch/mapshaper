import api from '../mapshaper.js';
import assert from 'assert';
import {
  getDefaultIconSize, getIconShapeChange
} from '../src/gui/gui-label-icons';
import { iconNames, isSupportedIconName } from '../src/svg/svg-icons';

var point = JSON.stringify({
  type: 'Feature',
  properties: {},
  geometry: {type: 'Point', coordinates: [0, 0]}
});

async function renderSvg(style, command) {
  var out = await api.applyCommands('-i in.json -' + (command || 'style') + ' ' + style + ' -o out.svg',
    {'in.json': point});
  return String(out['out.svg']);
}

describe('label icon defaults', function () {
  it('sizes stars and rings above circles and squares, and the NYT star above both', function () {
    assert.equal(getDefaultIconSize('circle'), 5);
    assert.equal(getDefaultIconSize('square'), 5);
    assert.equal(getDefaultIconSize('star'), 8);
    assert.equal(getDefaultIconSize('ring'), 8);
    assert.equal(getDefaultIconSize('nyt-star'), 14);
    assert.equal(getDefaultIconSize(''), 5);
  });

  describe('getIconShapeChange()', function () {
    it('gives a new symbol its shape\'s defaults', function () {
      assert.deepEqual(getIconShapeChange('star', '', 0), {size: 8});
      assert.deepEqual(getIconShapeChange('nyt-star', '', ''), {size: 14});
    });

    it('moves a default size to the new shape\'s default', function () {
      assert.deepEqual(getIconShapeChange('ring', 'circle', 5), {size: 8});
      assert.deepEqual(getIconShapeChange('circle', 'star', 8), {size: 5});
    });

    it('keeps a size the user chose', function () {
      assert.deepEqual(getIconShapeChange('ring', 'circle', 12), {size: 12});
      // and one on a symbol being switched back on
      assert.deepEqual(getIconShapeChange('star', '', 12), {size: 12});
    });
  });
});

describe('icon=nyt-star', function () {
  it('renders as a white star outlined in the icon colour, scaled to icon-size', async function () {
    var svg = await renderSvg('icon=nyt-star icon-size=40 icon-color=#cc0000');
    var path = /<path [^>]*>/.exec(svg)[0];
    assert(/fill="#ffffff"/.test(path), path);
    assert(/stroke="#cc0000"/.test(path), path);
    assert(/stroke-width="5"/.test(path), path);
    assert(/stroke-miterlimit="10"/.test(path), path);
    // at the artwork's own size, its first point less the box's centre
    assert(/d="M -0\.02 -14\.28 /.test(path), path);
  });

  it('takes its outline from icon-stroke and its middle from icon-fill', async function () {
    var svg = await renderSvg('type=nyt-star radius=20 stroke=#0000ff fill=#ffff00 stroke-width=20', 'symbols');
    var path = /<path [^>]*>/.exec(svg)[0];
    assert(/fill="#ffff00"/.test(path), path);
    assert(/stroke="#0000ff"/.test(path), path);
    // the outline's width is the artwork's
    assert(/stroke-width="5"/.test(path), path);
  });

  it('scales its outline with it', async function () {
    var svg = await renderSvg('icon=nyt-star icon-size=9');
    assert(/stroke-width="1\.13"/.test(svg), svg);
  });

  it('is a supported name without being listed among the icon names', function () {
    assert(isSupportedIconName('nyt-star'));
    assert.equal(iconNames.indexOf('nyt-star'), -1);
  });
});

describe('icon=nyt-target and icon=nyt-target2', function () {
  function circles(svg) {
    return svg.match(/<circle [^>]*>/g) || [];
  }

  it('draw a dot inside a ring, in the icon colour, with nothing behind them', async function () {
    var c = circles(await renderSvg('icon=nyt-target icon-size=40 icon-color=#e0553b'));
    assert.deepEqual(c, [
      '<circle cx="0" cy="0" fill="none" stroke="#e0553b" stroke-width="4" r="18"/>',
      '<circle cx="0" cy="0" fill="#e0553b" r="9.2"/>'
    ]);
  });

  it('draw a dot inside two rings', async function () {
    var c = circles(await renderSvg('icon=nyt-target2 icon-size=100 icon-color=red'));
    assert.equal(c.length, 3);
    assert(/stroke-width="8" r="29.5"/.test(c[0]), c[0]);
    assert(/stroke-width="4.5" r="47.75"/.test(c[1]), c[1]);
    assert(/fill="red" r="15"/.test(c[2]), c[2]);
  });

  it('-symbols gives them their NYT color, a fill behind them, and opacity on the whole icon', async function () {
    var svg = await renderSvg('type=nyt-target radius=20 fill=white opacity=0.5', 'symbols');
    var c = circles(svg);
    assert.equal(c[0], '<circle cx="0" cy="0" fill="white" r="20"/>');
    assert(/stroke="#e0553b"/.test(c[1]), c[1]);
    assert(/<g [^>]*opacity="0.5"/.test(svg), svg);
  });

  it('are supported names without being listed among the icon names', function () {
    assert(isSupportedIconName('nyt-target') && isSupportedIconName('nyt-target2'));
    assert.equal(iconNames.indexOf('nyt-target'), -1);
  });
});
