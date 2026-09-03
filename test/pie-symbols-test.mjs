import { makePieSymbol, getPieWedges, getPieRadii } from '../src/symbols/mapshaper-pie-symbols';
import api from '../mapshaper.js';
import assert from 'assert';

// Bearing of a point relative to the center of a symbol, in degrees clockwise
// from the top, in the y-up space used by getPieWedges().
function bearing(p) {
  var deg = Math.atan2(p[0], p[1]) * 180 / Math.PI;
  return deg < 0 ? deg + 360 : deg;
}

function radius(p) {
  return Math.sqrt(p[0] * p[0] + p[1] * p[1]);
}

function pointGeoJSON(properties) {
  return {
    type: 'FeatureCollection',
    features: (properties || [{}]).map(function(d) {
      return {
        type: 'Feature',
        properties: d,
        geometry: {type: 'Point', coordinates: [0, 0]}
      };
    })
  };
}

describe('mapshaper-pie-symbols.js', function () {

  describe('getPieWedges()', function () {
    it('makes one wedge per value', function () {
      var wedges = getPieWedges({
        values: [30, 50, 20],
        fills: ['red', 'green', 'blue'],
        radius: 20
      }, 1);
      assert.equal(wedges.length, 3);
      assert.deepEqual(wedges.map(function(w) {return w.fill;}), ['red', 'green', 'blue']);
    });

    it('starts at the top and runs clockwise', function () {
      var wedges = getPieWedges({
        values: [25, 25, 50],
        fills: ['red', 'green', 'blue'],
        radius: 10
      }, 1);
      // Each wedge's first point is on its starting edge; the shares are
      // 25%, 25% and 50% of the symbol, so the edges fall at 0, 90 and 180
      // degrees clockwise from the top.
      var starts = wedges.map(function(w) {return bearing(w.coordinates[0][0]);});
      assert.deepEqual(starts.map(Math.round), [0, 90, 180]);
    });

    it('offsets the first wedge by the rotation option', function () {
      var wedges = getPieWedges({
        values: [50, 50],
        fills: ['red', 'green'],
        radius: 10,
        rotation: 90
      }, 1);
      var starts = wedges.map(function(w) {return bearing(w.coordinates[0][0]);});
      assert.deepEqual(starts.map(Math.round), [90, 270]);
    });

    it('scales radii by the scale option', function () {
      var wedges = getPieWedges({
        values: [50, 50],
        fills: ['red', 'green'],
        radius: 10
      }, 2);
      assert.equal(Math.round(radius(wedges[0].coordinates[0][0])), 20);
    });

    it('treats missing, non-numeric and negative values as zero', function () {
      var wedges = getPieWedges({
        values: [50, null, undefined, NaN, 'abc', -10, 50],
        fills: ['red', 'green', 'blue', 'orange', 'purple', 'brown', 'black'],
        radius: 10
      }, 1);
      // only the two values of 50 produce wedges, and they split the symbol
      assert.deepEqual(wedges.map(function(w) {return w.fill;}), ['red', 'black']);
      assert.deepEqual(wedges.map(function(w) {
        return Math.round(bearing(w.coordinates[0][0]));
      }), [0, 180]);
    });

    it('makes no wedges when every value is zero', function () {
      var wedges = getPieWedges({
        values: [0, 0, 0],
        fills: ['red', 'green', 'blue'],
        radius: 10
      }, 1);
      assert.deepEqual(wedges, []);
    });

    it('makes no wedges when the radius is not positive', function () {
      var wedges = getPieWedges({
        values: [30, 70],
        fills: ['red', 'green'],
        radius: 0
      }, 1);
      assert.deepEqual(wedges, []);
    });

    it('leaves a gap where a fill is missing, none, transparent or not a color', function () {
      var d = {values: [20, 20, 20, 20, 20], radius: 10};
      var fills = ['red', '', 'none', 'transparent', 'banana'];
      var wedges = getPieWedges(Object.assign({fills: fills}, d), 1);
      assert.equal(wedges.length, 1);
      assert.equal(wedges[0].fill, 'red');
      // the gaps keep their share of the symbol: the filled wedge spans the
      // first fifth of the circle
      assert.equal(Math.round(bearing(wedges[0].coordinates[0][0])), 0);
      assert.equal(Math.round(bearing(wedges[0].coordinates[0][1])), 5);
    });

    it('keeps the wedges after a gap in place', function () {
      var wedges = getPieWedges({
        values: [30, 50, 20],
        fills: ['red', 'none', 'blue'],
        radius: 10
      }, 1);
      assert.deepEqual(wedges.map(function(w) {return w.fill;}), ['red', 'blue']);
      // the blue wedge still begins where the unfilled one ends, 80% of the
      // way around the symbol
      assert.equal(Math.round(bearing(wedges[1].coordinates[0][0])), 288);
    });

    it('accepts rgba() and shorthand hex fills', function () {
      var wedges = getPieWedges({
        values: [50, 50],
        fills: ['rgba(255,0,0,0.5)', '#00f'],
        radius: 10
      }, 1);
      assert.deepEqual(wedges.map(function(w) {return w.fill;}), ['rgba(255,0,0,0.5)', '#00f']);
    });

    it('leaves a gap where a fill is undefined', function () {
      // fewer fills than values
      var wedges = getPieWedges({
        values: [50, 50],
        fills: ['red'],
        radius: 10
      }, 1);
      assert.equal(wedges.length, 1);
      assert.equal(wedges[0].fill, 'red');
    });

    it('accepts comma-separated strings, for parity with the option syntax', function () {
      var wedges = getPieWedges({
        values: '30,70',
        fills: 'red,green',
        radius: 10
      }, 1);
      assert.deepEqual(wedges.map(function(w) {return w.fill;}), ['red', 'green']);
    });

    it('closes a pie wedge through the center of the symbol', function () {
      var wedges = getPieWedges({values: [50, 50], fills: ['red', 'green'], radius: 10}, 1);
      var ring = wedges[0].coordinates[0];
      assert.equal(wedges[0].coordinates.length, 1);
      assert.deepEqual(ring[ring.length - 2], [0, 0]);
      assert.deepEqual(ring[0], ring[ring.length - 1]);
    });

    it('closes a donut wedge along the inner arc, without a hole ring', function () {
      var wedges = getPieWedges({values: [50, 50], fills: ['red', 'green'], radius: 20, hole: 10}, 1);
      var ring = wedges[0].coordinates[0];
      assert.equal(wedges[0].coordinates.length, 1);
      // no vertex at the center, and the ring visits both radii
      assert.ok(ring.every(function(p) {return radius(p) > 9;}));
      assert.equal(Math.round(radius(ring[0])), 20);
      assert.equal(Math.round(radius(ring[ring.length - 2])), 10);
      assert.deepEqual(ring[0], ring[ring.length - 1]);
    });

    it('makes a full circle when one value covers the symbol', function () {
      var wedges = getPieWedges({values: [10, 0], fills: ['red', 'green'], radius: 20}, 1);
      var ring = wedges[0].coordinates[0];
      assert.equal(wedges.length, 1);
      assert.equal(wedges[0].coordinates.length, 1);
      // a closed circle, with no vertex at the center
      assert.ok(ring.every(function(p) {return Math.round(radius(p)) == 20;}));
      assert.deepEqual(ring[0], ring[ring.length - 1]);
    });

    it('makes a hole ring when one value covers a donut', function () {
      var wedges = getPieWedges({values: [10, 0], fills: ['red', 'green'], radius: 20, hole: 10}, 1);
      var coords = wedges[0].coordinates;
      assert.equal(coords.length, 2);
      assert.ok(coords[0].every(function(p) {return Math.round(radius(p)) == 20;}));
      assert.ok(coords[1].every(function(p) {return Math.round(radius(p)) == 10;}));
      // the hole is wound opposite to the outer ring
      assert.ok(bearing(coords[0][1]) > 0);
      assert.ok(bearing(coords[1][1]) > 180);
    });
  });

  describe('getPieRadii()', function () {
    it('defaults to the radius option', function () {
      assert.deepEqual(getPieRadii({radius: 12}, 1), {inner: 0, outer: 12});
    });

    it('falls back to a default radius', function () {
      assert.deepEqual(getPieRadii({}, 1), {inner: 0, outer: 5});
    });

    it('makes a donut with the hole option', function () {
      assert.deepEqual(getPieRadii({radius: 30, hole: 25}, 1), {inner: 25, outer: 30});
      assert.deepEqual(getPieRadii({radius: 30, hole: '25'}, 1), {inner: 25, outer: 30});
    });

    it('measures a negative hole inward from the outer radius', function () {
      assert.deepEqual(getPieRadii({radius: 30, hole: -5}, 1), {inner: 25, outer: 30});
      assert.deepEqual(getPieRadii({radius: 30, hole: '-5'}, 1), {inner: 25, outer: 30});
    });

    it('leaves no hole when the hole is as wide as the symbol', function () {
      assert.deepEqual(getPieRadii({radius: 10, hole: 10}, 1), {inner: 0, outer: 10});
      assert.deepEqual(getPieRadii({radius: 10, hole: 20}, 1), {inner: 0, outer: 10});
    });

    it('leaves no hole when a negative hole is deeper than the symbol', function () {
      assert.deepEqual(getPieRadii({radius: 10, hole: -10}, 1), {inner: 0, outer: 10});
      assert.deepEqual(getPieRadii({radius: 10, hole: -20}, 1), {inner: 0, outer: 10});
    });

    it('ignores a hole that is missing or not a number', function () {
      assert.deepEqual(getPieRadii({radius: 10, hole: 0}, 1), {inner: 0, outer: 10});
      assert.deepEqual(getPieRadii({radius: 10, hole: 'wide'}, 1), {inner: 0, outer: 10});
      assert.deepEqual(getPieRadii({radius: 10, hole: null}, 1), {inner: 0, outer: 10});
      assert.deepEqual(getPieRadii({radius: 10}, 1), {inner: 0, outer: 10});
    });

    it('applies the scale factor', function () {
      assert.deepEqual(getPieRadii({radius: 20, hole: 10}, 2), {inner: 20, outer: 40});
    });
  });

  describe('makePieSymbol()', function () {
    it('makes a group of polygon parts, one per wedge', function () {
      var sym = makePieSymbol({
        values: [30, 70],
        fills: ['red', 'green'],
        radius: 10
      }, {});
      assert.equal(sym.type, 'group');
      assert.equal(sym.parts.length, 2);
      assert.equal(sym.parts[0].type, 'polygon');
      assert.equal(sym.parts[0].fill, 'red');
    });

    it('flips the y axis for SVG output', function () {
      var sym = makePieSymbol({values: [100], fills: ['red'], radius: 10}, {});
      // the first wedge starts at the top of the symbol, which is -y in SVG
      assert.deepEqual(sym.parts[0].coordinates[0][0], [0, -10]);
    });

    it('applies stroke and opacity to each part', function () {
      var sym = makePieSymbol({
        values: [50, 50],
        fills: ['red', 'green'],
        radius: 10,
        stroke: 'white',
        'stroke-width': 0.5,
        opacity: 0.8
      }, {});
      sym.parts.forEach(function(part) {
        assert.equal(part.stroke, 'white');
        assert.equal(part['stroke-width'], 0.5);
        assert.equal(part.opacity, 0.8);
      });
    });

    it('returns null when there is nothing to draw', function () {
      assert.strictEqual(makePieSymbol({values: [0, 0], fills: ['red', 'green']}, {}), null);
    });

    it('requires values= and fills=', function () {
      assert.throws(function() {
        makePieSymbol({fills: ['red']}, {});
      }, /requires a values=/);
      assert.throws(function() {
        makePieSymbol({values: [1]}, {});
      }, /requires a fills=/);
    });
  });

  describe('-symbols type=pie', function () {
    it('writes a group symbol to each record', async function () {
      var out = await api.applyCommands(
        '-i in.json -symbols type=pie values=a,b,c fills=red,green,blue radius=20 -o out.json',
        {'in.json': pointGeoJSON([{a: 30, b: 50, c: 20}])});
      var sym = JSON.parse(out['out.json']).features[0].properties['svg-symbol'];
      assert.equal(sym.type, 'group');
      assert.deepEqual(sym.parts.map(function(p) {return p.fill;}), ['red', 'green', 'blue']);
    });

    it('reads wedge values from data fields', async function () {
      var out = await api.applyCommands(
        '-i in.json -symbols type=pie values=a,b fills=red,green radius=20 -o out.json',
        {'in.json': pointGeoJSON([{a: 1, b: 3}, {a: 1, b: 1}])});
      var features = JSON.parse(out['out.json']).features;
      var first = features[0].properties['svg-symbol'];
      var second = features[1].properties['svg-symbol'];
      // 1:3 split, so the second wedge of the first symbol starts a quarter
      // of the way around; the 1:1 split starts halfway around
      assert.equal(Math.round(bearing(flipY(first.parts[1].coordinates[0][0]))), 90);
      assert.equal(Math.round(bearing(flipY(second.parts[1].coordinates[0][0]))), 180);

      function flipY(p) {
        return [p[0], -p[1]];
      }
    });

    it('accepts a fills= list containing an rgba() color', async function () {
      // commas inside parentheses don't split the list
      var out = await api.applyCommands(
        '-i in.json -symbols type=pie values=a,b "fills=rgba(255,0,0,0.5),#00f" radius=20 -o out.json',
        {'in.json': pointGeoJSON([{a: 1, b: 1}])});
      var sym = JSON.parse(out['out.json']).features[0].properties['svg-symbol'];
      assert.deepEqual(sym.parts.map(function(p) {return p.fill;}), ['rgba(255,0,0,0.5)', '#00f']);
    });

    it('accepts values= and fills= written as array expressions', async function () {
      var out = await api.applyCommands(
        '-i in.json -symbols type=pie "values=[a,b]" "fills=[\'red\',\'blue\']" radius=20 -o out.json',
        {'in.json': pointGeoJSON([{a: 1, b: 3}])});
      var sym = JSON.parse(out['out.json']).features[0].properties['svg-symbol'];
      assert.deepEqual(sym.parts.map(function(p) {return p.fill;}), ['red', 'blue']);
      // a 1:3 split, so the second wedge starts a quarter of the way around
      assert.equal(Math.round(bearing([
        sym.parts[1].coordinates[0][0][0], -sym.parts[1].coordinates[0][0][1]
      ])), 90);
    });

    it('accepts expressions and mixed values', async function () {
      var out = await api.applyCommands(
        '-i in.json -symbols type=pie "values=a*2,50" fills=red,green radius=20 -o out.json',
        {'in.json': pointGeoJSON([{a: 25}])});
      var sym = JSON.parse(out['out.json']).features[0].properties['svg-symbol'];
      assert.equal(sym.parts.length, 2);
    });

    it('omits the symbol when all of a feature\'s values are zero', async function () {
      var out = await api.applyCommands(
        '-i in.json -symbols type=pie values=a,b fills=red,green radius=20 -o out.json',
        {'in.json': pointGeoJSON([{a: 1, b: 1}, {a: 0, b: 0}])});
      var features = JSON.parse(out['out.json']).features;
      assert.ok(features[0].properties['svg-symbol']);
      assert.strictEqual(features[1].properties['svg-symbol'], undefined);
    });

    it('sizes a donut from data, with a band of constant width', async function () {
      // a negative hole saves repeating the radius= expression
      var out = await api.applyCommands(
        '-i in.json -symbols type=pie values=a fills=red radius=size hole=-5 -o out.json',
        {'in.json': pointGeoJSON([{a: 1, size: 20}, {a: 1, size: 12}])});
      var features = JSON.parse(out['out.json']).features;
      var radii = features.map(function(feat) {
        var coords = feat.properties['svg-symbol'].parts[0].coordinates;
        return [Math.round(radius(coords[0][0])), Math.round(radius(coords[1][0]))];
      });
      assert.deepEqual(radii, [[20, 15], [12, 7]]);
    });

    it('sizes a donut from data, with a hole in proportion to the symbol', async function () {
      var out = await api.applyCommands(
        '-i in.json -symbols type=pie values=a fills=red radius=size "hole=size * 0.5" -o out.json',
        {'in.json': pointGeoJSON([{a: 1, size: 20}, {a: 1, size: 12}])});
      var features = JSON.parse(out['out.json']).features;
      var radii = features.map(function(feat) {
        var coords = feat.properties['svg-symbol'].parts[0].coordinates;
        return [Math.round(radius(coords[0][0])), Math.round(radius(coords[1][0]))];
      });
      assert.deepEqual(radii, [[20, 10], [12, 6]]);
    });

    it('renders wedges as SVG paths', async function () {
      var out = await api.applyCommands(
        '-i in.json -symbols type=pie values=a,b,c fills=red,green,blue radius=20 -o out.svg width=400',
        {'in.json': pointGeoJSON([{a: 30, b: 50, c: 20}])});
      var svg = String(out['out.svg']);
      assert.equal((svg.match(/<path/g) || []).length, 3);
      assert.equal((svg.match(/fill="red"/g) || []).length, 1);
    });

    it('renders a donut hole with the evenodd fill rule', async function () {
      var out = await api.applyCommands(
        '-i in.json -symbols type=pie values=a fills=red radius=20 hole=10 -o out.svg width=400',
        {'in.json': pointGeoJSON([{a: 1}])});
      var svg = String(out['out.svg']);
      assert.equal((svg.match(/<path/g) || []).length, 1);
      assert.ok(svg.includes('fill-rule="evenodd"'));
    });

    it('is rejected in geographic mode', async function () {
      await assert.rejects(function() {
        return api.applyCommands(
          '-i in.json -proj webmercator -symbols type=pie values=a fills=red geographic -o out.json',
          {'in.json': pointGeoJSON([{a: 1}])});
      }, /does not support the geographic option/);
    });

    it('reports a misspelled field name in values=', async function () {
      await assert.rejects(function() {
        return api.applyCommands(
          '-i in.json -symbols type=pie values=a,bb fills=red,green -o out.json',
          {'in.json': pointGeoJSON([{a: 1, b: 2}])});
      }, /Unexpected value for values: bb/);
    });
  });
});
