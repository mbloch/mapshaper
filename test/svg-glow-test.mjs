import api from '../mapshaper.js';
import assert from 'assert';

var svg = api.internal.svg;

function square(x, y, size) {
  return {type: 'Polygon', coordinates: [[[x, y], [x, y + size], [x + size, y + size], [x + size, y], [x, y]]]};
}

function twoSquares() {
  return {
    type: 'FeatureCollection',
    features: [
      {type: 'Feature', properties: {name: 'a'}, geometry: square(0, 0, 10)},
      {type: 'Feature', properties: {name: 'b'}, geometry: square(20, 0, 10)}
    ]
  };
}

async function exportSVG(cmd, input) {
  var out = await api.applyCommands('-i in.json ' + cmd + ' -o out.svg', {'in.json': input || twoSquares()});
  return String(out['out.svg']);
}

function count(str, substr) {
  return str.split(substr).length - 1;
}

describe('svg-glow.mjs', function () {

  describe('getPolygonGlow()', function () {
    it('a glow needs a color', function () {
      assert.strictEqual(svg.getPolygonGlow({}, 'outer'), null);
      assert.strictEqual(svg.getPolygonGlow({'outer-glow-width': 8}, 'outer'), null);
      assert.strictEqual(svg.getPolygonGlow({'outer-glow-color': ' '}, 'outer'), null);
      assert.strictEqual(svg.getPolygonGlow({'outer-glow-color': 'none'}, 'outer'), null);
    });

    it('fills in the default width and opacity', function () {
      assert.deepStrictEqual(svg.getPolygonGlow({'outer-glow-color': 'black'}, 'outer'),
        {color: 'black', opacity: 1, width: 10});
      assert.deepStrictEqual(svg.getPolygonGlow({'inner-glow-color': '#fff', 'inner-glow-width': '6'}, 'inner'),
        {color: '#fff', opacity: 1, width: 6});
    });

    it('a glow with no width or opacity is no glow', function () {
      assert.strictEqual(svg.getPolygonGlow({'outer-glow-color': 'red', 'outer-glow-width': 0}, 'outer'), null);
      assert.strictEqual(svg.getPolygonGlow({'outer-glow-color': 'red', 'outer-glow-width': 'wide'}, 'outer'), null);
      assert.strictEqual(svg.getPolygonGlow({'outer-glow-color': 'red', 'outer-glow-opacity': 0}, 'outer'), null);
    });

    it('clamps the opacity', function () {
      assert.strictEqual(svg.getPolygonGlow({'inner-glow-color': 'red', 'inner-glow-opacity': 3}, 'inner').opacity, 1);
    });
  });

  describe('getLayerOuterGlow()', function () {
    function layer(records, shapes) {
      return {
        geometry_type: 'polygon',
        shapes: shapes || records.map(function() { return [[0]]; }),
        data: new api.internal.DataTable(records)
      };
    }

    var black = {'outer-glow-color': '#000000'};

    it('is the outer glow every feature shares', function () {
      var lyr = layer([black, Object.assign({'outer-glow-width': 10}, black)]);
      assert.deepStrictEqual(svg.getLayerOuterGlow(lyr), {color: '#000000', opacity: 1, width: 10});
    });

    it('is null if the features differ, or one has no outer glow', function () {
      assert.strictEqual(svg.getLayerOuterGlow(layer([black, Object.assign({'outer-glow-width': 4}, black)])), null);
      assert.strictEqual(svg.getLayerOuterGlow(layer([black, {}])), null);
    });

    it('leaves out features without a shape', function () {
      var lyr = layer([black, {}], [[[0]], null]);
      assert.deepStrictEqual(svg.getLayerOuterGlow(lyr), {color: '#000000', opacity: 1, width: 10});
    });
  });

  describe('getGlowFilterSpec()', function () {
    it('rounds the filter region up to a margin step', function () {
      var glow = {color: '#000000', opacity: 1, width: 8};
      // reach: 8 * 1.5 + 1 = 13px; 13% of a 100px shape, 130% of a 10px one
      var spec = svg.getGlowFilterSpec(glow, null, [0, 0, 100, 10], 0);
      assert.strictEqual(spec.marginX, 25);
      assert.strictEqual(spec.marginY, 200);
    });
  });

  describe('renderGlowFilter()', function () {
    it('blurs with a standard deviation of half the width', function () {
      var str = svg.renderGlowFilter('glow-1', {
        outer: {color: '#000000', opacity: 0.5, width: 8},
        inner: {color: '#ffffff', opacity: 0.6, width: 5},
        marginX: 25, marginY: 50
      });
      assert(str.includes('<filter id="glow-1" x="-25%" y="-50%" width="150%" height="200%" color-interpolation-filters="sRGB">'));
      assert(str.includes('stdDeviation="4"'));
      assert(str.includes('stdDeviation="2.5"'));
      assert(str.includes('<feMerge><feMergeNode in="outer"/><feMergeNode in="SourceGraphic"/><feMergeNode in="inner"/></feMerge>'));
    });
  });

  describe('-o format=svg', function () {
    it('an outer glow on every feature goes on the layer', async function () {
      var str = await exportSVG('-style fill=#4a7fb0 outer-glow-color=black outer-glow-width=8 outer-glow-opacity=0.5');
      assert.strictEqual(count(str, '<filter '), 1);
      assert(/<g id="in" filter="url\(#glow-1\)"/.test(str));
      assert(str.includes('flood-opacity="0.5"'));
      // the glow is not an attribute of the paths
      assert(!str.includes('outer-glow'));
    });

    it('inner glows go on a group around each feature', async function () {
      var str = await exportSVG('-style fill=#4a7fb0 inner-glow-color=white ids=1');
      assert.strictEqual(count(str, '<filter '), 1);
      assert(/<g filter="url\(#glow-1\)">\s*<path [^>]*fill="#4a7fb0"/.test(str));
      assert(!/<g id="in" filter=/.test(str));
    });

    it('different outer glows go on each feature', async function () {
      var str = await exportSVG('-style outer-glow-color=black -style ids=1 outer-glow-width=4');
      assert.strictEqual(count(str, '<filter '), 2);
      assert.strictEqual(count(str, '<g filter="url(#glow-'), 2);
    });

    it('features with the same glows share a filter', async function () {
      var str = await exportSVG('-style inner-glow-color=white');
      assert.strictEqual(count(str, '<filter '), 1);
      assert.strictEqual(count(str, '<g filter="url(#glow-1)">'), 2);
    });

    it('a feature\'s id moves to the group around it', async function () {
      var out = await api.applyCommands('-i in.json -style inner-glow-color=white ids=0 -o out.svg id-field=name',
        {'in.json': twoSquares()});
      var str = String(out['out.svg']);
      assert(/<g id="a" filter="url\(#glow-1\)">\s*<path d=/.test(str));
      assert(/<path [^>]*id="b"/.test(str));
    });

    it('no color, a color of none or a width of 0 draws no glow', async function () {
      var str = await exportSVG('-style outer-glow-width=8 inner-glow-color=none -style ids=1 outer-glow-color=red outer-glow-width=0');
      assert(!str.includes('<filter'));
    });
  });

  describe('-style', function () {
    it('an empty value removes a glow setting', async function () {
      var out = await api.applyCommands('-i in.json -style outer-glow-width=8 outer-glow-color=red -style outer-glow-width=\'\' -o out.json',
        {'in.json': twoSquares()});
      var props = JSON.parse(out['out.json']).features[0].properties;
      assert.strictEqual(props['outer-glow-color'], 'red');
      assert(!('outer-glow-width' in props));
    });

    it('clear removes the glows', async function () {
      var out = await api.applyCommands('-i in.json -style outer-glow-width=8 inner-glow-opacity=0.5 -style clear -o out.json',
        {'in.json': twoSquares()});
      var props = JSON.parse(out['out.json']).features[0].properties;
      assert.deepStrictEqual(props, {name: 'a'});
    });
  });
});
