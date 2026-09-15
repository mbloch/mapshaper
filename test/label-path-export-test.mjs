import api from '../mapshaper.js';
import { getLabelTextHash, getLabelFitState } from '../src/svg/svg-label-fit';
import { getLabelPathData, featureIsPathLabel, shapeIsPathLabel,
  getLabelPathCoords } from '../src/svg/svg-label-paths';
import { Transform } from '../src/geom/mapshaper-transform';
import assert from 'assert';

async function svg(cmd) {
  var out = await api.applyCommands(cmd + ' -o out.svg width=400');
  return String(out['out.svg']);
}

function textPaths(str) {
  return str.match(/<textPath[^]*?<\/textPath>/g) || [];
}

function defPaths(str) {
  return str.match(/<path id="label-path-[^"]*"[^>]*\/>/g) || [];
}

var CURVE = '-add-label coordinates=0,0,50,40,100,0';

describe('label path export', function () {

  describe('featureIsPathLabel()', function () {
    var rec = {'label-text': 'x'};

    it('is true only for a multipoint feature with label text', function () {
      assert.ok(featureIsPathLabel({type: 'MultiPoint', coordinates: [[0, 0], [1, 1]]}, rec));
      assert.ok(!featureIsPathLabel({type: 'Point', coordinates: [0, 0]}, rec));
      assert.ok(!featureIsPathLabel({type: 'LineString', coordinates: [[0, 0], [1, 1]]}, rec));
      assert.ok(!featureIsPathLabel(null, rec));
    });

    it('a single-point multipoint is an anchored label, not a path label', function () {
      assert.ok(!featureIsPathLabel({type: 'MultiPoint', coordinates: [[0, 0]]}, rec));
    });

    it('a multipoint without label text is an ordinary multipoint', function () {
      assert.ok(!featureIsPathLabel({type: 'MultiPoint', coordinates: [[0, 0], [1, 1]]}, {r: 3}));
    });

    it('label text of 0 counts as text', function () {
      assert.ok(featureIsPathLabel({type: 'MultiPoint', coordinates: [[0, 0], [1, 1]]},
        {'label-text': 0}));
    });

    it('shapeIsPathLabel() agrees, working from a point layer shape', function () {
      // the GUI uses this form to avoid building a geometry object per shape
      var rec = {'label-text': 'x'};
      assert.ok(shapeIsPathLabel([[0, 0], [1, 1]], rec));
      assert.ok(!shapeIsPathLabel([[0, 0]], rec));
      assert.ok(!shapeIsPathLabel([[0, 0], [1, 1]], {r: 3}));
      assert.ok(!shapeIsPathLabel(null, rec));
    });

    it('the two disagree about a label with no text yet, deliberately', function () {
      // The GUI's test accepts one, because a label being typed into is a label
      // before it has any text and has to keep its curve while that is true.
      // Export has no editor and drops the empty ones.
      var geom = {type: 'MultiPoint', coordinates: [[0, 0], [1, 1]]};
      assert.ok(shapeIsPathLabel([[0, 0], [1, 1]], {'label-text': ''}));
      assert.ok(!featureIsPathLabel(geom, {'label-text': ''}));
    });
  });

  describe('getLabelPathData()', function () {
    it('emits one cubic per knot interval', function () {
      var d = getLabelPathData([[0, 0], [50, 40], [100, 0]], null);
      assert.equal(d.match(/C/g).length, 2);
      assert.ok(d.startsWith('M 0 0'), d);
    });

    it('a two-knot path is a single cubic along the chord', function () {
      assert.equal(getLabelPathData([[0, 0], [30, 0]], null), 'M 0 0 C 10 0 20 0 30 0');
    });

    it('returns null when the knots collapse to a point', function () {
      assert.equal(getLabelPathData([[5, 5], [5, 5]], null), null);
      assert.equal(getLabelPathData([[5, 5]], null), null);
      assert.equal(getLabelPathData([], null), null);
    });
  });

  describe('getLabelPathCoords()', function () {
    // a view transform: uniform scale k, y flipped, translated by (bx, by)
    function view(k, bx, by) {
      var t = new Transform();
      t.mx = k;
      t.my = -k;
      t.bx = bx === undefined ? 0 : bx;
      t.by = by === undefined ? 0 : by;
      return t;
    }

    var KNOTS = [[0, 0], [50, 40], [100, 0]];

    it('puts the first knot at the origin of the group', function () {
      assert.deepEqual(getLabelPathCoords(KNOTS, view(3, 17, 99), 1)[0], [0, 0]);
    });

    it('flips y, because screen y grows downward', function () {
      var out = getLabelPathCoords(KNOTS, view(1), 1);
      assert.deepEqual(out, [[0, 0], [50, -40], [100, 0]]);
    });

    it('is unaffected by panning', function () {
      // the coordinates are relative to the first knot, so the translation
      // cancels -- which is why panning never rebuilds a label path
      assert.deepEqual(getLabelPathCoords(KNOTS, view(2, 0, 0), 1),
        getLabelPathCoords(KNOTS, view(2, -840, 517), 1));
    });

    it('is unaffected when the view and symbol scales change together', function () {
      // the framed case: zooming multiplies both, so the path is built once and
      // the group transform carries the zoom
      assert.deepEqual(getLabelPathCoords(KNOTS, view(2), 2),
        getLabelPathCoords(KNOTS, view(16), 16));
    });

    it('scales with the view when there is no frame', function () {
      // the unframed case, which is why zooming has to rebuild the path
      var a = getLabelPathCoords(KNOTS, view(2), 1);
      var b = getLabelPathCoords(KNOTS, view(6), 1);
      assert.deepEqual(b, a.map(function (p) { return [p[0] * 3, p[1] * 3]; }));
    });

    it('a fitted path is the same shape as one fitted before scaling', function () {
      // The fit is only safe to do in group space because it is equivariant
      // under a similarity transform, so assert that rather than trusting it.
      // Coordinates are compared with a tolerance because the path writer
      // rounds to 0.01, which scaling magnifies.
      var nums = function (d) { return d.match(/-?[.0-9]+/g).map(Number); };
      var small = nums(getLabelPathData(getLabelPathCoords(KNOTS, view(1), 1), null));
      var large = nums(getLabelPathData(getLabelPathCoords(KNOTS, view(4), 1), null));
      assert.equal(small.length, large.length);
      small.forEach(function (n, i) {
        assert.ok(Math.abs(n * 4 - large[i]) < 0.05,
          'coordinate ' + i + ': ' + (n * 4) + ' vs ' + large[i]);
      });
    });
  });

  describe('getLabelTextHash()', function () {
    it('depends on the text', function () {
      assert.notEqual(getLabelTextHash({'label-text': 'a'}),
        getLabelTextHash({'label-text': 'b'}));
    });

    it('depends on each property the width was measured from', function () {
      var base = {'label-text': 'Reno'};
      ['font-family', 'font-size', 'font-weight', 'font-style', 'font-stretch',
        'letter-spacing'].forEach(function (field) {
        var rec = Object.assign({}, base);
        rec[field] = '99';
        assert.notEqual(getLabelTextHash(rec), getLabelTextHash(base),
          field + ' should change the hash');
      });
    });

    it('ignores properties that cannot change the width', function () {
      var a = {'label-text': 'Reno'};
      var b = {'label-text': 'Reno', fill: 'red', 'label-side': 'right',
        'label-start-offset': '20%', 'label-text-width': 40};
      assert.equal(getLabelTextHash(a), getLabelTextHash(b));
    });

    it('treats a missing property and an empty one alike', function () {
      assert.equal(getLabelTextHash({'label-text': 'a'}),
        getLabelTextHash({'label-text': 'a', 'font-size': undefined}));
    });

    it('does not confuse field boundaries', function () {
      // a value containing the separator must not be able to impersonate the
      // next field
      assert.notEqual(getLabelTextHash({'label-text': 'a', 'font-family': 'b'}),
        getLabelTextHash({'label-text': 'a\nb'}));
    });
  });

  describe('getLabelFitState()', function () {
    it('is unmeasured with no stored width', function () {
      assert.equal(getLabelFitState({'label-text': 'a'}, 100), 'unmeasured');
      assert.equal(getLabelFitState({'label-text': 'a', 'label-text-width': 0}, 100),
        'unmeasured');
    });

    it('compares the stored width against the path length', function () {
      var rec = {'label-text': 'a', 'label-text-width': 50};
      assert.equal(getLabelFitState(rec, 100), 'fits');
      assert.equal(getLabelFitState(rec, 50), 'fits'); // exactly fits
      assert.equal(getLabelFitState(rec, 49), 'overflow');
    });

    it('trusts a width with no fingerprint, which is a deliberate opt-in', function () {
      assert.equal(getLabelFitState({'label-text': 'a', 'label-text-width': 50}, 10),
        'overflow');
    });

    it('is stale when the fingerprint no longer matches', function () {
      var rec = {'label-text': 'a', 'label-text-width': 50};
      rec['label-text-hash'] = getLabelTextHash(rec);
      assert.equal(getLabelFitState(rec, 10), 'overflow');
      rec['label-text'] = 'a much longer string';
      assert.equal(getLabelFitState(rec, 10), 'stale');
    });
  });

  describe('SVG output', function () {
    it('a curved label renders once, as text on a path in <defs>', async function () {
      var str = await svg(CURVE + ' text=Sierra');
      assert.equal(textPaths(str).length, 1);
      assert.equal(defPaths(str).length, 1);
      assert.ok(/<textPath[^>]*>Sierra<\/textPath>/.test(str), str);
    });

    it('the text references the path by id', async function () {
      var str = await svg(CURVE + ' text=Sierra');
      var id = defPaths(str)[0].match(/id="([^"]*)"/)[1];
      assert.ok(str.includes('xlink:href="#' + id + '"'), str);
    });

    it('the baseline is not painted in the document body', async function () {
      // a <path> in the body with no fill of its own would pick up SVG's
      // default black fill and render as a blob rather than a line
      var str = await svg(CURVE + ' text=Sierra');
      var body = str.slice(str.indexOf('</defs>'));
      assert.ok(!body.includes('<path'), body);
    });

    it('no stray whitespace ends up inside the text', async function () {
      var str = await svg(CURVE + ' text=Sierra');
      assert.ok(!/<textPath[^>]*>\s/.test(str), str);
      assert.ok(!/\s<\/textPath>/.test(str), str);
    });

    it('identical paths share one definition', async function () {
      var str = await svg(CURVE + ' text=A ' + CURVE + ' text=B');
      assert.equal(textPaths(str).length, 2);
      assert.equal(defPaths(str).length, 1);
    });

    it('different paths get their own definitions', async function () {
      var str = await svg(CURVE + ' text=A -add-label coordinates=0,0,50,10,100,0 text=B');
      assert.equal(defPaths(str).length, 2);
    });

    it('the path id is stable across runs', async function () {
      var a = await svg(CURVE + ' text=Sierra');
      var b = await svg(CURVE + ' text=Sierra');
      assert.equal(a, b);
    });

    it('an anchored label still renders as positioned text', async function () {
      var str = await svg('-add-label coordinates=50,50 text=Reno');
      assert.equal(textPaths(str).length, 0);
      assert.ok(/<text [^>]*transform="translate\([^)]*\)">Reno<\/text>/.test(str), str);
    });

    it('label styles are applied to the <text> element', async function () {
      var str = await svg(CURVE + ' text=Sierra font-size=20 fill=red font-weight=bold');
      var text = str.match(/<text[^>]*>/)[0];
      assert.ok(text.includes('font-size="20"'), text);
      assert.ok(text.includes('fill="red"'), text);
      assert.ok(text.includes('font-weight="bold"'), text);
    });

    it('path-only properties are kept out of the SVG attributes', async function () {
      var str = await svg(CURVE + ' text=Sierra text-width=10');
      assert.ok(!str.includes('label-text-width'), str);
      assert.ok(!str.includes('label-text-hash'), str);
      assert.ok(!str.includes('label-path-d'), str);
    });

    it('label-side and label-start-offset reach the textPath', async function () {
      var str = await svg(CURVE + ' text=Sierra label-side=right label-start-offset=25%');
      var tp = textPaths(str)[0];
      assert.ok(tp.includes('side="right"'), tp);
      assert.ok(tp.includes('startOffset="25%"'), tp);
    });

    it('dx and dy go on the textPath, where they shift along and across the path', async function () {
      var str = await svg(CURVE + ' text=Sierra dx=4 dy=-6');
      var tp = textPaths(str)[0];
      assert.ok(tp.includes('dx="4"'), tp);
      assert.ok(tp.includes('dy="-6"'), tp);
    });

    describe('the default startOffset follows text-anchor', function () {
      it('middle, the layer default, centers the text on the path', async function () {
        assert.ok(textPaths(await svg(CURVE + ' text=S'))[0].includes('startOffset="50%"'));
      });

      it('start puts it at the beginning', async function () {
        var str = await svg(CURVE + ' text=S text-anchor=start');
        assert.ok(textPaths(str)[0].includes('startOffset="0%"'));
      });

      it('end puts it at the far end', async function () {
        var str = await svg(CURVE + ' text=S text-anchor=end');
        assert.ok(textPaths(str)[0].includes('startOffset="100%"'));
      });
    });

    it('a label-corners property in the data does not affect the curve', async function () {
      // corners were supported for a while; a file written then still draws as
      // the smooth curve its knots describe
      var smooth = await svg(CURVE + ' text=S');
      var withProp = await svg(CURVE +
        ' text=S properties=\'{"label-corners":"1"}\'');
      assert.equal(defPaths(smooth)[0], defPaths(withProp)[0]);
    });
  });

  describe('the fit rule', function () {
    it('draws a label with no measurement', async function () {
      assert.equal(textPaths(await svg(CURVE + ' text=Sierra')).length, 1);
    });

    it('draws a label whose measured text fits', async function () {
      assert.equal(textPaths(await svg(CURVE + ' text=Sierra text-width=40')).length, 1);
    });

    it('drops a label whose measured text does not fit', async function () {
      var str = await svg(CURVE + ' text=Sierra text-width=5000');
      assert.equal(textPaths(str).length, 0);
      assert.equal(defPaths(str).length, 0, 'the unused path is not emitted either');
    });

    it('draws a label whose measurement went stale', async function () {
      // -add-label fingerprints the width it is given, so changing the text
      // afterwards invalidates it and export falls back to drawing the label
      var str = await svg(CURVE + ' text=Sierra text-width=5000 -style label-text=Z');
      assert.equal(textPaths(str).length, 1);
    });

    it('still drops a label whose measurement is untouched by a restyle', async function () {
      var str = await svg(CURVE + ' text=Sierra text-width=5000 -style fill=red');
      assert.equal(textPaths(str).length, 0);
    });

    it('only the non-fitting label is dropped', async function () {
      var str = await svg(CURVE + ' text=A text-width=5000 ' + CURVE + ' text=B text-width=10');
      assert.equal(textPaths(str).length, 1);
      assert.ok(str.includes('>B<'), str);
    });

    it('keeps records aligned after a drop, so svg-data stays correct', async function () {
      var out = await api.applyCommands(
        CURVE + ' text=A text-width=5000 name=lab ' +
        CURVE + ' text=B target=lab ' +
        '-each "tag=this.id" target=lab -o out.svg width=400 svg-data=tag');
      var str = String(out['out.svg']);
      assert.equal(textPaths(str).length, 1);
      assert.ok(str.includes('data-tag="1"'), str);
    });

    it('a shorter output size can drop a label that fit at nominal size', async function () {
      // the path shrinks with output size but the text does not, because
      // font-size is exported at native scale
      var cmd = CURVE + ' text=Sierra text-width=180';
      assert.equal(textPaths(String((await api.applyCommands(cmd + ' -o big.svg width=400'))['big.svg'])).length, 1);
      assert.equal(textPaths(String((await api.applyCommands(cmd + ' -o small.svg width=100'))['small.svg'])).length, 0);
    });
  });

  describe('multi-line text', function () {
    it('is joined onto one line, since tspans advance along a path', async function () {
      var str = await svg(CURVE + ' text=Sierra\\nNevada');
      assert.ok(/<textPath[^>]*>Sierra Nevada<\/textPath>/.test(str), str);
      assert.ok(!str.includes('tspan'), str);
    });

    it('is still stacked into tspans for an anchored label', async function () {
      var str = await svg('-add-label coordinates=50,50 text=Sierra\\nNevada');
      assert.ok(str.includes('<tspan'), str);
    });
  });

  describe('regressions', function () {
    it('a multipoint feature without label text renders a symbol per point', async function () {
      var input = {
        type: 'Feature',
        properties: {r: 3, fill: 'red'},
        geometry: {type: 'MultiPoint', coordinates: [[0, 0], [50, 40], [100, 0]]}
      };
      var out = await api.applyCommands('-i in.json -o out.svg width=400',
        {'in.json': JSON.stringify(input)});
      assert.equal((String(out['out.svg']).match(/<circle/g) || []).length, 3);
    });

    it('a polyline layer with label text is unaffected', async function () {
      // label text on a polyline is not a path label -- the knots model puts
      // labels in point layers only
      var input = {
        type: 'Feature',
        properties: {'label-text': 'x'},
        geometry: {type: 'LineString', coordinates: [[0, 0], [50, 40], [100, 0]]}
      };
      var out = await api.applyCommands('-i in.json -o out.svg width=400',
        {'in.json': JSON.stringify(input)});
      assert.equal(textPaths(String(out['out.svg'])).length, 0);
    });
  });
});
