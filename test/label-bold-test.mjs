import api from '../mapshaper.js';
import assert from 'assert';
import {
  readLabelValue, writeLabelValue, getWordRange
} from '../src/gui/gui-label-text';
import {
  isBoldAt, rangeIsAllBold, setBoldRange, toggleBoldRange, updateBoldForEdit
} from '../src/gui/gui-label-bold';

var svg = api.internal.svg;

function render(text, rec) {
  return svg.stringify(svg.renderLabel(Object.assign({'label-text': text}, rec)));
}

async function exportSvg(cmd) {
  var out = await api.applyCommands(cmd + ' -o out.svg');
  return String(out['out.svg']);
}

describe('Bold words in label text', function () {

  describe('parseBoldMarkup()', function () {
    it('removes a pair of tags and reports what they held', function () {
      assert.deepEqual(svg.parseBoldMarkup('Israel <b>restricted</b> here'),
        {text: 'Israel restricted here', bold: [[7, 17]]});
    });

    it('reads any number of pairs, in either case', function () {
      assert.deepEqual(svg.parseBoldMarkup('<b>High</b> and <B>dry</B>'),
        {text: 'High and dry', bold: [[0, 4], [9, 12]]});
    });

    it('merges pairs that touch', function () {
      assert.deepEqual(svg.parseBoldMarkup('<b>ab</b><b>cd</b>e').bold, [[0, 4]]);
    });

    it('leaves text alone that is not a matched pair', function () {
      ['a < b', 'x <b> y', 'x </b> y', 'p<0.05', '<br>', '<bold>x</bold>'].forEach(function(str) {
        assert.deepEqual(svg.parseBoldMarkup(str), {text: str, bold: []}, str);
      });
    });

    it('does not nest, and keeps a stray opening tag as text', function () {
      assert.deepEqual(svg.parseBoldMarkup('<b>a<b>b</b>'),
        {text: '<b>ab', bold: [[4, 5]]});
    });

    it('drops an empty pair', function () {
      assert.deepEqual(svg.parseBoldMarkup('a<b></b>b'), {text: 'ab', bold: []});
    });
  });

  describe('lines and runs', function () {
    it('splits lines without the markup', function () {
      assert.deepEqual(svg.splitLabelLines('<b>North</b>\\nDakota'), ['North', 'Dakota']);
    });

    it('carries a bold stretch across a line break as a run on each line', function () {
      assert.deepEqual(svg.splitLabelLineRuns('Israel <b>restricted<wbr>access</b> here'), [
        [{text: 'Israel ', bold: false}, {text: 'restricted', bold: true}],
        [{text: 'access', bold: true}, {text: ' here', bold: false}]
      ]);
    });

    it('drops the space before a soft break from a bold run too', function () {
      assert.deepEqual(svg.splitLabelLineRuns('a <b>b </b><wbr>c')[0],
        [{text: 'a ', bold: false}, {text: 'b', bold: true}]);
      assert.deepEqual(svg.splitLabelLineRuns('a<b> </b><wbr>c')[0],
        [{text: 'a', bold: false}]);
    });
  });

  describe('rendering', function () {
    it('draws a label with no bold exactly as before', function () {
      assert.equal(render('Reno'), '<text y="0" x="0">Reno</text>');
      assert.equal(render('Reno\\nNevada'), '<text y="0" x="0">Reno' +
        '<tspan x="0" dy="1.1em">Nevada</tspan></text>');
    });

    it('draws bold words as bold tspans within the line', function () {
      assert.equal(render('Israel <b>restricted</b> here'),
        '<text y="0" x="0">Israel <tspan font-weight="bold">restricted</tspan>' +
        '<tspan> here</tspan></text>');
    });

    it('draws a bold run at the start of a line', function () {
      assert.equal(render('<b>High</b> terrain'),
        '<text y="0" x="0"><tspan font-weight="bold">High</tspan>' +
        '<tspan> terrain</tspan></text>');
    });

    it('puts runs inside the tspan of the line they fall on', function () {
      assert.equal(render('a <b>b\\nc</b> d'),
        '<text y="0" x="0">a <tspan font-weight="bold">b</tspan>' +
        '<tspan x="0" dy="1.1em"><tspan font-weight="bold">c</tspan>' +
        '<tspan> d</tspan></tspan></text>');
    });

    it('copies the runs into a halo', function () {
      var o = svg.splitLabelHalos(svg.renderStyledLabel({
        'label-text': 'a <b>b</b>', 'halo-width': 2
      }));
      var out = svg.stringify(o);
      assert.equal(out.split('<tspan font-weight="bold">b</tspan>').length, 3, out);
    });

    it('exports bold words in an anchored label', async function () {
      var out = await exportSvg('-add-label coordinates=0,0 text="Israel <b>restricted</b> here"');
      assert.ok(out.includes('Israel <tspan font-weight="bold">restricted</tspan><tspan> here</tspan>'), out);
    });

    it('exports bold words along a path', async function () {
      var out = await exportSvg('-add-label coordinates=0,0,50,10,100,0 text="along <b>the</b> ridge"');
      assert.ok(/<textPath[^>]*>along <tspan font-weight="bold">the<\/tspan><tspan> ridge<\/tspan><\/textPath>/.test(out), out);
    });

    it('joins a path label\'s lines with the markup removed', function () {
      var o = svg.renderPathLabel({'label-text': '<b>a\\nb</b> c'}, [[0, 0], [500, 0]]);
      assert.equal(svg.stringify(o.children[0]).replace(/ label-path-d="[^"]*"/, ''),
        '<textPath startOffset="50%"><tspan font-weight="bold">a b</tspan>' +
        '<tspan> c</tspan></textPath>');
    });
  });

  describe('the edited text and the stored value', function () {
    it('reads bold and soft breaks as offsets into the plain text', function () {
      assert.deepEqual(readLabelValue('Israel <b>restricted<wbr>access</b> here'), {
        text: 'Israel restrictedaccess here',
        breaks: [17],
        bold: [[7, 23]]
      });
    });

    it('reads a hard break in any of its forms', function () {
      assert.deepEqual(readLabelValue('<b>a\\nb</b><br>c'),
        {text: 'a\nb\nc', breaks: [], bold: [[0, 3]]});
    });

    it('writes them back as they were read', function () {
      ['Israel <b>restricted<wbr>access</b> here',
        'a <b>b</b><wbr>c', 'a <wbr><b>b</b>', '<b>whole</b>', 'plain<wbr>text'
      ].forEach(function(value) {
        var o = readLabelValue(value);
        assert.equal(writeLabelValue(o.text, o.breaks, o.bold), value);
      });
    });

    it('closes a bold stretch before a soft break and opens one after it', function () {
      assert.equal(writeLabelValue('ab', [1], [[0, 1]]), '<b>a</b><wbr>b');
      assert.equal(writeLabelValue('ab', [1], [[1, 2]]), 'a<wbr><b>b</b>');
    });
  });

  describe('editing bold ranges', function () {
    it('tells whether a range is all bold', function () {
      var ranges = [[2, 5], [7, 9]];
      assert.ok(rangeIsAllBold(ranges, 2, 5));
      assert.ok(rangeIsAllBold(ranges, 3, 4));
      assert.ok(!rangeIsAllBold(ranges, 4, 8));
      assert.ok(!rangeIsAllBold(ranges, 3, 3));
      assert.ok(isBoldAt(ranges, 2) && !isBoldAt(ranges, 5));
    });

    it('bolds a partly bold selection, and unbolds an all-bold one', function () {
      assert.deepEqual(toggleBoldRange([[2, 5]], 4, 8), [[2, 8]]);
      assert.deepEqual(toggleBoldRange([[2, 8]], 4, 6), [[2, 4], [6, 8]]);
      assert.deepEqual(setBoldRange([[0, 3], [5, 9]], 2, 6, true), [[0, 9]]);
    });

    it('keeps typing at the end of a bold word bold', function () {
      assert.deepEqual(updateBoldForEdit([[0, 4]], 'High ground', 'Highs ground'), [[0, 5]]);
    });

    it('does not bold typing after a bold word ends', function () {
      assert.deepEqual(updateBoldForEdit([[0, 4]], 'High ground', 'High x ground'), [[0, 4]]);
    });

    it('does not bold typing before a bold word that starts mid-text', function () {
      assert.deepEqual(updateBoldForEdit([[2, 5]], 'a high', 'a xhigh'), [[3, 6]]);
    });

    it('bolds typing at the very start of text that starts bold', function () {
      assert.deepEqual(updateBoldForEdit([[0, 4]], 'High', 'xHigh'), [[0, 5]]);
    });

    it('shrinks and drops ranges as text is deleted', function () {
      assert.deepEqual(updateBoldForEdit([[2, 6]], 'a bold c', 'a bd c'), [[2, 4]]);
      assert.deepEqual(updateBoldForEdit([[2, 6]], 'a bold c', 'a  c'), []);
      assert.deepEqual(updateBoldForEdit([[2, 6], [7, 8]], 'a bold c', 'a c'), [[2, 3]]);
    });

    it('takes the weight of the text before a paste over a selection', function () {
      assert.deepEqual(updateBoldForEdit([[0, 4]], 'bold plain', 'boldXY plain'), [[0, 6]]);
      assert.deepEqual(updateBoldForEdit([[5, 10]], 'plain bold', 'plXin bold'), [[5, 10]]);
    });
  });

  describe('getWordRange()', function () {
    it('selects the word a double-click lands in', function () {
      assert.deepEqual(getWordRange('after cease-fire.', 8), [6, 16]);
      assert.deepEqual(getWordRange('Israel\'s line', 2), [0, 8]);
    });

    it('selects the word before a click just past its end', function () {
      assert.deepEqual(getWordRange('High terrain', 4), [0, 4]);
      assert.deepEqual(getWordRange('High', 4), [0, 4]);
    });

    it('selects nothing between words', function () {
      assert.deepEqual(getWordRange('a  b', 2), [2, 2]);
    });
  });
});
