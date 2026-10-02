import api from '../mapshaper.js';
import assert from 'assert';
import { getLineArrowShape, makeLineArrowOpts, getLineArrowOpts,
  lineHasArrows, getLineFadeAxis, getLineFadeColors, parseLineFade
} from '../src/svg/svg-line-arrows.mjs';
import { getCanvasDisplayStyle, layerHasDrawableStyle } from '../src/gui/gui-layer-styler.mjs';

function near(a, b, msg) {
  assert.ok(Math.abs(a - b) < 1e-6, (msg || '') + ' expected ' + b + ', got ' + a);
}

function opts(o) {
  return Object.assign({start: 'none', end: 'none', size: 10, width: 1}, o);
}

var geojson = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: {name: 'a'},
    geometry: {type: 'LineString', coordinates: [[0, 0], [100, 0]]}
  }, {
    type: 'Feature',
    properties: {name: 'b'},
    geometry: {type: 'MultiLineString', coordinates: [
      [[0, 10], [100, 10]], [[0, 20], [100, 20]]]}
  }]
};

// applyCommands() modifies the objects it is given
function input() {
  return {'in.json': JSON.parse(JSON.stringify(geojson))};
}

async function exportSvg(styleCmd) {
  var cmd = '-i in.json ' + (styleCmd || '') + ' -o out.svg';
  var out = await api.applyCommands(cmd, input());
  return String(out['out.svg']);
}

describe('line arrowheads', function() {

  describe('getLineArrowShape()', function() {
    it('a solid end head has its tip at the end, and the line stops inside it', function() {
      var shape = getLineArrowShape([[0, 0], [100, 0]], opts({end: 'arrow'}));
      var head = shape.heads[0];
      assert.equal(shape.heads.length, 1);
      assert.equal(head.type, 'arrow');
      assert.deepEqual(head.points[0], [100, 0]);
      // the two wings are behind the tip, either side of the line
      assert.ok(head.points[1][0] < 100 && head.points[2][0] < 100);
      near(head.points[1][1], -head.points[2][1]);
      var lastX = shape.coords[shape.coords.length - 1][0];
      assert.ok(lastX < 100 && lastX > head.points[1][0], 'line ends inside the head');
      assert.deepEqual(shape.coords[0], [0, 0]);
    });

    it('a start head points back along the line', function() {
      var shape = getLineArrowShape([[0, 0], [100, 0]], opts({start: 'arrow'}));
      assert.deepEqual(shape.heads[0].points[0], [0, 0]);
      assert.ok(shape.heads[0].points[1][0] > 0);
      assert.deepEqual(shape.coords[shape.coords.length - 1], [100, 0]);
    });

    it('an open head is a chevron set back by half the line width', function() {
      var shape = getLineArrowShape([[0, 0], [100, 0]], opts({end: 'open-arrow', width: 2}));
      var head = shape.heads[0];
      assert.equal(head.type, 'open-arrow');
      // wing, tip, wing
      near(head.points[1][0], 99);
      near(head.points[1][1], 0);
      near(shape.coords[shape.coords.length - 1][0], 99);
    });

    it('both ends get heads', function() {
      var shape = getLineArrowShape([[0, 0], [50, 0], [100, 0]],
        opts({start: 'arrow', end: 'open-arrow'}));
      assert.deepEqual(shape.heads.map(function(h) { return h.type; }), ['arrow', 'open-arrow']);
    });

    it('a dot is centred on the end, and the line stops inside it', function() {
      var shape = getLineArrowShape([[0, 0], [100, 0]],
        opts({start: 'dot', dotSize: 8}));
      assert.deepEqual(shape.heads, [{type: 'dot', center: [0, 0], radius: 4}]);
      near(shape.coords[0][0], 2);
    });

    it('a part too short for its head gets none', function() {
      var shape = getLineArrowShape([[0, 0], [3, 0]], opts({end: 'arrow'}));
      assert.equal(shape.heads.length, 0);
      assert.deepEqual(shape.coords, [[0, 0], [3, 0]]);
    });

    it('a head points along the chord, not a last tiny jog', function() {
      var shape = getLineArrowShape([[0, 0], [99.9, 0], [100, 0.1]], opts({end: 'arrow'}));
      var p = shape.heads[0].points;
      // the head's axis, tip to the middle of its base, is within a degree of
      // the line's, where the last segment is at 45
      var mid = [(p[1][0] + p[2][0]) / 2, (p[1][1] + p[2][1]) / 2];
      var deg = Math.atan2(p[0][1] - mid[1], p[0][0] - mid[0]) * 180 / Math.PI;
      assert.ok(Math.abs(deg) < 1, 'axis at ' + deg);
    });
  });

  describe('options', function() {
    it('the default size grows with the line width, and scales with it', function() {
      assert.equal(makeLineArrowOpts('arrow', '', null, 1, 1).size, 10);
      assert.equal(makeLineArrowOpts('arrow', '', null, 2, 1).size, 13);
      assert.deepEqual(makeLineArrowOpts('arrow', 'open-arrow', 8, 2, 2),
        {start: 'arrow', end: 'open-arrow', size: 16, dotSize: 16, width: 4, fade: 0});
    });

    it('a dot is 0.6 of the default arrow size, or line-end-size across', function() {
      near(makeLineArrowOpts('dot', '', null, 1, 1).dotSize, 6);
      assert.equal(makeLineArrowOpts('dot', '', 9, 1, 1).dotSize, 9);
    });

    it('reads records', function() {
      assert.equal(getLineArrowOpts({'line-end': 'arrow', 'line-end-size': 12}, 1).size, 12);
      assert.ok(lineHasArrows({'line-start': 'open-arrow'}));
      assert.ok(!lineHasArrows({'line-start': 'none'}));
      assert.ok(!lineHasArrows({}));
    });
  });

  describe('-style', function() {
    it('rejects an unknown head', async function() {
      await assert.rejects(api.applyCommands('-i in.json -style line-end=hexagon -o out.json',
        input()));
    });

    it('stores the three properties', async function() {
      var out = await api.applyCommands(
        '-i in.json -style line-start=arrow line-end=open-arrow line-end-size=12 -o out.json',
        input());
      var props = JSON.parse(out['out.json']).features[0].properties;
      assert.equal(props['line-start'], 'arrow');
      assert.equal(props['line-end'], 'open-arrow');
      assert.equal(props['line-end-size'], 12);
    });
  });

  describe('SVG export', function() {
    it('lines without arrowheads are exported as before', async function() {
      var plain = await exportSvg('-style stroke=red');
      var none = await exportSvg('-style stroke=red line-end=none line-start=none');
      assert.equal(none.replace(/ ?line-(start|end)="none"/g, ''), plain);
      assert.ok(!/<g [^>]*stroke="red"/.test(plain));
    });

    it('a line with arrowheads is a group holding the line and its heads', async function() {
      var svg = await exportSvg('-style stroke=red stroke-width=2 line-end=arrow');
      // one group per feature, carrying the feature's style
      var groups = svg.match(/<g stroke="red" stroke-width="2">/g) || [];
      assert.equal(groups.length, 2);
      // one solid head per part: 1 + 2
      assert.equal((svg.match(/fill="red" stroke="none"/g) || []).length, 3);
      // the properties are not written as attributes
      assert.ok(!/line-end/.test(svg));
    });

    it('open heads are stroked whole and round', async function() {
      var svg = await exportSvg('-style stroke-dasharray="4 2" line-start=open-arrow');
      assert.equal((svg.match(/fill="none" stroke-dasharray="none" stroke-linecap="round" stroke-linejoin="round"/g) || []).length, 3);
    });

    it('dots are circles', async function() {
      var svg = await exportSvg('-style stroke=red line-end=dot line-end-size=8');
      assert.equal((svg.match(/<circle cx="[^"]+" cy="[^"]+" r="4" fill="red" stroke="none"\/>/g) || []).length, 3);
    });

    it('solid heads take the stroke opacity as fill opacity', async function() {
      var svg = await exportSvg('-style stroke-opacity=0.5 line-end=arrow');
      assert.ok(/fill="black" stroke="none" fill-opacity="0.5"/.test(svg));
    });
  });

  describe('fade', function() {
    var line = [[0, 0], [60, 0], [60, 40]]; // 100px long

    it('runs from the tail to the point that share of the length along', function() {
      var axis = getLineFadeAxis(line, false, 0.5);
      assert.deepEqual(axis.from, [0, 0]);
      assert.deepEqual(axis.to, [50, 0]);
      axis = getLineFadeAxis(line, false, 0.8);
      near(axis.to[0], 60);
      near(axis.to[1], 20);
      assert.deepEqual(getLineFadeAxis(line, false, 1).to, [60, 40]);
    });

    it('can run from the end', function() {
      var axis = getLineFadeAxis(line, true, 0.25);
      assert.deepEqual(axis.from, [60, 40]);
      assert.deepEqual(axis.to, [60, 15]);
    });

    it('is null where its two points would meet', function() {
      assert.equal(getLineFadeAxis([[0, 0], [10, 0], [10, 10], [0, 0]], false, 1), null);
      assert.equal(getLineFadeAxis([[5, 5], [5, 5]], false, 1), null);
    });

    it('fades the end without a head, or the start', function() {
      function axisFrom(start, end) {
        var shape = getLineArrowShape([[0, 0], [100, 0]], makeLineArrowOpts(start, end, '', 1, 1, 0.5));
        return shape.fade.from;
      }
      assert.deepEqual(axisFrom('none', 'arrow'), [0, 0]);
      assert.deepEqual(axisFrom('arrow', 'none'), [100, 0]);
      assert.deepEqual(axisFrom('arrow', 'arrow'), [0, 0]);
      assert.deepEqual(axisFrom('none', 'none'), [0, 0]);
    });

    it('takes a share of the line, clamped to 1', function() {
      assert.equal(parseLineFade(0.4), 0.4);
      assert.equal(parseLineFade('2'), 1);
      assert.equal(parseLineFade(0), 0);
      assert.equal(parseLineFade(-1), 0);
      assert.equal(parseLineFade('abc'), 0);
      assert.equal(parseLineFade(undefined), 0);
    });

    it('fades from the stroke colour to the same colour, transparent', function() {
      assert.deepEqual(getLineFadeColors('#ff0000'), {transparent: 'rgba(255,0,0,0)', solid: '#ff0000'});
      assert.deepEqual(getLineFadeColors(undefined), {transparent: 'rgba(0,0,0,0)', solid: 'black'});
      assert.equal(getLineFadeColors('none'), null);
    });

    it('is a gradient stroke in SVG, in the path\'s own coordinates', async function() {
      var svg = await exportSvg('-style stroke=red line-end=arrow line-fade=0.5');
      var gradients = svg.match(/<linearGradient [^>]*>/g) || [];
      // one per part: 1 + 2
      assert.equal(gradients.length, 3);
      gradients.forEach(function(g) {
        assert.ok(/gradientUnits="userSpaceOnUse"/.test(g));
      });
      assert.ok(/<stop offset="0" stop-color="red" stop-opacity="0"\/>/.test(svg));
      assert.equal((svg.match(/<path [^>]*stroke="url\(#line-fade-\d\)"/g) || []).length, 3);
      // the heads are left solid
      assert.equal((svg.match(/fill="red" stroke="none"/g) || []).length, 3);
      assert.ok(!/line-fade=/.test(svg));
    });

    it('needs no arrowheads', async function() {
      var svg = await exportSvg('-style stroke=red line-fade=1');
      assert.equal((svg.match(/<linearGradient /g) || []).length, 3);
    });

    it('lines without a fade are exported as before', async function() {
      var plain = await exportSvg('-style stroke=red line-end=arrow');
      var zero = await exportSvg('-style stroke=red line-end=arrow line-fade=0');
      assert.equal(zero, plain);
      assert.ok(!/linearGradient/.test(plain));
    });
  });

  describe('canvas styler', function() {
    function makeLayer(records) {
      return {
        geometry_type: 'polyline',
        data: new api.internal.DataTable(records)
      };
    }

    it('a line layer with only arrowheads is drawn styled, with a black 1px line', function() {
      var lyr = makeLayer([{'line-end': 'arrow'}, {}]);
      var style = getCanvasDisplayStyle(lyr);
      assert.ok(layerHasDrawableStyle(lyr));
      assert.equal(style.strokeColor, 'black');
      assert.equal(style.strokeWidth, 1);
    });

    it('sets the arrow fields on every feature, clearing them on the reused style object', function() {
      var lyr = makeLayer([{'line-end': 'arrow', 'line-end-size': 12, stroke: 'red'}, {stroke: 'blue'}]);
      var base = getCanvasDisplayStyle(lyr);
      var drawStyle = Object.assign({}, base);
      base.styler(drawStyle, 0);
      assert.equal(drawStyle.lineEnd, 'arrow');
      assert.equal(drawStyle.lineEndSize, 12);
      base.styler(drawStyle, 1);
      assert.equal(drawStyle.lineEnd, undefined);
      assert.equal(drawStyle.lineEndSize, undefined);
    });

    it('sets and clears the fade on the reused style object', function() {
      var lyr = makeLayer([{'line-fade': 0.5}, {}]);
      var base = getCanvasDisplayStyle(lyr);
      var drawStyle = Object.assign({}, base);
      assert.ok(layerHasDrawableStyle(lyr));
      base.styler(drawStyle, 0);
      assert.equal(drawStyle.lineFade, 0.5);
      base.styler(drawStyle, 1);
      assert.equal(drawStyle.lineFade, undefined);
    });

    it('leaves styles alone on layers without arrow fields', function() {
      var lyr = makeLayer([{stroke: 'red'}]);
      var base = getCanvasDisplayStyle(lyr);
      var drawStyle = Object.assign({}, base);
      base.styler(drawStyle, 0);
      assert.ok(!('lineEnd' in drawStyle));
      assert.ok(!('strokeWidth' in base));
      assert.ok(!layerHasDrawableStyle(makeLayer([{name: 'x'}])));
    });
  });
});
