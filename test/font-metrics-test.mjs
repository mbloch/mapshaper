import api from '../mapshaper.js';
import assert from 'assert';

// Through the bundle, not the source modules: these read the filesystem and
// load fontkit through the require shim, which is a stub in an ES module.
var {findFontFace, pickFace, parseFontStretch, normalizeFamilyName,
  getFaceFamilies, clearFontCache, measureLabelText, getFontSizeInPx,
  getLetterSpacingInPx, getFontWeight, isItalic, getVariationSettings,
  clearMeasuredFontCache} = api.internal.fonts;

// Fonts that most machines have one of. The measurements below are written as
// relations rather than numbers -- twice the size is twice the width -- so that
// they hold whichever of these the machine running them turns out to have.
var LIKELY_FONTS = ['Helvetica', 'Arial', 'DejaVu Sans', 'Liberation Sans',
  'Verdana', 'Tahoma'];

// "AV" is kerned in every one of the fonts above, and in almost any text font.
var KERNED = 'AVAVAV';

function findAFont() {
  for (var i = 0; i < LIKELY_FONTS.length; i++) {
    if (findFontFace(LIKELY_FONTS[i], 400, false)) return LIKELY_FONTS[i];
  }
  return null;
}

function measure(family, text, extra) {
  return measureLabelText(Object.assign({
    'label-text': text,
    'font-family': family
  }, extra));
}

describe('Font metrics in Node', function () {

  describe('pickFace()', function () {
    var faces = [
      {name: 'light', weight: 300, italic: false},
      {name: 'light italic', weight: 300, italic: true},
      {name: 'regular', weight: 400, italic: false},
      {name: 'bold', weight: 700, italic: false},
      {name: 'bold italic', weight: 700, italic: true}
    ];

    it('takes the face that was asked for', function () {
      assert.equal(pickFace(faces, 700, false).name, 'bold');
      assert.equal(pickFace(faces, 300, true).name, 'light italic');
    });

    it('defaults to regular upright', function () {
      assert.equal(pickFace(faces, 0, false).name, 'regular');
    });

    it('keeps the slant and gives up the weight', function () {
      // Asking for Medium Italic in a font with no medium: slant is the more
      // visible of the two and the one chosen on purpose, so Bold Italic
      // answers it rather than the upright Regular that is nearer in weight.
      assert.equal(pickFace(faces, 500, true).name, 'bold italic');
    });

    it('breaks a tie in weight towards the heavier face', function () {
      // 350 is as near 300 as it is 400; a display face is more often missing
      // its lighter weights than its heavier ones.
      assert.equal(pickFace(faces, 350, false).name, 'regular');
    });

    it('has nothing to give for a family with no faces', function () {
      assert.equal(pickFace([], 400, false), null);
      assert.equal(pickFace(null, 400, false), null);
    });

    it('takes the width before the weight, the way CSS matches a font', function () {
      var wide = [
        {name: 'condensed', weight: 400, width: 3, italic: false},
        {name: 'condensed bold', weight: 700, width: 3, italic: false},
        {name: 'regular', weight: 400, width: 5, italic: false},
        {name: 'bold', weight: 700, width: 5, italic: false}
      ];
      assert.equal(pickFace(wide, 700, false, 'condensed').name, 'condensed bold');
      assert.equal(pickFace(wide, 400, false).name, 'regular');
    });
  });

  describe('parseFontStretch()', function () {
    it('reads the keyword widths', function () {
      assert.equal(parseFontStretch('condensed'), 3);
      assert.equal(parseFontStretch('normal'), 5);
      assert.equal(parseFontStretch('ultra-expanded'), 9);
    });

    it('takes a percentage to the nearest width class', function () {
      assert.equal(parseFontStretch('75%'), 3);
      assert.equal(parseFontStretch('85%'), 4); // nearer semi-condensed's 87.5
      assert.equal(parseFontStretch('200%'), 9);
    });

    it('is normal width for anything it cannot read', function () {
      assert.equal(parseFontStretch(''), 5);
      assert.equal(parseFontStretch(null), 5);
      assert.equal(parseFontStretch('quite wide'), 5);
    });
  });

  describe('normalizeFamilyName()', function () {
    it('compares names without spaces, case or punctuation', function () {
      // Vendors are not consistent about any of the three: the file called
      // NYTFranklinLight.otf calls its family "NYTFranklin Light".
      assert.equal(normalizeFamilyName('NYT Franklin'),
        normalizeFamilyName('NYTFranklin'));
      assert.equal(normalizeFamilyName('Helvetica Neue'), 'helveticaneue');
      assert.equal(normalizeFamilyName('PT_Sans-Web'), 'ptsansweb');
    });

    it('is empty for a name that is not one', function () {
      assert.equal(normalizeFamilyName(''), '');
      assert.equal(normalizeFamilyName(null), '');
      assert.equal(normalizeFamilyName(undefined), '');
    });
  });

  describe('getFaceFamilies()', function () {
    it('indexes the typographic family as well as the font family', function () {
      // What makes NYTFranklin findable: each weight is its own ID 1 family
      // ("NYTFranklin Light"), and they are one family only under ID 16.
      var families = getFaceFamilies({
        name: {records: {
          fontFamily: {en: 'NYTFranklin Light'},
          preferredFamily: {en: 'NYTFranklin'}
        }},
        familyName: 'NYTFranklin Light'
      });
      assert.ok(families.indexOf('NYTFranklin') > -1, families);
      assert.ok(families.indexOf('NYTFranklin Light') > -1, families);
    });

    it('reads a name record that is a plain string', function () {
      assert.deepEqual(getFaceFamilies({name: {records: {fontFamily: 'Georgia'}}}),
        ['Georgia']);
    });

    it('has nothing for a font with no name table', function () {
      assert.deepEqual(getFaceFamilies({}), []);
      assert.deepEqual(getFaceFamilies(null), []);
    });
  });

  describe('reading a record', function () {
    it('takes the size the label is drawn at', function () {
      assert.equal(getFontSizeInPx({'font-size': 18}), 18);
      assert.equal(getFontSizeInPx({'font-size': '18px'}), 18);
      assert.equal(getFontSizeInPx({'font-size': '2em'}), 24); // of the default 12
      assert.equal(getFontSizeInPx({'font-size': '9pt'}), 12);
    });

    it('falls back to the size the layer supplies', function () {
      // A label with no size of its own is drawn at the layer group's size,
      // which is the same default the renderer resolves em offsets against.
      assert.equal(getFontSizeInPx({}), 12);
      assert.equal(getFontSizeInPx({'font-size': ''}), 12);
      assert.equal(getFontSizeInPx({'font-size': '80%'}), 12); // not a unit it reads
    });

    it('reads letter-spacing against the label\'s own size', function () {
      assert.equal(getLetterSpacingInPx({'letter-spacing': 2}, 24), 2);
      assert.ok(Math.abs(getLetterSpacingInPx({'letter-spacing': '0.1em'}, 24) - 2.4) < 1e-9);
      assert.equal(getLetterSpacingInPx({}, 24), 0);
    });

    it('reads a weight named or numbered', function () {
      assert.equal(getFontWeight({'font-weight': 'bold'}), 700);
      assert.equal(getFontWeight({'font-weight': 300}), 300);
      assert.equal(getFontWeight({'font-weight': '600'}), 600);
      assert.equal(getFontWeight({}), 400);
      assert.equal(getFontWeight({'font-weight': 'heavyish'}), 400);
    });

    it('reads a slant', function () {
      assert.ok(isItalic({'font-style': 'italic'}));
      assert.ok(isItalic({'font-style': 'oblique'}));
      assert.ok(!isItalic({'font-style': 'normal'}));
      assert.ok(!isItalic({}));
    });
  });

  describe('getVariationSettings()', function () {
    var axes = {wght: {min: 100, default: 400, max: 900}};

    it('sets a variable font to the weight the label asks for', function () {
      // One file covers the range, and its glyphs are wider at the heavy end:
      // measuring the default instance would report Regular widths for Bold.
      assert.deepEqual(getVariationSettings(axes, 700), {wght: 700});
    });

    it('clamps to the axis, the way a browser does', function () {
      assert.deepEqual(getVariationSettings(axes, 1000), {wght: 900});
      assert.deepEqual(getVariationSettings(axes, 50), {wght: 100});
    });

    it('leaves a font that is already at that weight alone', function () {
      assert.equal(getVariationSettings(axes, 400), null);
    });

    it('has nothing to set for a font that is not variable', function () {
      assert.equal(getVariationSettings({}, 700), null);
      assert.equal(getVariationSettings(null, 700), null);
      assert.equal(getVariationSettings({wdth: {min: 50, default: 100, max: 200}}, 700), null);
    });
  });

  describe('measureLabelText()', function () {
    var font;

    before(function () {
      font = findAFont();
    });

    beforeEach(function () {
      if (!font) this.skip(); // a machine with none of the fonts above
    });

    it('measures the text of a label', function () {
      assert.ok(measure(font, 'Reno') > 0);
      assert.ok(measure(font, 'Reno Nevada') > measure(font, 'Reno'));
    });

    it('scales with the size the label is drawn at', function () {
      var small = measure(font, 'Reno', {'font-size': 12});
      var large = measure(font, 'Reno', {'font-size': 24});
      assert.ok(Math.abs(large - small * 2) < 1e-9, small + ' ' + large);
    });

    it('adds letter-spacing after every character, including the last', function () {
      // What the browser does: 2px of spacing on a four-character label widens
      // it by 8px, not 6.
      var plain = measure(font, 'Reno');
      var spaced = measure(font, 'Reno', {'letter-spacing': 2});
      assert.ok(Math.abs(spaced - plain - 8) < 1e-9, plain + ' ' + spaced);
    });

    it('kerns, the way a browser lays text out', function () {
      // Advance widths alone are out by a few percent on text like this, and
      // the alignment correction is a fraction of the number being measured.
      var kerned = measure(font, KERNED);
      var loose = Array.from(KERNED).reduce(function(sum, ch) {
        return sum + measure(font, ch);
      }, 0);
      assert.ok(kerned < loose, kerned + ' ' + loose);
    });

    it('measures a multi-line label as its widest line', function () {
      var wide = measure(font, 'Reno Nevada');
      assert.equal(measure(font, 'Reno\nReno Nevada'), wide);
      assert.equal(measure(font, 'Reno Nevada\nReno'), wide);
      // The renderer accepts all three of these as newlines.
      assert.equal(measure(font, 'Reno<br>Reno Nevada'), wide);
    });

    it('takes the first font in the list that this machine has', function () {
      assert.equal(measure('Nonesuch Sans, ' + font, 'Reno'),
        measure(font, 'Reno'));
    });

    it('measures a bold label as bolder than a regular one', function () {
      // Where the font has a bold face this is wider; where it has none the
      // nearest face answers and the two are equal. Either is a measurement of
      // something real, which is what the assertion is about.
      var regular = measure(font, 'Reno Nevada');
      var bold = measure(font, 'Reno Nevada', {'font-weight': 'bold'});
      assert.ok(bold >= regular, regular + ' ' + bold);
    });

    it('has no width for a label with no text', function () {
      assert.equal(measure(font, ''), null);
      assert.equal(measureLabelText({'font-family': font}), null);
      assert.equal(measureLabelText(null), null);
    });
  });

  // The two features a width is for, driven the way a script drives them. Both
  // fell back to their unmeasured behaviour outside the GUI until Node could
  // read font files.
  describe('through the command line', function () {
    var font;

    before(function () {
      font = findAFont();
    });

    beforeEach(function () {
      if (!font) this.skip();
      // Re-installed rather than assumed: another test file in this worker may
      // have left its own measure function -- or none -- on the bundle.
      api.internal.fonts.initNodeTextMeasurement();
      api.internal.svg.clearTextWidthCache();
    });

    async function svg(cmd, width) {
      var out = await api.applyCommands(cmd + ' -o out.svg width=' + (width || 400), {
        'point.json': JSON.stringify({
          type: 'Feature',
          properties: {'label-text': 'North\nDakota'},
          geometry: {type: 'Point', coordinates: [0, 0]}
        })
      });
      return String(out['out.svg']);
    }

    function getX(str) {
      return Number(/<text [^>]*\bx="(-?[.0-9]+)"/.exec(str)[1]);
    }

    it('label-align holds the block where its position put it', function (done) {
      var cmd = '-i point.json -style font-family="' + font +
        '" label-pos=n font-size=12 ';
      svg(cmd).then(function(centred) {
        return svg(cmd + 'label-align=left ').then(function(aligned) {
          // Left-justifying the lines moves text-anchor to the start of the
          // widest line, and the correction is half that line's measured width
          // back again -- so the block stays put and its lines re-justify.
          assert.ok(/text-anchor="middle"/.test(centred), centred);
          assert.ok(/text-anchor="start"/.test(aligned), aligned);
          assert.equal(getX(centred), 0);
          assert.ok(getX(aligned) < -10, getX(aligned));
          done();
        });
      }).catch(done);
    });

    it('a path label longer than its curve is dropped', async function () {
      var long = 'Reno Nevada and a great deal more text than ever fits';
      var curve = '-add-label coordinates=0,0,50,40,100,0 text=';
      var style = ' -style font-family="' + font + '" font-size=12 ';
      // A curve about 130px long in the output, which four characters fit on
      // in any font and fifty do not: text is exported at its native size, so
      // the output size is what decides.
      var fits = await svg(curve + 'Reno' + style, 120);
      var overflows = await svg(curve + '"' + long + '"' + style, 120);
      assert.equal((fits.match(/<textPath/g) || []).length, 1);
      assert.equal((overflows.match(/<textPath/g) || []).length, 0);
    });
  });

  describe('a machine with the font missing', function () {
    var fontPath;

    beforeEach(function () {
      // Pointing the lookup at nothing, which is what a container without its
      // fonts installed looks like, and what every reader of a measurement
      // already has a fallback for.
      fontPath = process.env.MAPSHAPER_FONT_PATH;
      process.env.MAPSHAPER_FONT_PATH = '/mapshaper-no-such-font-dir';
      clearFontCache();
      clearMeasuredFontCache();
    });

    afterEach(function () {
      if (fontPath === undefined) {
        delete process.env.MAPSHAPER_FONT_PATH;
      } else {
        process.env.MAPSHAPER_FONT_PATH = fontPath;
      }
      clearFontCache();
      clearMeasuredFontCache();
    });

    it('has no width to give, rather than a wrong one', function () {
      assert.equal(measure('Helvetica', 'Reno'), null);
      assert.equal(measure('sans-serif', 'Reno'), null);
    });

    it('finds no face', function () {
      assert.equal(findFontFace('Helvetica', 400, false), null);
    });
  });
});
