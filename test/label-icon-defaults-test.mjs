import api from '../mapshaper.js';
import assert from 'assert';
import {
  getDefaultIconSize, getDefaultIconColor, getIconShapeChange
} from '../src/gui/gui-label-icons';
import { iconNames, isSupportedIconName } from '../src/svg/svg-icons';

var point = JSON.stringify({
  type: 'Feature',
  properties: {},
  geometry: {type: 'Point', coordinates: [0, 0]}
});

async function renderSvg(style) {
  var out = await api.applyCommands('-i in.json -style ' + style + ' -o out.svg',
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

  it('draws only the NYT star in a colour of its own', function () {
    assert.equal(getDefaultIconColor('nyt-star'), '#cc0000');
    assert.equal(getDefaultIconColor('circle'), '');
  });

  describe('getIconShapeChange()', function () {
    it('gives a new symbol its shape\'s defaults', function () {
      assert.deepEqual(getIconShapeChange('star', '', 0, ''), {size: 8});
      assert.deepEqual(getIconShapeChange('nyt-star', '', '', ''),
        {size: 14, color: '#cc0000'});
    });

    it('moves a default size to the new shape\'s default', function () {
      assert.deepEqual(getIconShapeChange('ring', 'circle', 5, ''), {size: 8});
      assert.deepEqual(getIconShapeChange('circle', 'star', 8, ''), {size: 5});
    });

    it('keeps a size the user chose', function () {
      assert.deepEqual(getIconShapeChange('ring', 'circle', 12, ''), {size: 12});
      // and one on a symbol being switched back on
      assert.deepEqual(getIconShapeChange('star', '', 12, ''), {size: 12});
    });

    it('puts the NYT red on and takes it off again, unless the colour was chosen', function () {
      assert.deepEqual(getIconShapeChange('nyt-star', 'circle', 5, ''),
        {size: 14, color: '#cc0000'});
      assert.deepEqual(getIconShapeChange('circle', 'nyt-star', 14, '#CC0000'),
        {size: 5, color: ''});
      assert.deepEqual(getIconShapeChange('nyt-star', 'circle', 5, '#0000ff'), {size: 14});
      assert.deepEqual(getIconShapeChange('circle', 'nyt-star', 14, '#0000ff'), {size: 5});
    });

    it('leaves a colour the labels disagree on alone', function () {
      assert.deepEqual(getIconShapeChange('nyt-star', 'circle', 5, null), {size: 14});
    });
  });
});

describe('icon=nyt-star', function () {
  it('renders as a white star outlined in the icon colour, scaled to icon-size', async function () {
    var svg = await renderSvg('icon=nyt-star icon-size=40 icon-color=#cc0000');
    var path = /<path [^>]*>/.exec(svg)[0];
    assert(/fill="#fff"/.test(path), path);
    assert(/stroke="#cc0000"/.test(path), path);
    assert(/stroke-width="5"/.test(path), path);
    assert(/stroke-miterlimit="10"/.test(path), path);
    // at the artwork's own size, its first point less the box's centre
    assert(/d="M -0\.02 -14\.28 /.test(path), path);
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
