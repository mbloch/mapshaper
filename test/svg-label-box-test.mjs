import api from '../mapshaper.js';
import assert from 'assert';
import { parseLabelPadding, getLabelPadding, getPositionPaddingShift,
  labelHasBackground } from '../src/svg/svg-label-box.mjs';
import { getLabelBox, getLabelTextBox,
  getLabelCalloutShape } from '../src/svg/svg-label-callout.mjs';
import { renderLabelBackground } from '../src/svg/svg-label-background.mjs';
import { getDrawnLabelOffset } from '../src/svg/svg-labels.mjs';
import { renderPoint } from '../src/svg/svg-symbols.mjs';
import { getPointSymbolBox } from '../src/svg/svg-symbol-bounds.mjs';
import { setTextMeasureFunction,
  clearTextWidthCache } from '../src/svg/svg-label-metrics.mjs';

function near(a, b, msg) {
  assert.ok(Math.abs(a - b) < 1e-6, (msg || '') + ' expected ' + b + ', got ' + a);
}

describe('svg-label-box.mjs', function () {

  describe('parseLabelPadding()', function () {
    it('accepts one to four CSS lengths and normalizes their spacing', function () {
      assert.equal(parseLabelPadding('4'), '4');
      assert.equal(parseLabelPadding(4), '4');
      assert.equal(parseLabelPadding(' 2   6 '), '2 6');
      assert.equal(parseLabelPadding('1 2 3'), '1 2 3');
      assert.equal(parseLabelPadding('1px 0.5em 3 4px'), '1px 0.5em 3 4px');
    });

    it('rejects anything else', function () {
      assert.strictEqual(parseLabelPadding(''), null);
      assert.strictEqual(parseLabelPadding('1 2 3 4 5'), null);
      assert.strictEqual(parseLabelPadding('-2'), null);
      assert.strictEqual(parseLabelPadding('2pt'), null);
      assert.strictEqual(parseLabelPadding('2,6'), null);
      assert.strictEqual(parseLabelPadding(-1), null);
    });
  });

  describe('getLabelPadding()', function () {
    it('expands the CSS shorthand to four sides', function () {
      assert.deepEqual(getLabelPadding({'label-padding': '4'}),
        {top: 4, right: 4, bottom: 4, left: 4});
      assert.deepEqual(getLabelPadding({'label-padding': '2 6'}),
        {top: 2, right: 6, bottom: 2, left: 6});
      assert.deepEqual(getLabelPadding({'label-padding': '1 2 3'}),
        {top: 1, right: 2, bottom: 3, left: 2});
      assert.deepEqual(getLabelPadding({'label-padding': '1 2 3 4'}),
        {top: 1, right: 2, bottom: 3, left: 4});
    });

    it('resolves ems against the label\'s font size', function () {
      assert.deepEqual(getLabelPadding({'label-padding': '0.5em 1em', 'font-size': 20}),
        {top: 10, right: 20, bottom: 10, left: 20});
      assert.equal(getLabelPadding({'label-padding': '1em'}).top, 12);
    });

    it('is null for a label without one', function () {
      assert.strictEqual(getLabelPadding({}), null);
      assert.strictEqual(getLabelPadding({'label-padding': 'wide'}), null);
    });
  });

  describe('getPositionPaddingShift()', function () {
    var pad = {top: 1, right: 2, bottom: 3, left: 4};
    it('moves away from the anchor by the padding facing it', function () {
      assert.deepEqual(getPositionPaddingShift('e', pad), [4, 0]);
      assert.deepEqual(getPositionPaddingShift('w', pad), [-2, 0]);
      assert.deepEqual(getPositionPaddingShift('n', pad), [0, -3]);
      assert.deepEqual(getPositionPaddingShift('s', pad), [0, 1]);
      assert.deepEqual(getPositionPaddingShift('ne', pad), [4, -3]);
      assert.deepEqual(getPositionPaddingShift('sw', pad), [-2, 1]);
      assert.deepEqual(getPositionPaddingShift('c', pad), [0, 0]);
    });
  });

  describe('labelHasBackground()', function () {
    it('is on for a colour, and off for none or nothing', function () {
      assert.equal(labelHasBackground({'label-background': 'pink'}), true);
      assert.equal(labelHasBackground({'label-background': 'none'}), false);
      assert.equal(labelHasBackground({'label-background': ''}), false);
      assert.equal(labelHasBackground({}), false);
    });
  });

  describe('positions with padding', function () {
    it('moves a position\'s offsets out by the padding, in px', function () {
      var o = getDrawnLabelOffset({'label-pos': 'e', 'label-padding': '2 6'});
      near(o.dx, 0.45 * 12 + 6);
      near(o.dy, 0.23 * 12);
      o = getDrawnLabelOffset({'label-pos': 'n', 'label-padding': '2 6 5'});
      near(o.dx, 0);
      near(o.dy, -0.5 * 12 - 5);
    });

    it('leaves offsets of the record\'s own where they are', function () {
      var o = getDrawnLabelOffset({'label-pos': 'e', dx: 10, 'label-padding': 6});
      near(o.dx, 10);
    });

    it('leaves labels without padding exactly as they were', function () {
      var o = renderPoint({'label-text': 'A', 'label-pos': 'e'});
      assert.equal(o.properties.x, '0.45em');
    });
  });

  describe('getLabelBox()', function () {
    beforeEach(function () {
      setTextMeasureFunction(function () { return 60; });
      clearTextWidthCache();
    });
    afterEach(function () {
      setTextMeasureFunction(null);
      clearTextWidthCache();
    });

    it('is the text box grown by the padding', function () {
      var rec = {'label-text': 'Hello', 'text-anchor': 'start', dx: 10, dy: 0,
        'label-padding': '1 2 3 4'};
      var text = getLabelTextBox(rec);
      var box = getLabelBox(rec);
      near(box.xmin, text.xmin - 4);
      near(box.xmax, text.xmax + 2);
      near(box.ymin, text.ymin - 1);
      near(box.ymax, text.ymax + 3);
      near(box.midline, text.midline);
    });

    it('fits a text block\'s wrapped text rather than its column', function () {
      var rec = {'label-text': 'Hello', 'text-anchor': 'start', dx: 0, dy: 10,
        'label-width': 100, 'label-background': 'pink'};
      near(getLabelBox(rec).xmax, 60);
      near(getLabelBox(Object.assign({'label-padding': 5}, rec)).xmax, 65);
    });

    it('is where a callout stops, with no gap, with or without a background', function () {
      var rec = {'label-text': 'Hello', 'text-anchor': 'start', dx: 40, dy: -40,
        callout: 'elbow'};
      var padded = Object.assign({'label-padding': 4}, rec);
      var filled = Object.assign({'label-background': 'pink'}, rec);
      near(getLabelCalloutShape(rec, 0).attach[0], 40 - 3);
      near(getLabelCalloutShape(padded, 0).attach[0], 40 - 4);
      near(getLabelCalloutShape(Object.assign({'label-background': 'pink'}, padded), 0).attach[0], 40 - 4);
      near(getLabelCalloutShape(filled, 0).attach[0], 40);
    });
  });

  describe('renderLabelBackground()', function () {
    beforeEach(function () {
      setTextMeasureFunction(function () { return 60; });
      clearTextWidthCache();
    });
    afterEach(function () {
      setTextMeasureFunction(null);
      clearTextWidthCache();
    });

    it('draws a rect over the padded box', function () {
      var rec = {'label-text': 'Hello', 'text-anchor': 'start', dx: 0, dy: 0,
        'label-padding': '2 6', 'label-background': '#ff0', 'label-background-opacity': 0.5};
      var o = renderLabelBackground(rec);
      assert.equal(o.tag, 'rect');
      assert.deepEqual(o.properties, {class: 'label-background', x: -6, y: -11.6,
        width: 72, height: 16, fill: '#ff0', opacity: 0.5});
    });

    it('draws nothing without a colour', function () {
      assert.strictEqual(renderLabelBackground({'label-text': 'Hello', 'label-padding': 4}), null);
    });

    it('goes below the callout, the icon and the text', function () {
      var o = renderPoint({'label-text': 'Hello', 'text-anchor': 'start', dx: 40, dy: -40,
        callout: 'line', r: 3, 'label-background': 'pink'});
      assert.deepEqual(o.children.map(function(child) {
        return child.properties.class || child.tag;
      }), ['label-background', 'label-callout', 'circle', 'text']);
    });

    it('is included in the symbol\'s bounds', function () {
      var box = getPointSymbolBox({'label-text': 'Hello', 'text-anchor': 'start',
        dx: 0, dy: 0, 'label-padding': 10, 'label-background': 'pink'});
      near(box[0], -10);
      near(box[2], 70);
    });
  });

  describe('-style', function () {
    it('accepts the new properties and writes the background in SVG output', async function () {
      var geojson = {type: 'Feature', properties: {name: 'A'},
        geometry: {type: 'Point', coordinates: [0, 0]}};
      var cmd = '-i point.json -style label-text=name label-padding="2 6" ' +
        'label-background=yellow label-background-opacity=0.8 -o format=geojson';
      var out = await api.applyCommands(cmd, {'point.json': geojson});
      var props = JSON.parse(out['point.json']).features[0].properties;
      assert.equal(props['label-padding'], '2 6');
      assert.equal(props['label-background'], 'yellow');
      assert.equal(props['label-background-opacity'], 0.8);
      out = await api.applyCommands(cmd.replace('format=geojson', 'out.svg'),
        {'point.json': geojson});
      assert.ok(/<rect class="label-background"[^>]*fill="yellow" opacity="0.8"/.test(String(out['out.svg'])));
    });

    it('rejects a padding that is not a CSS padding string', async function () {
      var geojson = {type: 'Feature', properties: {},
        geometry: {type: 'Point', coordinates: [0, 0]}};
      await assert.rejects(api.applyCommands('-i point.json -style label-padding="1 2 3 4 5"',
        {'point.json': geojson}));
    });
  });
});
