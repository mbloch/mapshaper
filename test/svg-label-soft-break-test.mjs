import api from '../mapshaper.js';
import assert from 'assert';
import { splitLabelLines, removeSoftBreaks, renderLabel } from '../src/svg/svg-labels.mjs';
import { renderPathLabel } from '../src/svg/svg-label-paths.mjs';

// <wbr> is a line break the GUI's wrapper inserted in a fixed-width text block.
// See docs/development/text-annotation-design.md.
describe('label soft breaks', function () {

  describe('splitLabelLines()', function () {
    it('breaks on soft and hard breaks alike', function () {
      assert.deepEqual(splitLabelLines('one <wbr>two\\nthree<br>four\nfive'),
        ['one', 'two', 'three', 'four', 'five']);
    });

    it('drops the whitespace a soft break follows, and only that', function () {
      assert.deepEqual(splitLabelLines('a  <wbr>b \\nc'), ['a', 'b ', 'c']);
    });

    it('keeps the hyphen a line broke after', function () {
      assert.deepEqual(splitLabelLines('well-<wbr>known'), ['well-', 'known']);
    });

    it('is case-insensitive, like <br>', function () {
      assert.deepEqual(splitLabelLines('a <WBR>b'), ['a', 'b']);
    });

    it('returns one line for text with no breaks', function () {
      assert.deepEqual(splitLabelLines('plain'), ['plain']);
      assert.deepEqual(splitLabelLines(''), ['']);
    });
  });

  describe('removeSoftBreaks()', function () {
    it('gives back the text as typed, hard breaks included', function () {
      assert.equal(removeSoftBreaks('Mount Rainier <wbr>National Park\\nEst. 1899'),
        'Mount Rainier National Park\\nEst. 1899');
    });
  });

  describe('rendering', function () {
    it('draws a soft-broken label as stacked lines', function () {
      var o = renderLabel({'label-text': 'Mount <wbr>Rainier'});
      assert.equal(o.value, 'Mount');
      assert.equal(o.children.length, 1);
      assert.equal(o.children[0].tag, 'tspan');
      assert.equal(o.children[0].value, 'Rainier');
    });

    it('joins a path label\'s soft breaks without adding a space', function () {
      var o = renderPathLabel({'label-text': 'Big <wbr>River'}, [[0, 0], [300, 0]]);
      var textPath = o.children ? o.children[0] : null;
      assert.equal(textPath && textPath.value, 'Big River');
    });

    it('exports soft breaks as tspans', async function () {
      var point = JSON.stringify({type: 'Feature',
        properties: {'label-text': 'Mount <wbr>Rainier', 'label-width': 40},
        geometry: {type: 'Point', coordinates: [0, 0]}});
      var out = await api.applyCommands('-i point.json -o out.svg', {'point.json': point});
      var svg = String(out['out.svg']);
      assert.ok(/>Mount<tspan [^>]*>Rainier<\/tspan>/.test(svg), svg);
      assert.equal(svg.indexOf('wbr'), -1);
    });
  });
});
