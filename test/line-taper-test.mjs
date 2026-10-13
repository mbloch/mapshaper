import api from '../mapshaper.js';
import assert from 'assert';
import {
  parseLineTaper, getTaperWidths, getTaperedLinePieces, getTaperedLinePathData, getTaperCaps,
  clipTaperedPieces, parseDashArray, getTaperedDashPieces, getTaperedOutline, makeTaperOutlineOpts
} from '../src/svg/svg-line-taper.mjs';
import { getCanvasDisplayStyle, layerHasDrawableStyle } from '../src/gui/gui-layer-styler.mjs';
import {
  getLineArrowShape, makeLineArrowOpts, lineHasEndStyles, renderArrowLine,
  convertLineFade, inlineLineFades
} from '../src/svg/svg-line-arrows.mjs';
import { renderCurveSymbol } from '../src/svg/svg-curve-symbols.mjs';

function near(a, b, msg) {
  assert.ok(Math.abs(a - b) < 1e-6, (msg || '') + ' expected ' + b + ', got ' + a);
}

function signedArea(points) {
  var sum = 0;
  points.forEach(function(a, i) {
    var b = points[(i + 1) % points.length];
    sum += a[0] * b[1] - b[0] * a[1];
  });
  return sum;
}

function polygons(pieces) {
  return pieces.filter(function(p) { return !!p.points; });
}

function circles(pieces) {
  return pieces.filter(function(p) { return !!p.center; });
}

function toFeature(geometry, properties) {
  return {type: 'Feature', properties: properties, geometry: geometry};
}

async function exportSvg(layer, cmd) {
  var out = await api.applyCommands('-i in.json ' + cmd + ' -o out.svg', {
    'in.json': {type: 'FeatureCollection', features: layer}
  });
  return String(out['out.svg']);
}

describe('line-taper', function () {

  describe('parseLineTaper()', function () {
    it('takes a share from 0 to 1', function () {
      assert.equal(parseLineTaper(0.5), 0.5);
      assert.equal(parseLineTaper('1'), 1);
      assert.equal(parseLineTaper(2), 1);
      assert.equal(parseLineTaper(0), 0);
      assert.equal(parseLineTaper(-1), 0);
      assert.equal(parseLineTaper(''), 0);
      assert.equal(parseLineTaper(undefined), 0);
    });
  });

  describe('getTaperWidths()', function () {
    it('narrows the tail', function () {
      assert.deepEqual(getTaperWidths(10, 1, false), [0, 10]);
      assert.deepEqual(getTaperWidths(10, 0.5, false), [5, 10]);
      assert.deepEqual(getTaperWidths(10, 0.5, true), [10, 5]);
    });
  });

  describe('getTaperCaps()', function () {
    it('rounds the ends without heads, unless the cap is flat', function () {
      var noHeads = {start: 'none', end: 'none'};
      assert.deepEqual(getTaperCaps(undefined, noHeads), [true, true]);
      assert.deepEqual(getTaperCaps('round', {start: 'none', end: 'arrow'}), [true, false]);
      assert.deepEqual(getTaperCaps('butt', noHeads), [false, false]);
      assert.deepEqual(getTaperCaps('square', noHeads), [false, false]);
    });
  });

  describe('getTaperedLinePieces()', function () {
    it('a straight segment is one quadrilateral, its width changing along it', function () {
      var pieces = getTaperedLinePieces([[0, 0], [100, 0]], 0, 10);
      assert.equal(pieces.length, 1);
      var ys = pieces[0].points.map(function(p) { return [p[0], Math.abs(p[1])]; });
      assert.deepEqual(ys.filter(function(p) { return p[0] === 0; }).map(function(p) { return p[1]; }), [0, 0]);
      assert.deepEqual(ys.filter(function(p) { return p[0] == 100; }).map(function(p) { return p[1]; }), [5, 5]);
    });

    it('the width runs along the whole length of the line', function () {
      var pieces = getTaperedLinePieces([[0, 0], [30, 0], [100, 0]], 0, 10);
      var first = polygons(pieces)[0];
      var maxY = Math.max.apply(null, first.points.map(function(p) { return Math.abs(p[1]); }));
      near(maxY, 1.5);
    });

    it('every polygon is wound the same way, as the circles are', function () {
      var coords = [[0, 0], [50, 0], [50, 50], [0, 50], [10, 10], [40, 30]];
      var pieces = getTaperedLinePieces(coords, 2, 12, [true, true]);
      polygons(pieces).forEach(function(p) {
        assert.ok(signedArea(p.points) >= 0, 'area ' + signedArea(p.points));
      });
    });

    it('a sharp bend gets a round join, a gentle one a bevel', function () {
      var sharp = getTaperedLinePieces([[0, 0], [50, 0], [50, 50]], 10, 10);
      // two sectors, filling the quarter circle outside the corner
      assert.equal(circles(sharp).length, 2);
      assert.deepEqual(circles(sharp)[0].center, [50, 0]);
      assert.deepEqual(circles(sharp)[0].from, [50, -5]);
      assert.deepEqual(circles(sharp)[1].to, [55, 0]);
      var gentle = getTaperedLinePieces([[0, 0], [50, 0], [100, 2]], 10, 10);
      assert.equal(circles(gentle).length, 0);
      assert.equal(polygons(gentle).length, 3);
      // the bevel is on the outside of the bend, away from the turn (+y)
      var bevel = polygons(gentle)[1];
      assert.equal(bevel.points.length, 3);
      assert.ok(bevel.points.every(function(p) { return p[1] <= 0; }));
    });

    it('a straight run has no joins', function () {
      assert.equal(getTaperedLinePieces([[0, 0], [50, 0], [100, 0]], 4, 4).length, 2);
    });

    it('round caps go on the ends that are asked for, and not on a point', function () {
      var pieces = getTaperedLinePieces([[0, 0], [100, 0]], 0, 10, [true, true]);
      assert.equal(circles(pieces).length, 1);
      assert.deepEqual(circles(pieces)[0], {center: [100, 0], radius: 5});
      assert.equal(circles(getTaperedLinePieces([[0, 0], [100, 0]], 4, 10, [true, false])).length, 1);
    });

    it('repeated points are skipped, and a line with no length has no pieces', function () {
      assert.equal(getTaperedLinePieces([[0, 0], [0, 0], [100, 0], [100, 0]], 0, 10).length, 1);
      assert.deepEqual(getTaperedLinePieces([[5, 5], [5, 5]], 0, 10), []);
      assert.equal(getTaperedLinePathData([]), '');
    });

    it('path data, with circles as two arcs', function () {
      var d = getTaperedLinePathData([{points: [[0, 0], [1, 0], [1, 1]]}, {center: [5, 5], radius: 2}]);
      assert.equal(d, 'M 0 0 L 1 0 L 1 1 Z M 7 5 A 2 2 0 1 1 3 5 A 2 2 0 1 1 7 5 Z');
    });
  });

  describe('parseDashArray()', function () {
    it('reads lengths, repeating an odd list, and scales them', function () {
      assert.deepEqual(parseDashArray('4 2'), [4, 2]);
      assert.deepEqual(parseDashArray('4,2', 2), [8, 4]);
      assert.deepEqual(parseDashArray('3'), [3, 3]);
      assert.deepEqual(parseDashArray(5), [5, 5]);
    });

    it('is null for a solid line', function () {
      assert.equal(parseDashArray(''), null);
      assert.equal(parseDashArray(undefined), null);
      assert.equal(parseDashArray('none'), null);
      assert.equal(parseDashArray('0 0'), null);
      assert.equal(parseDashArray('4 x'), null);
    });
  });

  describe('getTaperedDashPieces()', function () {
    function quads(pieces) {
      return polygons(pieces).filter(function(p) { return p.points.length == 4; });
    }

    function xRange(piece) {
      var xs = piece.points.map(function(p) { return p[0]; });
      return [Math.min.apply(null, xs), Math.max.apply(null, xs)];
    }

    it('a dash is a piece of the outline, the pattern starting at the first point', function () {
      var pieces = getTaperedDashPieces([[0, 0], [100, 0]], 0, 10, [10, 15], 'butt', [true, true]);
      assert.equal(pieces.length, 4);
      assert.deepEqual(xRange(pieces[0]), [0, 10]);
      assert.deepEqual(xRange(pieces[1]), [25, 35]);
      assert.deepEqual(xRange(pieces[3]), [75, 85]);
      // the width at a dash is the taper's there
      var ys = pieces[3].points.map(function(p) { return Math.abs(p[1]); });
      near(Math.max.apply(null, ys), 85 / 100 * 10 / 2);
    });

    it('a dash that crosses a vertex is joined there', function () {
      var pieces = getTaperedDashPieces([[0, 0], [50, 0], [50, 50]], 10, 10, [60, 40], 'butt', [true, true]);
      assert.equal(quads(pieces).length, 2);
      assert.equal(circles(pieces).length, 2);
      assert.deepEqual(circles(pieces)[0].center, [50, 0]);
    });

    it('the join of a dash that ends just past a bend stays inside the dash', function () {
      // a 20px line turning down at (50, 0), with a dash that ends at y = 2
      var pieces = getTaperedDashPieces([[0, 0], [50, 0], [50, 50]], 20, 20, [52, 100], 'butt', [true, true]);
      var sectors = circles(pieces);
      assert.equal(sectors.length, 2);
      sectors.forEach(function(s) {
        assert.ok(s.from && s.to, 'a sector, not a whole circle');
        // the sector runs the short way between its ends, so with both on
        // or above the first segment's line, all of it is
        assert.ok(s.from[1] <= 1e-9 && s.to[1] <= 1e-9, JSON.stringify(s));
        assert.ok(s.from[0] >= 50 - 1e-9 && s.to[0] >= 50 - 1e-9, JSON.stringify(s));
      });
    });

    it('a line that turns straight back is joined by a half circle', function () {
      var pieces = getTaperedLinePieces([[0, 0], [50, 0], [0, 0.0000001]], 10, 10);
      var sectors = circles(pieces);
      assert.equal(sectors.length, 2);
      // the two meet straight on from the bend
      near(sectors[0].to[0], 55);
      near(sectors[1].from[0], 55);
    });

    it('sectors are wound as the polygons are', function () {
      [[[0, 0], [50, 0], [50, 50]], [[0, 0], [50, 0], [50, -50]]].forEach(function(coords) {
        circles(getTaperedLinePieces(coords, 10, 10)).forEach(function(s) {
          var c = s.center;
          var cross = (s.from[0] - c[0]) * (s.to[1] - c[1]) - (s.from[1] - c[1]) * (s.to[0] - c[0]);
          assert.ok(cross > 0);
        });
      });
    });

    it('path data for a sector', function () {
      var d = getTaperedLinePathData([{center: [0, 0], radius: 5, from: [5, 0], to: [0, 5]}]);
      assert.equal(d, 'M 0 0 L 5 0 A 5 5 0 0 1 0 5 Z');
    });

    it('round caps go on every dash end, but not at a head', function () {
      var pieces = getTaperedDashPieces([[0, 0], [100, 0]], 10, 10, [10, 40], 'round', [true, false]);
      // dashes at 0-10 and 50-60, each with two caps
      assert.equal(circles(pieces).length, 4);
      var atEnd = getTaperedDashPieces([[0, 0], [70, 0]], 10, 10, [20, 30], 'round', [true, false]);
      // the second dash ends at the head, at 70, and has no cap there
      assert.equal(circles(atEnd).length, 3);
    });

    it('a zero-length dash with round caps is a dot', function () {
      var pieces = getTaperedDashPieces([[0, 0], [100, 0]], 10, 10, [0, 20], 'round', [true, true]);
      assert.equal(polygons(pieces).length, 0);
      assert.ok(circles(pieces).length >= 5);
      var butt = getTaperedDashPieces([[0, 0], [100, 0]], 10, 10, [0, 20], 'butt', [true, true]);
      assert.equal(butt.length, 0);
    });

    it('square caps extend each dash by half the width', function () {
      var pieces = getTaperedDashPieces([[0, 0], [100, 0]], 10, 10, [10, 40], 'square', [true, true]);
      var ranges = polygons(pieces).map(xRange);
      assert.deepEqual(ranges.filter(function(r) { return r[0] == -5; }), [[-5, 0]]);
      assert.deepEqual(ranges.filter(function(r) { return r[1] == 65; }), [[60, 65]]);
    });

    it('with a bbox, only the dashes in it are made', function () {
      var pieces = getTaperedDashPieces([[-1e9, 50], [1e9, 50]], 0, 10, [4, 4], 'butt',
        [true, true], [0, 0, 100, 100]);
      assert.ok(pieces.length > 10 && pieces.length < 30, String(pieces.length));
      pieces.forEach(function(p) {
        var r = xRange(p);
        assert.ok(r[0] > -50 && r[1] < 150, String(r));
      });
    });

    it('a pattern too fine to draw is drawn solid', function () {
      var pieces = getTaperedDashPieces([[0, 0], [1e6, 0]], 10, 10, [1, 1], 'butt', [true, true]);
      assert.equal(pieces.length, 1);
    });
  });

  describe('getTaperedOutline()', function () {
    it('dashes the outline of a dashed line, with butt caps by default', function () {
      var outline = makeTaperOutlineOpts(null, '10 10', {start: 'none', end: 'none'}, 1);
      var pieces = getTaperedOutline([[0, 0], [100, 0]], 0, 10, outline);
      assert.equal(pieces.length, 5);
      assert.equal(circles(pieces).length, 0);
    });

    it('a solid line has round ends by default, but not at a head', function () {
      var outline = makeTaperOutlineOpts(null, null, {start: 'none', end: 'arrow'}, 1);
      var pieces = getTaperedOutline([[0, 0], [100, 0]], 4, 10, outline);
      assert.deepEqual(circles(pieces), [{center: [0, 0], radius: 2}]);
    });

    it('scales the dashes, for the canvas', function () {
      var outline = makeTaperOutlineOpts(null, '10 10', {start: 'none', end: 'none'}, 2);
      assert.deepEqual(outline.dashes, [20, 20]);
    });
  });

  describe('clipTaperedPieces()', function () {
    var box = [0, 0, 100, 100];

    it('keeps pieces inside, drops pieces outside', function () {
      var inside = {points: [[10, 10], [20, 10], [20, 20]]};
      var outside = {points: [[200, 10], [220, 10], [220, 20]]};
      assert.deepEqual(clipTaperedPieces([inside, outside], box), [inside]);
    });

    it('cuts a polygon that crosses the box, keeping its winding', function () {
      var quad = {points: [[-1e7, 40], [50, 40], [50, 60], [-1e7, 60]]};
      if (signedArea(quad.points) < 0) quad.points.reverse();
      var out = clipTaperedPieces([quad], box);
      assert.equal(out.length, 1);
      out[0].points.forEach(function(p) {
        assert.ok(p[0] >= 0 && p[0] <= 100 && p[1] >= 0 && p[1] <= 100, String(p));
      });
      near(Math.abs(signedArea(out[0].points)) / 2, 50 * 20);
      assert.ok(signedArea(out[0].points) > 0);
    });

    it('keeps circles that reach the box', function () {
      var near = {center: [-3, 50], radius: 5};
      var far = {center: [-30, 50], radius: 5};
      assert.deepEqual(clipTaperedPieces([near, far], box), [near]);
    });

    it('a line built far outside the view is clipped to the part in it', function () {
      var pieces = getTaperedLinePieces([[-1e8, 50], [1e8, 50]], 0, 20);
      var out = clipTaperedPieces(pieces, box);
      assert.equal(out.length, 1);
      var ys = out[0].points.map(function(p) { return p[1]; });
      // the width changes by a hundred-thousandth of a px across the box
      assert.ok(Math.abs(Math.max.apply(null, ys) - Math.min.apply(null, ys) - 10) < 1e-3);
    });
  });

  describe('the canvas styler', function () {
    it('gives each line its taper', function () {
      var lyr = {geometry_type: 'polyline', shapes: [[[0]], [[1]]],
        data: new api.internal.DataTable([{'line-taper': 1}, {}])};
      var style = getCanvasDisplayStyle(lyr);
      style.styler(style, 0);
      assert.equal(style.lineTaper, 1);
      style.styler(style, 1);
      assert.equal(style.lineTaper, undefined);
      assert.ok(layerHasDrawableStyle(lyr));
    });
  });

  describe('getLineArrowShape()', function () {
    function opts(o) {
      return Object.assign(makeLineArrowOpts('', '', null, 10, 1, 0, 1), o);
    }

    it('gives the widths at the ends of the line it draws', function () {
      assert.deepEqual(getLineArrowShape([[0, 0], [100, 0]], opts()).widths, [0, 10]);
      assert.equal(getLineArrowShape([[0, 0], [100, 0]], opts({taper: 0})).widths, null);
    });

    it('the tail is the start, unless only the start has a head', function () {
      assert.deepEqual(getLineArrowShape([[0, 0], [100, 0]], opts({end: 'arrow'})).widths, [0, 10]);
      assert.deepEqual(getLineArrowShape([[0, 0], [100, 0]], opts({start: 'arrow'})).widths, [10, 0]);
      assert.deepEqual(getLineArrowShape([[0, 0], [100, 0]],
        opts({start: 'arrow', end: 'arrow'})).widths, [0, 10]);
    });
  });

  describe('renderArrowLine()', function () {
    it('a taper alone draws the line by renderArrowLine()', function () {
      assert.ok(lineHasEndStyles({'line-taper': 1}));
      assert.ok(!lineHasEndStyles({'line-taper': 0}));
    });

    it('a tapered line is a filled path in the stroke color', function () {
      var obj = renderArrowLine([[[0, 0], [100, 0]], [[0, 20], [100, 20]]],
        {stroke: 'red', 'stroke-width': 6, 'line-taper': 1, 'stroke-opacity': 0.5});
      assert.equal(obj.children.length, 1);
      var props = obj.children[0].properties;
      assert.equal(props.fill, 'red');
      assert.equal(props.stroke, 'none');
      assert.equal(props['fill-rule'], 'nonzero');
      assert.equal(props['fill-opacity'], 0.5);
      // both parts in one path
      assert.equal(props.d.match(/M /g).length, 4);
    });

    it('with a head, the line is as wide as the stroke where it meets the head', function () {
      var obj = renderArrowLine([[[0, 0], [100, 0]]],
        {stroke: 'red', 'stroke-width': 6, 'line-taper': 1, 'line-end': 'arrow'});
      assert.equal(obj.children.length, 2);
      var ys = obj.children[0].properties.d.match(/-?[\d.]+/g).map(Number)
        .filter(function(n, i) { return i % 2 == 1; });
      near(Math.max.apply(null, ys), 3);
      // no round cap hidden inside the head
      assert.ok(!/A /.test(obj.children[0].properties.d));
    });

    it('a faded tapered line is filled with the fade', function () {
      var obj = renderArrowLine([[[0, 0], [100, 0]]],
        {stroke: 'red', 'stroke-width': 6, 'line-taper': 1, 'line-fade': 0.5});
      var path = obj.children[0];
      assert.equal(path.lineFade.paint, 'fill');
      var defs = [];
      convertLineFade(path, defs);
      assert.equal(path.properties.fill, 'url(#line-fade-1)');
      assert.equal(path.properties.stroke, 'none');
      assert.equal(path.lineFade, undefined);
    });
  });

  describe('inlineLineFades()', function () {
    it('puts the gradients in a <defs> of the object\'s own', function () {
      var obj = renderArrowLine([[[0, 0], [100, 0]], [[0, 0], [100, 0]]],
        {stroke: 'red', 'stroke-width': 6, 'line-taper': 1, 'line-fade': 0.5});
      inlineLineFades(obj);
      var defs = obj.children[0];
      assert.equal(defs.tag, 'defs');
      // the two parts fade the same way, so share one gradient
      assert.equal(defs.children.length, 1);
      var id = defs.children[0].properties.id;
      assert.equal(defs.children[0].tag, 'linearGradient');
      assert.equal(obj.children[1].properties.fill, 'url(#' + id + ')');
      assert.equal(obj.children[2].properties.fill, 'url(#' + id + ')');
      var svg = api.internal.svg.stringify(obj);
      assert.ok(svg.includes('<stop offset="0" stop-color="red" stop-opacity="0"/>'));
    });

    it('a stroked fade is converted to a stroke', function () {
      var obj = renderArrowLine([[[0, 0], [100, 0]]], {stroke: 'red', 'line-fade': 0.5});
      inlineLineFades(obj);
      assert.ok(/^url\(#line-fade-/.test(obj.children[1].properties.stroke));
    });
  });

  describe('curves', function () {
    it('an open curve tapers', function () {
      var obj = renderCurveSymbol({icon: 'curve', stroke: 'blue', 'stroke-width': 8, 'line-taper': 1},
        [[0, 0], [50, 40], [100, 0]]);
      var path = obj.children[0];
      assert.equal(path.properties.fill, 'blue');
      assert.equal(path.properties.stroke, 'none');
    });

    it('a closed curve does not', function () {
      var obj = renderCurveSymbol({icon: 'curve', stroke: 'blue', 'line-taper': 1},
        [[0, 0], [50, 40], [100, 0], [0, 0]]);
      assert.equal(obj.tag, 'path');
      assert.equal(obj.properties.fill, 'none');
    });

    it('-symbols type=curve line-taper=', async function () {
      var svg = await exportSvg([toFeature({type: 'MultiPoint', coordinates: [[0, 0], [1, 1], [2, 0]]}, {})],
        '-symbols type=curve stroke=red stroke-width=6 line-taper=0.5');
      assert.ok(/<path d="M [^"]+" fill="red" fill-rule="nonzero" stroke="none"\/>/.test(svg), svg);
    });
  });

  describe('line layers', function () {
    it('-style line-taper= exports a filled outline', async function () {
      var svg = await exportSvg([toFeature({type: 'LineString', coordinates: [[0, 0], [1, 1], [2, 0]]}, {})],
        '-style stroke=red stroke-width=6 line-taper=1');
      assert.ok(/fill="red" fill-rule="nonzero" stroke="none"/.test(svg), svg);
    });

    it('a dashed tapered line exports its dashes, over a solid casing', async function () {
      var svg = await exportSvg([toFeature({type: 'LineString', coordinates: [[0, 0], [1, 0]]}, {})],
        '-style stroke=red stroke-width=6 line-taper=1 stroke-dasharray="4 4" casing-color=black');
      var line = svg.match(/<path d="([^"]+)" fill="red"/);
      var casing = svg.match(/<g id="[^"]*-casing">\s*<path d="([^"]+)"/);
      assert.ok(line && casing, svg);
      assert.ok(line[1].match(/M /g).length > 10);
      assert.equal(casing[1].match(/M /g).length, 1);
    });

    it('a tapered line\'s casing is a fill around its outline', async function () {
      var svg = await exportSvg([toFeature({type: 'LineString', coordinates: [[0, 0], [1, 1], [2, 0]]}, {})],
        '-style stroke=red stroke-width=6 line-taper=1 casing-color=black casing-width=2');
      var casing = svg.match(/<g id="[^"]*-casing">\s*<path ([^>]*)\/>/);
      assert.ok(casing, svg);
      assert.ok(/fill="black"/.test(casing[1]));
      assert.ok(/stroke="none"/.test(casing[1]));
      assert.ok(!/stroke-width/.test(casing[1]));
    });
  });
});
