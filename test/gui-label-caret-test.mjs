import assert from 'assert';
import api from '../mapshaper.js';
import {
  getCaretGeometry, getSelectionRects, getLabelBox, getCaretIndexAtPoint,
  growBoxToCaret
} from '../src/gui/gui-label-caret';
import {
  decodeLabelText, encodeLabelText, getRenderedLines, getRenderedText,
  textHasNoGlyphs, stripPlaceholder, getRenderedCaret, getRenderedLength,
  getEditIndex, TEXT_PLACEHOLDER, LINES_JOINED, LINES_STACKED
} from '../src/gui/gui-label-text';
import {
  getLabelTextCommand, getLabelDeleteCommand
} from '../src/gui/gui-label-commands';

// A stand-in for a rendered <text> node. Characters are 10px wide on a baseline
// at y=100, starting at x=0, which makes the expected geometry easy to state.
//
// opts.rendered: how many characters the engine claims to have laid out
// opts.engine: how it fails for the rest --
//   'webkit'   throws IndexSizeError, and reports only fitting glyphs
//   'chromium' returns a degenerate (0,0) with no error and the full count
//   'firefox'  clamps to the last fitting glyph
// opts.angles: per-character rotation
function fakeText(text, opts) {
  var o = opts || {};
  var n = text.length;
  var rendered = o.rendered === undefined ? n : o.rendered;
  var engine = o.engine || 'chromium';
  var W = 10, BASELINE = 100, FONT_SIZE = 20;

  function fits(i) {
    return i >= 0 && i < rendered;
  }

  function point(i, atEnd) {
    if (!fits(i)) {
      if (engine == 'webkit') throw indexSizeError();
      if (engine == 'firefox') i = rendered - 1;
      if (engine == 'chromium') return {x: 0, y: 0};
    }
    return {x: (i + (atEnd ? 1 : 0)) * W, y: BASELINE};
  }

  return {
    startOfChar: function(i) { return point(i, false); },
    endOfChar: function(i) { return point(i, true); },
    rotationOfChar: function(i) { return o.angles ? o.angles[i] || 0 : 0; },
    extentOfChar: function(i) {
      if (!fits(i)) {
        if (engine == 'webkit') throw indexSizeError();
        return {x: 0, y: 0, width: 0, height: 0};
      }
      return {x: i * W, y: BASELINE - 16, width: W, height: 20};
    },
    charAtPoint: function(p) {
      var i = Math.floor(p.x / W);
      return i >= 0 && i < rendered ? i : -1;
    },
    renderedCount: function() {
      // this is the divergence that matters most: WebKit under-reports
      return engine == 'webkit' ? rendered : n;
    },
    fontSize: function() { return FONT_SIZE; },
    anchor: function() { return {x: 0, y: BASELINE}; }
  };
}

function indexSizeError() {
  var e = new Error('Index or size was negative, or greater than the allowed value.');
  e.name = 'IndexSizeError';
  return e;
}

describe('gui label caret and text', function() {

  describe('getCaretGeometry()', function() {
    // caret requests, as getRenderedCaret() produces them
    function before(i, n) { return {index: i, atEnd: false, length: n}; }
    function after(i, n) { return {index: i, atEnd: true, length: n}; }

    it('puts the caret before the character at the index', function() {
      var caret = getCaretGeometry(fakeText('hello'), before(2, 5));
      assert.equal(caret.x, 20);
      assert.equal(caret.y, 100);
    });

    it('puts the caret at the very start for index 0', function() {
      assert.equal(getCaretGeometry(fakeText('hello'), before(0, 5)).x, 0);
    });

    it('puts the caret past the last character at the end', function() {
      assert.equal(getCaretGeometry(fakeText('hello'), after(4, 5)).x, 50);
    });

    it('clamps an index beyond the text', function() {
      assert.equal(getCaretGeometry(fakeText('hello'), before(99, 5)).x, 40);
      assert.equal(getCaretGeometry(fakeText('hello'), before(-3, 5)).x, 0);
    });

    it('sizes the caret from the font size', function() {
      var caret = getCaretGeometry(fakeText('hello'), before(0, 5));
      assert.equal(caret.ascent, 16); // 0.8 em
      assert.equal(caret.descent, 4); // 0.2 em
    });

    it('tilts the caret on a curve', function() {
      var caret = getCaretGeometry(fakeText('hello', {angles: [0, 12, 25]}),
        before(2, 5));
      assert.equal(caret.angle, 25);
    });

    it('falls back to the anchor for an empty label', function() {
      // there are no glyphs to measure, and without this the caret would vanish
      // and a freshly created label would show nothing at all
      var caret = getCaretGeometry(fakeText(''), before(0, 0));
      assert.equal(caret.x, 0);
      assert.equal(caret.y, 100);
      assert.equal(caret.ascent, 16);
    });

    describe('a character with no advance of its own', function() {
      // The placeholder that opens a new line has no width, which is
      // indistinguishable from the way Chromium reports a character it did not
      // lay out. Only the caller knows which it is.
      //
      // 'ab' + placeholder: the engine lays out all three, but the third
      // measures as zero-width, here at the start of the line below.
      function twoLines() {
        var inner = fakeText('abX', {rendered: 3});
        return Object.assign({}, inner, {
          startOfChar: function(i) { return i == 2 ? {x: 0, y: 122} : inner.startOfChar(i); },
          endOfChar: function(i) { return i == 2 ? {x: 0, y: 122} : inner.endOfChar(i); }
        });
      }

      it('walks back off it when the caller does not vouch for it', function() {
        var caret = getCaretGeometry(twoLines(), after(2, 3));
        assert.equal(caret.y, 100); // stranded on the line above
      });

      it('sits on it when the caller marks it zero-width', function() {
        var caret = getCaretGeometry(twoLines(),
          {index: 2, atEnd: true, length: 3, zeroWidth: true});
        assert.equal(caret.x, 0);
        assert.equal(caret.y, 122); // on the line the user just opened
      });
    });

    describe('a path label whose text overflows', function() {
      // only 3 of 8 characters fit, which each engine reports differently

      it('keeps the caret on the last visible character in WebKit', function() {
        // WebKit throws past the last fitting glyph
        var caret = getCaretGeometry(
          fakeText('overflow', {rendered: 3, engine: 'webkit'}), after(7, 8));
        assert.equal(caret.x, 30);
      });

      it('keeps the caret on the last visible character in Chromium', function() {
        // Chromium reports the full count and returns (0,0) with no error, so
        // catching an exception is not enough to notice
        var caret = getCaretGeometry(
          fakeText('overflow', {rendered: 3, engine: 'chromium'}), after(7, 8));
        assert.equal(caret.x, 30, 'not dragged to the origin');
      });

      it('does not clamp the caret index to the visible characters', function() {
        // the index is the model's; if it were clamped by what is rendered the
        // tail of the text would become uneditable
        var provider = fakeText('overflow', {rendered: 3, engine: 'webkit'});
        assert.ok(getCaretGeometry(provider, after(7, 8)));
        assert.equal(getCaretGeometry(provider, before(1, 8)).x, 10,
          'an index inside the visible run is still exact');
      });

      it('falls back to the anchor when nothing is rendered at all', function() {
        var caret = getCaretGeometry(
          fakeText('overflow', {rendered: 0, engine: 'webkit'}), before(4, 8));
        assert.equal(caret.x, 0);
        assert.equal(caret.y, 100);
      });
    });
  });

  describe('getSelectionRects()', function() {
    it('merges a run on one line into a single rect', function() {
      var rects = getSelectionRects(fakeText('hello'), 0, 5, 5);
      assert.equal(rects.length, 1);
      assert.deepEqual(rects[0], {x: 0, y: 84, width: 50, height: 20});
    });

    it('covers only the selected characters', function() {
      var rects = getSelectionRects(fakeText('hello'), 1, 3, 5);
      assert.deepEqual(rects, [{x: 10, y: 84, width: 20, height: 20}]);
    });

    it('accepts a backwards selection', function() {
      assert.deepEqual(getSelectionRects(fakeText('hello'), 3, 1, 5),
        getSelectionRects(fakeText('hello'), 1, 3, 5));
    });

    it('returns nothing for an empty selection', function() {
      assert.deepEqual(getSelectionRects(fakeText('hello'), 2, 2, 5), []);
    });

    it('breaks the band where the characters step to another line', function() {
      var provider = fakeText('abcd');
      var real = provider.extentOfChar;
      provider.extentOfChar = function(i) {
        var box = real(i);
        if (i >= 2) { box.y += 24; box.x -= 20; } // a second line
        return box;
      };
      var rects = getSelectionRects(provider, 0, 4, 4);
      assert.equal(rects.length, 2);
      assert.equal(rects[0].width, 20);
      assert.equal(rects[1].width, 20);
    });

    it('skips characters an overflowing path cannot measure', function() {
      var rects = getSelectionRects(
        fakeText('overflow', {rendered: 3, engine: 'webkit'}), 0, 8, 8);
      assert.equal(rects.length, 1);
      assert.equal(rects[0].width, 30, 'only the visible run is banded');
    });
  });

  describe('getLabelBox()', function() {
    it('pads the measured bounds of the text', function() {
      var box = getLabelBox(fakeText('hello'),
        {x: 0, y: 84, width: 50, height: 20}, 5, 2);
      assert.deepEqual(box, {x: -2, y: 82, width: 54, height: 24});
    });

    it('gives an empty label a box at its anchor', function() {
      // otherwise a label that was just created is invisible, and the user has
      // no idea a click did anything
      var box = getLabelBox(fakeText(''), {x: 0, y: 0, width: 0, height: 0}, 0, 2);
      assert.equal(box.x, -2);
      assert.equal(box.height, 24); // ascent + descent + padding
      assert.ok(box.width > 0);
    });

    it('ignores measured bounds that collapsed', function() {
      var box = getLabelBox(fakeText(''), null, 0, 2);
      assert.ok(box && box.width > 0);
    });
  });

  describe('growBoxToCaret()', function() {
    var box = {x: 0, y: 80, width: 50, height: 20};

    it('reaches down to a caret on a line below the text', function() {
      // pressing Enter has to show that a line was started, and the line itself
      // has nothing in it to see
      var grown = growBoxToCaret(box, {x: 0, y: 122, ascent: 16, descent: 4}, 2);
      assert.equal(grown.y, 80);
      assert.equal(grown.y + grown.height, 128);
    });

    it('leaves a box that already covers the caret alone', function() {
      assert.deepEqual(growBoxToCaret(box, {x: 20, y: 96, ascent: 12, descent: 2}, 2), box);
    });

    it('passes through when there is no caret or no box', function() {
      assert.deepEqual(growBoxToCaret(box, null, 2), box);
      assert.equal(growBoxToCaret(null, {x: 0, y: 0, ascent: 1, descent: 1}, 2), null);
    });
  });

  describe('getCaretIndexAtPoint()', function() {
    it('puts the caret before the character that was clicked', function() {
      assert.equal(getCaretIndexAtPoint(fakeText('hello'), {x: 22, y: 100}, 5), 2);
    });

    it('puts the caret after it when the far half was clicked', function() {
      assert.equal(getCaretIndexAtPoint(fakeText('hello'), {x: 27, y: 100}, 5), 3);
    });

    it('reaches the end of the text by clicking the last character', function() {
      assert.equal(getCaretIndexAtPoint(fakeText('hello'), {x: 48, y: 100}, 5), 5);
    });

    it('reports nothing for a click that misses the text', function() {
      assert.equal(getCaretIndexAtPoint(fakeText('hello'), {x: 900, y: 100}, 5), -1);
    });
  });

  describe('label text encoding', function() {
    it('stores a newline as an escape the command parser survives', function() {
      assert.equal(encodeLabelText('North\nDakota'), 'North\\nDakota');
    });

    it('reads back all three forms of line break the CLI accepts', function() {
      assert.equal(decodeLabelText('North\\nDakota'), 'North\nDakota');
      assert.equal(decodeLabelText('North<br>Dakota'), 'North\nDakota');
      assert.equal(decodeLabelText('North\nDakota'), 'North\nDakota');
      assert.equal(decodeLabelText('North\r\nDakota'), 'North\nDakota');
    });

    it('round-trips multi-line text', function() {
      var text = 'one\ntwo\nthree';
      assert.equal(decodeLabelText(encodeLabelText(text)), text);
    });

    it('treats absent text as empty', function() {
      assert.equal(decodeLabelText(undefined), '');
      assert.equal(decodeLabelText(null), '');
      assert.equal(encodeLabelText(undefined), '');
      assert.ok(textHasNoGlyphs(undefined));
      assert.ok(textHasNoGlyphs(''));
      assert.ok(!textHasNoGlyphs('a'));
    });

    // A label of nothing but whitespace draws no glyph, so it is as invisible
    // and as unfindable as one with no text at all, and the editor removes both.
    it('counts whitespace and placeholders as no glyphs', function() {
      assert.ok(textHasNoGlyphs('   '));
      assert.ok(textHasNoGlyphs('\t '));
      assert.ok(textHasNoGlyphs('\\n'));
      assert.ok(textHasNoGlyphs(' \\n  \\n '));
      assert.ok(textHasNoGlyphs(TEXT_PLACEHOLDER));
      assert.ok(textHasNoGlyphs(TEXT_PLACEHOLDER + ' ' + TEXT_PLACEHOLDER));
      assert.ok(!textHasNoGlyphs('  a  '));
      assert.ok(!textHasNoGlyphs(' \\n a'));
    });

    it('renders an empty label as a placeholder, not as no lines', function() {
      assert.deepEqual(getRenderedLines(''), [TEXT_PLACEHOLDER]);
    });

    it('opens every line after the first with the placeholder', function() {
      // an empty <tspan> lays out nothing, so a line just opened with Enter
      // would have no position for the caret to move to
      assert.deepEqual(getRenderedLines('a\\nb'), ['a', TEXT_PLACEHOLDER + 'b']);
      assert.deepEqual(getRenderedLines('a\n'), ['a', TEXT_PLACEHOLDER]);
      assert.deepEqual(getRenderedLines('a'), ['a']);
    });

    it('keeps spaces, which SVG would otherwise collapse away', function() {
      assert.deepEqual(getRenderedLines('a  b '), ['a  b ']);
      assert.equal(getRenderedText('a  b ', LINES_STACKED), 'a  b ');
    });

    it('strips the placeholder back out', function() {
      assert.equal(stripPlaceholder(TEXT_PLACEHOLDER), '');
      assert.equal(stripPlaceholder('a' + TEXT_PLACEHOLDER + 'b'), 'ab');
      assert.equal(stripPlaceholder(undefined), '');
    });
  });

  describe('caret indexes across lines', function() {
    // "ab\ncd" edits as five characters and renders as five: the break becomes
    // one substitute character, so the indexes line up
    var TEXT = 'ab\ncd';

    function caret(index, atEnd, length, zeroWidth) {
      return {index: index, atEnd: atEnd, length: length, zeroWidth: !!zeroWidth};
    }

    it('counts one rendered character per line break', function() {
      assert.equal(getRenderedLength(TEXT), 5);
      assert.equal(getRenderedLength('abcd'), 4);
      assert.equal(getRenderedLength(''), 0);
      assert.equal(getRenderedLength('a\\nb'), 3); // the stored escape form
    });

    it('maps a caret on the first line directly', function() {
      assert.deepEqual(getRenderedCaret(TEXT, 0), caret(0, false, 5));
      assert.deepEqual(getRenderedCaret(TEXT, 1), caret(1, false, 5));
    });

    it('puts a caret on the line break at the end of the line it closes', function() {
      // not at the start of the next line: one character apart, but a whole
      // line apart on the map
      assert.deepEqual(getRenderedCaret(TEXT, 2), caret(1, true, 5));
    });

    it('maps a caret after the line break onto the next line', function() {
      assert.deepEqual(getRenderedCaret(TEXT, 3), caret(3, false, 5));
    });

    it('maps the end of the text onto the end of the last glyph', function() {
      assert.deepEqual(getRenderedCaret(TEXT, 5), caret(4, true, 5));
    });

    it('clamps out-of-range indexes', function() {
      assert.deepEqual(getRenderedCaret(TEXT, 99), caret(4, true, 5));
      assert.deepEqual(getRenderedCaret(TEXT, -5), caret(0, false, 5));
    });

    it('handles an empty label', function() {
      assert.deepEqual(getRenderedCaret('', 0), caret(0, true, 0));
    });

    it('puts the caret on a line that has just been opened', function() {
      // the regression this exists for: Enter left the caret at the end of the
      // line above, because the new line rendered nothing to measure
      assert.deepEqual(getRenderedCaret('ab\n', 3), caret(2, true, 3, true));
      assert.deepEqual(getRenderedCaret('ab\n\n', 4), caret(3, true, 4, true));
    });

    it('marks the line-break placeholder as having no advance', function() {
      // a real glyph must not be marked, or an overflowing path label would
      // stop walking back to one the engine laid out
      assert.ok(!getRenderedCaret(TEXT, 1).zeroWidth);
      assert.ok(!getRenderedCaret(TEXT, 5).zeroWidth);
      assert.ok(getRenderedCaret('ab\n', 3).zeroWidth);
    });

    it('keeps a space as a rendered character', function() {
      // SVG's default whitespace handling would drop the trailing one, and then
      // typing a space moved nothing and the caret stayed put
      assert.equal(getRenderedLength('ab '), 3);
      assert.deepEqual(getRenderedCaret('ab ', 3), caret(2, true, 3));
      assert.equal(getRenderedLength('a  b'), 4);
    });

    it('maps a clicked glyph back onto an edit index', function() {
      assert.equal(getEditIndex(TEXT, 0), 0);
      assert.equal(getEditIndex(TEXT, 3), 3); // first glyph of the second line
      assert.equal(getEditIndex(TEXT, 5), 5); // past the last glyph
      assert.equal(getEditIndex(TEXT, 99), 5);
      assert.equal(getEditIndex(TEXT, -1), 0);
    });

    it('round-trips a click on every glyph', function() {
      var rendered = getRenderedText(TEXT, LINES_STACKED);
      for (var r = 0; r < rendered.length; r++) {
        // the placeholder standing in for the break has no width, so no click
        // can land on it and it has no round trip to check
        if (rendered.charAt(r) === TEXT_PLACEHOLDER) continue;
        assert.equal(getRenderedCaret(TEXT, getEditIndex(TEXT, r)).index, r);
      }
    });

    describe('a path label, whose lines are joined rather than stacked', function() {
      // a <tspan> inside a <textPath> advances along the curve instead of
      // dropping below it, so export joins the lines with a space and so does
      // the editor
      it('renders the line break as a space', function() {
        assert.equal(getRenderedLength(TEXT, LINES_JOINED), 5);
        assert.equal(getRenderedText(TEXT, LINES_JOINED), 'ab cd');
      });

      it('maps caret indexes one to one', function() {
        // no line to drop to, so a caret on the break sits before its space
        assert.deepEqual(getRenderedCaret(TEXT, 2, LINES_JOINED),
          caret(2, false, 5));
        assert.deepEqual(getRenderedCaret(TEXT, 3, LINES_JOINED),
          caret(3, false, 5));
        assert.deepEqual(getRenderedCaret(TEXT, 5, LINES_JOINED),
          caret(4, true, 5));
      });

      it('never marks a character as having no advance', function() {
        // its substitute for a break is a real space, which has one
        assert.ok(!getRenderedCaret(TEXT, 2, LINES_JOINED).zeroWidth);
        assert.ok(!getRenderedCaret('ab\n', 3, LINES_JOINED).zeroWidth);
      });

      it('maps clicks back one to one', function() {
        assert.equal(getEditIndex(TEXT, 2, LINES_JOINED), 2);
        assert.equal(getEditIndex(TEXT, 4, LINES_JOINED), 4);
      });

      it('agrees with the stacked layout when there are no line breaks', function() {
        assert.equal(getRenderedLength('Reno', LINES_JOINED),
          getRenderedLength('Reno', LINES_STACKED));
        assert.deepEqual(getRenderedCaret('Reno', 2, LINES_JOINED),
          getRenderedCaret('Reno', 2, LINES_STACKED));
      });
    });
  });

  describe('getLabelTextCommand()', function() {
    it('saves the text of one label', function() {
      assert.equal(getLabelTextCommand('Reno', 3, 'places'),
        "-style label-text='Reno' ids=3 target='places'");
    });

    it('omits the target when there is not one', function() {
      assert.equal(getLabelTextCommand('Reno', 0, null),
        "-style label-text='Reno' ids=0");
    });

    it('escapes a newline rather than breaking the command', function() {
      assert.equal(getLabelTextCommand('North\nDakota', 1, null),
        "-style label-text='North\\nDakota' ids=1");
    });

    it('quotes an apostrophe', function() {
      assert.ok(getLabelTextCommand("Martha's", 1, null)
        .includes("label-text='Martha\\'s'"));
    });

    describe('the commands it writes actually run', function() {
      async function runOn(text) {
        var input = {
          type: 'Feature',
          properties: {'label-text': 'before'},
          geometry: {type: 'Point', coordinates: [0, 0]}
        };
        var cmd = '-i in.json name=places ' +
          getLabelTextCommand(text, 0, 'places') + ' -o out.json';
        var out = await api.applyCommands(cmd, {'in.json': JSON.stringify(input)});
        return JSON.parse(out['out.json']).features[0].properties['label-text'];
      }

      it('plain text', async function() {
        assert.equal(await runOn('Reno'), 'Reno');
      });

      it('text with an apostrophe', async function() {
        assert.equal(await runOn("Martha's Vineyard"), "Martha's Vineyard");
      });

      it('multi-line text, which reads back as newlines', async function() {
        // the stored value is the escape, and decoding it returns what was typed
        assert.equal(await runOn('North\nDakota'), 'North\\nDakota');
        assert.equal(decodeLabelText(await runOn('North\nDakota')), 'North\nDakota');
      });

      it('text cleared to empty', async function() {
        assert.equal(await runOn(''), '');
      });
    });
  });

  describe('getLabelDeleteCommand()', function() {
    it('removes one label by id', function() {
      assert.equal(getLabelDeleteCommand(3, 'places'),
        "-filter 'this.id !== 3' target='places'");
    });

    it('omits the target when there is not one', function() {
      assert.equal(getLabelDeleteCommand(0, null), "-filter 'this.id !== 0'");
    });

    it('removes the named label and leaves the rest, ids closing up', async function() {
      var input = {
        type: 'FeatureCollection',
        features: [0, 1, 2].map(function(i) {
          return {
            type: 'Feature',
            properties: {'label-text': 'abc'.charAt(i)},
            geometry: {type: 'Point', coordinates: [i, i]}
          };
        })
      };
      var out = await api.applyCommands('-i in.json name=places ' +
        getLabelDeleteCommand(1, 'places') + ' -o out.json',
      {'in.json': JSON.stringify(input)});
      var features = JSON.parse(out['out.json']).features;
      assert.deepEqual(features.map(function(f) {
        return f.properties['label-text'];
      }), ['a', 'c']);
      // the geometry goes with the record, which is the point of using -filter
      assert.deepEqual(features[1].geometry.coordinates, [2, 2]);
    });
  });
});
