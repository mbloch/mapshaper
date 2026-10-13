import api from '../mapshaper.js';
import assert from 'assert';
import {
  getLineCasing, getCasingStrokeWidth, getLineCasingCap, layerHasCasing
} from '../src/svg/svg-line-casing.mjs';
import { getPathStrokeOutset } from '../src/svg/svg-symbol-bounds.mjs';
import { getCanvasDisplayStyle, layerHasDrawableStyle } from '../src/gui/gui-layer-styler.mjs';
import { setCasingStyle } from '../src/gui/gui-canvas';
import {
  getCasingColorEdits, getCasingOffEdits, getShownCasing, getCasingState
} from '../src/gui/gui-casing-control';

function twoLines() {
  return {
    type: 'FeatureCollection',
    features: [
      {type: 'Feature', properties: {name: 'a'},
        geometry: {type: 'LineString', coordinates: [[0, 0], [10, 0]]}},
      {type: 'Feature', properties: {name: 'b'},
        geometry: {type: 'LineString', coordinates: [[0, 5], [10, 5]]}}
    ]
  };
}

async function exportSVG(cmd, input) {
  var out = await api.applyCommands('-i in.json ' + cmd + ' -o out.svg',
    {'in.json': input || twoLines()});
  return String(out['out.svg']);
}

function count(str, substr) {
  return str.split(substr).length - 1;
}

describe('svg-line-casing.mjs', function () {

  describe('getLineCasing()', function () {
    it('a casing needs a color', function () {
      assert.strictEqual(getLineCasing({}), null);
      assert.strictEqual(getLineCasing({'casing-width': 2}), null);
      assert.strictEqual(getLineCasing({'casing-color': ' '}), null);
      assert.strictEqual(getLineCasing({'casing-color': 'none'}), null);
    });

    it('fills in the default width and opacity', function () {
      assert.deepStrictEqual(getLineCasing({'casing-color': 'white'}),
        {color: 'white', width: 1, opacity: 1});
      assert.deepStrictEqual(getLineCasing({'casing-color': '#fff', 'casing-width': '3'}),
        {color: '#fff', width: 3, opacity: 1});
    });

    it('a casing with no width or opacity is no casing', function () {
      assert.strictEqual(getLineCasing({'casing-color': 'red', 'casing-width': 0}), null);
      assert.strictEqual(getLineCasing({'casing-color': 'red', 'casing-width': 'wide'}), null);
      assert.strictEqual(getLineCasing({'casing-color': 'red', 'casing-opacity': 0}), null);
      assert.strictEqual(getLineCasing({'casing-color': 'red', opacity: 0}), null);
    });

    it('is faded by the line\'s opacity, but not its stroke-opacity', function () {
      var rec = {'casing-color': 'red', 'casing-opacity': 0.5, opacity: 0.5, 'stroke-opacity': 0.2};
      assert.strictEqual(getLineCasing(rec).opacity, 0.25);
    });
  });

  describe('getCasingStrokeWidth()', function () {
    it('is the line width plus the casing on each side', function () {
      assert.strictEqual(getCasingStrokeWidth(3, {width: 2}), 7);
      assert.strictEqual(getCasingStrokeWidth('0.5', {width: 1}), 2.5);
      assert.strictEqual(getCasingStrokeWidth(0, {width: 1}), 2);
    });

    it('a line with no width is 1px wide', function () {
      assert.strictEqual(getCasingStrokeWidth(undefined, {width: 1}), 3);
    });
  });

  describe('getLineCasingCap()', function () {
    it('is the line\'s own cap, or butt for a dashed line', function () {
      assert.strictEqual(getLineCasingCap({}), null);
      assert.strictEqual(getLineCasingCap({'stroke-linecap': 'square'}), 'square');
      assert.strictEqual(getLineCasingCap({'stroke-dasharray': '4 2'}), 'butt');
      assert.strictEqual(getLineCasingCap({'stroke-dasharray': '4 2', 'stroke-linecap': 'round'}), 'round');
    });
  });

  describe('SVG export', function () {
    it('draws every casing beneath every line, in a group of the layer\'s own', async function () {
      var svg = await exportSVG('-style stroke=red stroke-width=2 casing-color=white casing-width=1.5');
      var casingAt = svg.indexOf('<g id="in-casing">');
      assert.ok(casingAt > svg.indexOf('<g id="in"'));
      assert.strictEqual(count(svg, 'stroke="white"'), 2);
      assert.strictEqual(count(svg, 'stroke-width="5"'), 2);
      assert.ok(svg.lastIndexOf('stroke="white"') < svg.indexOf('stroke="red"'));
    });

    it('has the line\'s caps and joins, a dashed line\'s butt caps, and no dashes', async function () {
      var svg = await exportSVG('-each "this.properties[\'stroke-linejoin\'] = \'miter\'" ' +
        '-style stroke-dasharray="4 2" casing-color=white');
      var casing = svg.slice(svg.indexOf('<g id="in-casing">'), svg.indexOf('</g>'));
      assert.ok(casing.includes('stroke-linecap="butt"'));
      assert.ok(casing.includes('stroke-linejoin="miter"'));
      assert.ok(!casing.includes('stroke-dasharray'));
    });

    it('writes an opacity below 1 as stroke-opacity', async function () {
      var svg = await exportSVG('-style casing-color=white casing-opacity=0.5 opacity=0.5');
      assert.ok(svg.includes('stroke-opacity="0.25"'));
    });

    it('gives only the features that have a casing one', async function () {
      var svg = await exportSVG('-style casing-color=white where="name == \'a\'"');
      assert.strictEqual(count(svg, 'stroke="white"'), 1);
    });

    it('a layer without casings has no casing group', async function () {
      var svg = await exportSVG('-style stroke=red');
      assert.ok(!svg.includes('-casing'));
    });

    it('keeps svg-data attributes on the features, not the casings', async function () {
      var out = await api.applyCommands('-i in.json -style casing-color=white -o out.svg svg-data=name',
        {'in.json': twoLines()});
      var svg = String(out['out.svg']);
      var casing = svg.slice(svg.indexOf('<g id="in-casing">'), svg.indexOf('</g>'));
      assert.ok(!casing.includes('data-name'));
      assert.strictEqual(count(svg, 'data-name='), 2);
    });

    it('stops a casing at the line\'s arrowheads', async function () {
      var svg = await exportSVG('-style line-end=arrow casing-color=white',
        {type: 'LineString', coordinates: [[0, 0], [100, 0]]});
      var casingEnd = svg.indexOf('</g>');
      var casing = svg.slice(svg.indexOf('<g id="in-casing">'), casingEnd);
      var d = / d="([^"]+)"/.exec(casing)[1];
      var lineD = / d="([^"]+)"/.exec(svg.slice(casingEnd))[1];
      // the line is cut back to meet its head, and the casing with it
      assert.strictEqual(d, lineD);
      assert.ok(svg.includes(' Z"'), 'has an arrowhead');
    });

    it('-style clear removes the casing', async function () {
      var svg = await exportSVG('-style casing-color=white -style clear');
      assert.ok(!svg.includes('-casing'));
    });

    it('re-importing the SVG leaves the casings out', async function () {
      var svg = await exportSVG('-style casing-color=white');
      var out = await api.applyCommands('-i in.svg -o out.json', {'in.svg': svg});
      var json = JSON.parse(out['out.json']);
      assert.strictEqual(json.features.length, 2);
    });
  });

  describe('layerHasCasing()', function () {
    it('is true for a line layer with a casing', function () {
      var lyr = {geometry_type: 'polyline', data: new api.internal.DataTable([{'casing-color': 'red'}, {}])};
      assert.ok(layerHasCasing(lyr));
      lyr.data = new api.internal.DataTable([{'casing-color': 'none'}]);
      assert.ok(!layerHasCasing(lyr));
    });
  });

  describe('getPathStrokeOutset()', function () {
    it('reaches as far as a line\'s casing', function () {
      assert.strictEqual(getPathStrokeOutset({'stroke-width': 2, 'casing-color': 'white', 'casing-width': 3}, 'polyline'), 4);
      assert.strictEqual(getPathStrokeOutset({stroke: 'none', 'casing-color': 'white'}, 'polyline'), 1.5);
    });

    it('polygons have no casing', function () {
      assert.strictEqual(getPathStrokeOutset({stroke: 'red', 'stroke-width': 2, 'casing-color': 'white'}, 'polygon'), 1);
    });
  });
});

describe('line casings in the GUI', function () {
  function makeLayer(records) {
    return {geometry_type: 'polyline', data: new api.internal.DataTable(records)};
  }

  describe('getCanvasDisplayStyle()', function () {
    it('a line layer with only casings is drawn styled, with a black 1px line', function () {
      var lyr = makeLayer([{'casing-color': 'white'}, {}]);
      var style = getCanvasDisplayStyle(lyr);
      assert.ok(layerHasDrawableStyle(lyr));
      assert.ok(style.hasCasings);
      assert.equal(style.strokeColor, 'black');
      assert.equal(style.strokeWidth, 1);
    });

    it('sets each feature\'s casing, clearing it on the reused style object', function () {
      var lyr = makeLayer([{'casing-color': 'white', 'casing-width': 2, stroke: 'red'}, {stroke: 'blue'}]);
      var base = getCanvasDisplayStyle(lyr);
      var drawStyle = Object.assign({}, base);
      base.styler(drawStyle, 0);
      assert.deepStrictEqual(drawStyle.casing, {color: 'white', width: 2, opacity: 1});
      base.styler(drawStyle, 1);
      assert.strictEqual(drawStyle.casing, null);
    });

    it('a layer without casing fields has none', function () {
      var style = getCanvasDisplayStyle(makeLayer([{stroke: 'red'}]));
      assert.ok(!style.hasCasings);
      assert.ok(!layerHasDrawableStyle(makeLayer([{'casing-width': 3}])));
    });
  });

  describe('setCasingStyle()', function () {
    it('is the line widened by the casing, without dashes', function () {
      var out = setCasingStyle({}, {strokeWidth: 2, lineDash: '4 2', lineJoin: 'miter'},
        {color: 'white', width: 1.5, opacity: 0.5});
      assert.deepStrictEqual(out, {strokeColor: 'white', strokeWidth: 5, strokeOpacity: 0.5,
        lineCap: 'butt', lineJoin: 'miter', miterLimit: undefined});
    });

    it('overwrites every property of a reused style', function () {
      var out = setCasingStyle({}, {strokeWidth: 1, lineCap: 'square', lineJoin: 'miter', miterLimit: 4},
        {color: 'red', width: 1, opacity: 1});
      setCasingStyle(out, {strokeWidth: 1}, {color: 'blue', width: 2, opacity: 1});
      assert.deepStrictEqual(out, {strokeColor: 'blue', strokeWidth: 5, strokeOpacity: 1,
        lineCap: 'round', lineJoin: undefined, miterLimit: undefined});
    });
  });

  describe('casing control', function () {
    var records = [{'casing-color': 'white', 'casing-width': 2}, {}, {'casing-color': 'white', 'casing-width': 2}];

    it('reports whether the targets have a casing', function () {
      assert.strictEqual(getCasingState(records, [0, 2]), 'on');
      assert.strictEqual(getCasingState(records, [0, 1]), 'mixed');
      assert.strictEqual(getCasingState(records, [1]), 'off');
    });

    it('a color adds the casing, with the pending width where a line has none', function () {
      assert.deepStrictEqual(getCasingColorEdits(records, [0, 1], '#ff0000', {width: 3, opacity: 1}), [
        {id: 0, styles: [['casing-color', '#ff0000']]},
        {id: 1, styles: [['casing-color', '#ff0000'], ['casing-width', 3]]}
      ]);
    });

    it('an empty color removes the color', function () {
      assert.deepStrictEqual(getCasingColorEdits(records, [0, 1], '', {}), [
        {id: 0, styles: [['casing-color', '']]}
      ]);
    });

    it('removing the casing removes all its fields', function () {
      assert.deepStrictEqual(getCasingOffEdits(records, [0, 1]), [
        {id: 0, styles: [['casing-color', ''], ['casing-width', '']]}
      ]);
    });

    it('shows the casing the targets share', function () {
      assert.deepStrictEqual(getShownCasing(records, [0, 2]),
        {color: 'white', mixed: false, width: 2, opacity: 1});
      assert.deepStrictEqual(getShownCasing(records, [0, 1]),
        {color: '', mixed: true, width: 2, opacity: 1});
      assert.deepStrictEqual(getShownCasing(records, [1], {width: 4}),
        {color: '', mixed: false, width: 4, opacity: ''});
    });
  });
});
