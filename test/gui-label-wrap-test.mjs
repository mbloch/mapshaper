import assert from 'assert';
import {
  decodeLabelText, readSoftBreaks, insertSoftBreaks, sameSoftBreaks,
  findSoftBreaks, getRenderedLines, getRenderedText, TEXT_PLACEHOLDER,
  LINES_STACKED
} from '../src/gui/gui-label-text';
import { getAddLabelCommand, getLabelTextCommand } from '../src/gui/gui-label-commands';

var P = TEXT_PLACEHOLDER;

describe('gui-label-text soft breaks', function () {

  describe('decodeLabelText()', function () {
    it('drops soft breaks, leaving the text as typed', function () {
      assert.equal(decodeLabelText('Mount Rainier <wbr>National Park'),
        'Mount Rainier National Park');
      assert.equal(decodeLabelText('a <WBR>b\\nc'), 'a b\nc');
    });
  });

  describe('readSoftBreaks()', function () {
    it('returns the offsets of soft breaks in the text as typed', function () {
      assert.deepEqual(readSoftBreaks('Mount Rainier <wbr>National <wbr>Park'), {
        text: 'Mount Rainier National Park',
        breaks: [14, 23]
      });
    });

    it('counts a hard break as one character', function () {
      assert.deepEqual(readSoftBreaks('ab\\ncd <wbr>ef'), {
        text: 'ab\ncd ef', breaks: [6]
      });
      assert.deepEqual(readSoftBreaks('ab<br>cd <wbr>ef'), {
        text: 'ab\ncd ef', breaks: [6]
      });
    });

    it('handles empty values', function () {
      assert.deepEqual(readSoftBreaks(''), {text: '', breaks: []});
      assert.deepEqual(readSoftBreaks(null), {text: '', breaks: []});
    });
  });

  describe('insertSoftBreaks()', function () {
    it('is the inverse of readSoftBreaks()', function () {
      var val = 'Mount Rainier <wbr>National <wbr>Park\nEst. <wbr>1899';
      var o = readSoftBreaks(val);
      assert.equal(insertSoftBreaks(o.text, o.breaks), val);
    });

    it('leaves text with no breaks alone', function () {
      assert.equal(insertSoftBreaks('a b', []), 'a b');
    });

    it('marks a break within a word', function () {
      assert.equal(insertSoftBreaks('abcdef', [3]), 'abc<wbr>def');
    });
  });

  describe('sameSoftBreaks()', function () {
    it('compares offsets', function () {
      assert(sameSoftBreaks([], []));
      assert(sameSoftBreaks([3, 7], [3, 7]));
      assert(!sameSoftBreaks([3], [4]));
      assert(!sameSoftBreaks([3], []));
    });
  });

  describe('getRenderedLines()', function () {
    it('starts a line at each soft break, keeping the space it broke at', function () {
      assert.deepEqual(getRenderedLines('Mount Rainier National Park', [14, 23]),
        ['Mount Rainier ', 'National ', 'Park']);
    });

    it('prefixes only lines started by a hard break with the placeholder', function () {
      assert.deepEqual(getRenderedLines('ab cd\nef gh', [3, 9]),
        ['ab ', 'cd', P + 'ef ', 'gh']);
    });

    it('keeps the rendered characters one-for-one with the edited ones', function () {
      var text = 'ab cd\nef gh';
      assert.equal(getRenderedLines(text, [3, 9]).join(''),
        getRenderedText(text, LINES_STACKED));
    });

    it('ignores a soft break at the start of a line or the end of the text', function () {
      assert.deepEqual(getRenderedLines('ab\ncd', [3, 5]), ['ab', P + 'cd']);
      assert.deepEqual(getRenderedLines('ab', [0]), ['ab']);
    });

    it('is unchanged without breaks', function () {
      assert.deepEqual(getRenderedLines('ab\n\ncd'), ['ab', P, P + 'cd']);
      assert.deepEqual(getRenderedLines(''), [P]);
    });
  });

  describe('findSoftBreaks()', function () {
    // tops for a text laid out as lines of @lens characters, 30px apart
    function tops(lens) {
      var out = [];
      lens.forEach(function(n, line) {
        for (var i = 0; i < n; i++) out.push(line * 30);
      });
      return function(i) { return out[i]; };
    }

    it('finds the characters that start a lower line', function () {
      // "ab cd ef" as "ab " / "cd " / "ef"
      assert.deepEqual(findSoftBreaks('ab cd ef', tops([3, 3, 2]), 18), [3, 6]);
    });

    it('does not report a line started by a newline', function () {
      // "ab\ncd" -- the newline has a box on neither line
      var t = [0, 0, null, 30, 30];
      assert.deepEqual(findSoftBreaks('ab\ncd', function(i) { return t[i]; }, 18), []);
    });

    it('reports a wrap in the line after a newline', function () {
      var t = [0, 0, null, 30, 30, 30, 60, 60];
      assert.deepEqual(findSoftBreaks('ab\ncd ef', function(i) { return t[i]; }, 18), [6]);
    });

    it('ignores small shifts within a line', function () {
      var t = [0, 2, -3, 0];
      assert.deepEqual(findSoftBreaks('abcd', function(i) { return t[i]; }, 18), []);
    });

    it('puts a break at the next character with a box', function () {
      var t = [0, 0, null, 30];
      assert.deepEqual(findSoftBreaks('ab\u200bc', function(i) { return t[i]; }, 18), [3]);
    });

    it('does not ask about the second half of a surrogate pair', function () {
      var asked = [];
      findSoftBreaks('a\ud83d\ude00b', function(i) { asked.push(i); return 0; }, 18);
      assert.deepEqual(asked, [0, 1, 3]);
    });
  });

  describe('commands', function () {
    it('saves text with its soft breaks', function () {
      assert.equal(getLabelTextCommand('ab <wbr>cd\nef', 2, 'labels'),
        "-style label-text='ab <wbr>cd\\nef' ids=2 target='labels'");
    });

    it('gives a new path label no label-width', function () {
      var cmd = getAddLabelCommand([[0, 0], [1, 1]], {
        text: 'a', style: {'label-width': 80, 'font-size': 12}
      });
      assert(!/label-width/.test(cmd));
      cmd = getAddLabelCommand([[0, 0]], {
        text: 'a <wbr>b', style: {'label-width': 80}
      });
      assert(/label-width='80'/.test(cmd));
      assert(/text='a <wbr>b'/.test(cmd));
    });
  });
});
