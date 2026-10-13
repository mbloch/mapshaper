import api from '../mapshaper.js';
import assert from 'assert';
import { getCanvasDisplayStyle } from '../src/gui/gui-layer-styler.mjs';
import { pointIsUnstyled, UNSTYLED_POINT_MARKER } from '../src/gui/gui-unstyled-points.mjs';
import { getAddIconOptions, getDefaultIconStyle } from '../src/gui/gui-symbol-style.mjs';
import { getUpdatePointCommand, getRestyleSymbolCommand } from '../src/gui/gui-symbol-commands.mjs';

function pointLayer(records) {
  return {
    geometry_type: 'point',
    shapes: records.map(function(rec, i) { return [[i, i]]; }),
    data: new api.internal.DataTable(records)
  };
}

describe('gui-unstyled-points.mjs', function () {
  it('pointIsUnstyled()', function () {
    assert.equal(pointIsUnstyled({}), true);
    assert.equal(pointIsUnstyled({name: 'a', fill: 'red'}), true);
    assert.equal(pointIsUnstyled({r: 0}), true);
    assert.equal(pointIsUnstyled({r: 3}), false);
    assert.equal(pointIsUnstyled({icon: 'star', 'icon-size': 10}), false);
    assert.equal(pointIsUnstyled({'label-text': ''}), false);
  });

  // The canvas styler mutates one style object from point to point (see
  // drawPoints() in gui-canvas.mjs), so a point after a marker must not be
  // left with the marker's paint.
  it('the canvas draws a marker for a point with no radius in a layer of circles', function () {
    var lyr = pointLayer([{r: 4, fill: 'red'}, {}, {r: 2, fill: 'blue'}]);
    var base = getCanvasDisplayStyle(lyr);
    var style = Object.assign({}, base);
    var out = [0, 1, 2].map(function(i) {
      base.styler(style, i);
      return {radius: style.radius, fillColor: style.fillColor, strokeColor: style.strokeColor};
    });
    assert.deepEqual(out[0], {radius: 4, fillColor: 'red', strokeColor: undefined});
    assert.deepEqual(out[1], {radius: UNSTYLED_POINT_MARKER.radius,
      fillColor: UNSTYLED_POINT_MARKER.fill, strokeColor: UNSTYLED_POINT_MARKER.stroke});
    assert.deepEqual(out[2], {radius: 2, fillColor: 'blue', strokeColor: undefined});
  });
});

describe('Convert to symbols', function () {
  it('gives every plain point the default symbol, a circle drawn with r=', async function () {
    var input = {type: 'FeatureCollection', features: [
      {type: 'Feature', properties: {name: 'a'}, geometry: {type: 'Point', coordinates: [0, 0]}}
    ]};
    var cmd = getRestyleSymbolCommand(getAddIconOptions(getDefaultIconStyle()), null);
    assert.equal(cmd, '-symbols type=circle radius=5 fill=#333333');
    var out = await api.applyCommands('-i in.json ' + cmd + ' -o out.json', {'in.json': input});
    var props = JSON.parse(out['out.json']).features[0].properties;
    assert.deepEqual(props, {name: 'a', r: 5, fill: '#333333'});
  });
});

describe('getUpdatePointCommand()', function () {
  it('moves one point', function () {
    assert.equal(getUpdatePointCommand([[1, 2]], 3), '-update-point ids=3 coordinates=1,2');
  });
});
