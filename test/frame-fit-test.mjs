import assert from 'assert';
import api from '../mapshaper.js';
import { getPointSymbolBox, getPathLabelPadding } from '../src/svg/svg-symbol-bounds';
import { fitBboxToSymbols, getFrameScale } from '../src/furniture/mapshaper-frame-fit';
import { setTextMeasureFunction, clearTextWidthCache } from '../src/svg/svg-label-metrics';

// Text is measured with a fixed width per character, so that results don't
// depend on the fonts installed on the machine running the tests.
function fakeMeasurer(pxPerChar) {
  return function(rec) {
    var size = Number(rec['font-size']) || 12;
    return String(rec['label-text'] || '').length * pxPerChar * size / 12;
  };
}

// The bundle has its own copy of the metrics module, which is the one that
// commands measure with.
function measureInBundle(pxPerChar) {
  api.internal.svg.setTextMeasureFunction(fakeMeasurer(pxPerChar));
  api.internal.svg.clearTextWidthCache();
}

function restoreBundleMeasurement() {
  api.internal.fonts.initNodeTextMeasurement();
  api.internal.svg.clearTextWidthCache();
}

function pointsJSON(features) {
  return JSON.stringify({
    type: 'FeatureCollection',
    features: features.map(function(o) {
      return {
        type: 'Feature',
        properties: o.properties,
        geometry: {type: 'Point', coordinates: o.coordinates}
      };
    })
  });
}

async function getFrame(cmd, input) {
  var out = await api.applyCommands(cmd + ' -o target=frame out.json format=geojson', input);
  var feature = JSON.parse(out['out.json']).features[0];
  return {bbox: getRingBbox(feature.geometry.coordinates[0]), properties: feature.properties};
}

function getRingBbox(ring) {
  return ring.reduce(function(bbox, p) {
    return [Math.min(bbox[0], p[0]), Math.min(bbox[1], p[1]),
      Math.max(bbox[2], p[0]), Math.max(bbox[3], p[1])];
  }, [Infinity, Infinity, -Infinity, -Infinity]);
}

function assertBbox(a, b) {
  assert.equal(a.length, 4);
  a.forEach(function(val, i) {
    assert(Math.abs(val - b[i]) < 1e-9, 'Expected ' + JSON.stringify(a) +
      ' to equal ' + JSON.stringify(b));
  });
}

// Two dots of radius 10, at opposite corners of a 100 x 100 extent
var DOTS = {
  'dots.json': pointsJSON([
    {coordinates: [0, 0], properties: {r: 10}},
    {coordinates: [100, 100], properties: {r: 10}}
  ])
};

describe('mapshaper-frame-fit.mjs', function() {

  describe('getPointSymbolBox()', function() {
    afterEach(function() {
      setTextMeasureFunction(null);
      clearTextWidthCache();
    });

    it('returns null when nothing is drawn', function() {
      assert.strictEqual(getPointSymbolBox({}), null);
      assert.strictEqual(getPointSymbolBox({name: 'x'}), null);
    });

    it('sizes a dot, including half of its stroke', function() {
      assert.deepEqual(getPointSymbolBox({r: 5}), [-5, -5, 5, 5]);
      assert.deepEqual(getPointSymbolBox({r: 5, stroke: 'black', 'stroke-width': 2}),
        [-6, -6, 6, 6]);
    });

    it('sizes an icon', function() {
      assert.deepEqual(getPointSymbolBox({icon: 'square', r: 4}), [-4, -4, 4, 4]);
      assert.strictEqual(getPointSymbolBox({icon: 'unknown', r: 4}), null);
    });

    it('sizes a polygon symbol from its coordinates', function() {
      var sym = {type: 'polygon', coordinates: [[[0, 0], [10, 0], [10, -20], [0, 0]]]};
      assert.deepEqual(getPointSymbolBox({'svg-symbol': JSON.stringify(sym)}), [0, -20, 10, 0]);
      assert.deepEqual(getPointSymbolBox({'svg-symbol': sym}), [0, -20, 10, 0]);
    });

    it('follows offset and line parts in a group', function() {
      var offset = {type: 'group', parts: [
        {type: 'offset', dx: 10, dy: 5},
        {type: 'circle', r: 2}
      ]};
      var chained = {type: 'group', parts: [
        {type: 'line', dx: 10, dy: 0},
        {type: 'circle', r: 1}
      ]};
      assert.deepEqual(getPointSymbolBox({'svg-symbol': JSON.stringify(offset)}), [8, 3, 12, 7]);
      assert.deepEqual(getPointSymbolBox({'svg-symbol': JSON.stringify(chained)}),
        [-0.5, -1, 11, 1]);
    });

    it('ignores symbols that cannot be sized', function() {
      assert.strictEqual(getPointSymbolBox({'svg-symbol': '{"tag": "rect"}'}), null);
      assert.strictEqual(getPointSymbolBox({'svg-symbol': 'not json'}), null);
    });

    it('reuses the box of a repeated symbol string', function() {
      var cache = new Map();
      var str = JSON.stringify({type: 'circle', r: 3});
      getPointSymbolBox({'svg-symbol': str}, cache);
      assert.deepEqual(cache.get(str), [-3, -3, 3, 3]);
    });

    it('sizes a label from its measured width, anchor and offset', function() {
      setTextMeasureFunction(function() { return 60; });
      var box = getPointSymbolBox({'label-text': 'Place', 'font-size': 10,
        'text-anchor': 'start', dx: 6});
      assertBbox(box, [6, -8, 66, 2]);
    });

    it('adds a halo to a label', function() {
      setTextMeasureFunction(function() { return 60; });
      var box = getPointSymbolBox({'label-text': 'Place', 'font-size': 10,
        'text-anchor': 'start', dx: 6, 'halo-width': 2});
      assertBbox(box, [4, -10, 68, 4]);
    });

    it('estimates the width of text that cannot be measured', function() {
      var box = getPointSymbolBox({'label-text': 'abcd', 'font-size': 10});
      assertBbox(box, [-12, -8, 12, 2]);
    });

    it('merges a label with the symbol at its anchor', function() {
      setTextMeasureFunction(function() { return 60; });
      var box = getPointSymbolBox({'label-text': 'Place', 'font-size': 10,
        'text-anchor': 'start', dx: 6, r: 12});
      assertBbox(box, [-12, -12, 66, 12]);
    });

    it('pads a path label by its font size', function() {
      assert.equal(getPathLabelPadding({'label-text': 'x', 'font-size': 14}), 14);
      assert.equal(getPathLabelPadding({'label-text': 'x', 'font-size': 14, 'halo-width': 3}), 17);
    });
  });

  describe('fitBboxToSymbols()', function() {
    function scaleForWidth(width) {
      return function(bbox) { return getFrameScale(bbox, width, null); };
    }

    it('finds the smallest scale at which the symbols fit', function() {
      // 50px to the left of the first point, 30px to the right of the second
      var items = [
        0, 0, -50, -5, 0, 5,
        100, 50, 0, -5, 30, 5
      ];
      var bbox = fitBboxToSymbols([0, 0, 100, 50], items, scaleForWidth(800));
      var s = 100 / (800 - 80);
      assertBbox(bbox, [-50 * s, -5 * s, 100 + 30 * s, 50 + 5 * s]);
      assert(Math.abs(getFrameScale(bbox, 800, null) - s) < 1e-12);
    });

    it('is exact when the scale is fixed', function() {
      var bbox = fitBboxToSymbols([0, 0, 100, 50], [0, 0, -10, -10, 10, 10],
        function() { return 2; });
      assertBbox(bbox, [-20, -20, 100, 50]);
    });

    it('returns null when the symbols are wider than the page', function() {
      var items = [0, 0, -500, 0, 0, 0, 100, 0, 0, 0, 400, 0];
      assert.strictEqual(fitBboxToSymbols([0, 0, 100, 50], items, scaleForWidth(800)), null);
    });

    it('leaves content with no extent to set a scale unchanged', function() {
      var bbox = fitBboxToSymbols([5, 5, 5, 5], [5, 5, -10, -10, 10, 10], scaleForWidth(800));
      assert.deepEqual(bbox, [5, 5, 5, 5]);
    });
  });

  describe('-frame', function() {
    afterEach(restoreBundleMeasurement);

    it('makes room for dots', async function() {
      var frame = await getFrame('-i dots.json -frame width=800', DOTS);
      var s = 100 / 780;
      assertBbox(frame.bbox, [-10 * s, -10 * s, 100 + 10 * s, 100 + 10 * s]);
      assert.equal(frame.properties.width, 800);
    });

    it('fits to point locations with ignore-symbols', async function() {
      var frame = await getFrame('-i dots.json -frame width=800 ignore-symbols', DOTS);
      assertBbox(frame.bbox, [0, 0, 100, 100]);
    });

    it('adds a pixel offset outside the symbols', async function() {
      var frame = await getFrame('-i dots.json -frame width=800 offset=10px', DOTS);
      var s = (frame.bbox[2] - frame.bbox[0]) / 800;
      assert(Math.abs((0 - frame.bbox[0]) / s - 20) < 1e-6);
      assert(Math.abs((frame.bbox[2] - 100) / s - 20) < 1e-6);
    });

    it('makes room for symbols in a frame with a fixed shape', async function() {
      var frame = await getFrame('-i dots.json -frame width=800 height=400', DOTS);
      var s = 100 / 780;
      var w = frame.bbox[2] - frame.bbox[0];
      var h = frame.bbox[3] - frame.bbox[1];
      assert(Math.abs(w / h - 2) < 1e-9);
      // the height is the tight side
      assert(Math.abs(h / 400 - 100 / 380) < 1e-9);
      assert(w / 800 > s);
    });

    it('makes room for labels', async function() {
      measureInBundle(6); // 6px per character at 12px
      var input = {'places.json': pointsJSON([
        {coordinates: [0, 0], properties: {'label-text': 'West', 'text-anchor': 'end', dx: -6}},
        {coordinates: [100, 50], properties: {'label-text': 'East', 'text-anchor': 'start', dx: 6}}
      ])};
      var frame = await getFrame('-i places.json -frame width=800', input);
      var s = (frame.bbox[2] - frame.bbox[0]) / 800;
      // each label reaches 6 + 24 px from its point
      assert(Math.abs((0 - frame.bbox[0]) / s - 30) < 1e-6);
      assert(Math.abs((frame.bbox[2] - 100) / s - 30) < 1e-6);
    });

    it('still rejects content with no extent', async function() {
      var input = {'pt.json': pointsJSON([{coordinates: [0, 0], properties: {r: 5}}])};
      await assert.rejects(api.applyCommands('-i pt.json -frame width=800', input),
        /collapsed bbox/);
    });
  });

  describe('-update-frame fit=', function() {
    it('fits the frame to a layer and its symbols', async function() {
      var fitted = await getFrame('-i dots.json name=dots -frame width=800', DOTS);
      var updated = await getFrame(
        '-i dots.json name=dots -frame bbox=0,0,1,1 width=800 name=frame ' +
        '-update-frame fit=dots target=frame', DOTS);
      assertBbox(updated.bbox, fitted.bbox);
    });

    it('holds the scale with fix-scale', async function() {
      var frame = await getFrame(
        '-i dots.json name=dots -frame bbox=0,0,100,100 width=800 name=frame ' +
        '-update-frame fit=dots fix-scale target=frame', DOTS);
      assertBbox(frame.bbox, [-1.25, -1.25, 101.25, 101.25]);
      assert.equal(frame.properties.width, 820);
    });

    it('fits to point locations with ignore-symbols', async function() {
      var frame = await getFrame(
        '-i dots.json name=dots -frame bbox=0,0,1,1 width=800 name=frame ' +
        '-update-frame fit=dots ignore-symbols target=frame', DOTS);
      assertBbox(frame.bbox, [0, 0, 100, 100]);
    });

    it('rejects bbox= with fit=', async function() {
      await assert.rejects(api.applyCommands(
        '-i dots.json name=dots -frame bbox=0,0,1,1 width=800 name=frame ' +
        '-update-frame fit=dots bbox=0,0,2,2 target=frame', DOTS),
      /mutually exclusive/);
    });

    it('rejects fit= that names only the frame', async function() {
      await assert.rejects(api.applyCommands(
        '-frame bbox=0,0,1,1 width=800 name=frame -update-frame fit=frame target=frame'),
      /no layers to fit/);
    });
  });
});
