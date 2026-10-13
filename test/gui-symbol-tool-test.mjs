import assert from 'assert';
import api from '../mapshaper.js';
import {
  getSymbolTarget, getAddSymbolCommand, getUpdateSymbolCommand,
  getSymbolStyleCommand, getRestyleSymbolCommand, getSymbolDeleteCommand
} from '../src/gui/gui-symbol-commands.mjs';
import {
  getAddIconOptions, getAddCurveOptions, getIconShape, getIconSize, getIconPaint,
  getIconStyle, getRestyleIconOptions, getCurveStyle,
  getArrowheadPosition, getArrowheadFields, getDefaultIconStyle, getDefaultCurveStyle,
  getShapeChangeStyle
} from '../src/gui/gui-symbol-style.mjs';

// Runs commands against an empty session and returns the records of the
// layer named @name
async function getRecords(cmd, name) {
  var out = await api.applyCommands(cmd + ' -o format=geojson', {});
  var json = JSON.parse(out[(name || 'symbols') + '.json']);
  return json.features.map(function(f) { return f.properties; });
}

function pointLayer(n, name) {
  var shapes = [];
  for (var i = 0; i < n; i++) shapes.push([[i, i]]);
  return {name: name, geometry_type: 'point', shapes: shapes};
}

describe('gui-symbol-commands.mjs', function () {
  describe('getSymbolTarget()', function () {
    var yes = function() { return true; };
    var no = function() { return false; };

    it('makes a new layer when there is no layer', function () {
      assert.deepEqual(getSymbolTarget(null, yes),
        {mode: 'new', newLayerName: 'symbols', target: null});
    });

    it('joins an annotation layer, or an empty point layer', function () {
      assert.deepEqual(getSymbolTarget(pointLayer(3, 'notes'), yes),
        {mode: 'existing', target: 'notes'});
      assert.deepEqual(getSymbolTarget(pointLayer(0, 'pts'), no),
        {mode: 'existing', target: 'pts'});
    });

    it('puts a symbol beside a data layer, or a non-point layer', function () {
      assert.deepEqual(getSymbolTarget(pointLayer(3, 'cities'), no),
        {mode: 'new', newLayerName: 'symbols', target: 'cities'});
      assert.deepEqual(getSymbolTarget({name: 'states', geometry_type: 'polygon', shapes: []}, yes),
        {mode: 'new', newLayerName: 'symbols', target: 'states'});
    });
  });

  it('getAddSymbolCommand()', function () {
    assert.equal(getAddSymbolCommand([[1, 2]], {
      options: {type: 'star', radius: 5, fill: '#cc0000', rotation: ''},
      target: {mode: 'existing', target: 'notes'}
    }), '-symbols coordinates=1,2 type=star radius=5 fill=#cc0000 target=notes');
    assert.equal(getAddSymbolCommand([[1, 2], [3, 4]], {
      options: {type: 'curve'},
      target: {mode: 'new', newLayerName: 'symbols', target: 'states'}
    }), '-symbols coordinates=1,2,3,4 type=curve no-replace name=symbols target=states');
  });

  it('getUpdateSymbolCommand()', function () {
    assert.equal(getUpdateSymbolCommand([[1, 2], [3, 4]], 5, 'notes'),
      '-update-symbol ids=5 coordinates=1,2,3,4 target=notes');
    assert.equal(getUpdateSymbolCommand([[1, 2]], 0), '-update-symbol ids=0 coordinates=1,2');
  });

  it('getSymbolStyleCommand()', function () {
    assert.equal(getSymbolStyleCommand({stroke: '#fff', 'line-end': ''}, [1, 3], 'notes'),
      '-style stroke=#fff line-end= ids=1,3 target=notes');
  });

  it('getRestyleSymbolCommand()', function () {
    assert.equal(getRestyleSymbolCommand({type: 'star', radius: 5, fill: '#cc0000', rotation: ''},
      [1, 3], 'notes'), '-symbols ids=1,3 type=star radius=5 fill=#cc0000 target=notes');
    assert.equal(getRestyleSymbolCommand({type: 'circle', radius: 5}, null),
      '-symbols type=circle radius=5');
  });

  it('getSymbolDeleteCommand()', function () {
    assert.equal(getSymbolDeleteCommand([2]), "-filter 'this.id !== 2'");
    assert.equal(getSymbolDeleteCommand([2, 5], 'notes'),
      "-filter '[2,5].indexOf(this.id) == -1' target=notes");
  });

  it('commands run, and edit the right features', async function () {
    var cmd = [
      getAddSymbolCommand([[0, 0]], {options: {type: 'circle', radius: 3}}),
      getAddSymbolCommand([[1, 1]], {options: {type: 'star', radius: 4},
        target: {mode: 'existing', target: 'symbols'}}),
      getAddSymbolCommand([[2, 2], [3, 2], [3, 3]], {options: {type: 'curve'},
        target: {mode: 'existing', target: 'symbols'}}),
      getRestyleSymbolCommand({type: 'star', radius: 4, fill: 'red'}, [1], 'symbols'),
      getSymbolStyleCommand({stroke: 'blue'}, [2], 'symbols'),
      getUpdateSymbolCommand([[5, 5]], 0, 'symbols'),
      getSymbolDeleteCommand([2], 'symbols')
    ].join(' ');
    var out = await api.applyCommands(cmd + ' -o format=geojson', {});
    var json = JSON.parse(out['symbols.json']);
    assert.equal(json.features.length, 2);
    assert.deepEqual(json.features[0].geometry.coordinates, [5, 5]);
    assert.equal(json.features[0].properties.r, 3);
    assert.equal(json.features[1].properties['icon-fill'], 'red');
  });
});

describe('gui-symbol-style.mjs', function () {
  it('a placed icon reads back with the style it was placed with', async function () {
    var shapes = ['circle', 'square', 'triangle', 'star', 'ring', 'nyt-star'];
    var paints = [{fill: '#3366cc', stroke: '', strokeWidth: 0},
      {fill: '#3366cc', stroke: '#000000', strokeWidth: 2},
      {fill: '', stroke: '#3366cc', strokeWidth: 3}];
    for (var shape of shapes) {
      for (var paint of paints) {
        var style = Object.assign(getDefaultIconStyle(), {shape: shape, size: 16}, paint);
        var cmd = getAddSymbolCommand([[0, 0]], {options: getAddIconOptions(style)});
        var rec = (await getRecords(cmd))[0];
        var msg = shape + ' ' + JSON.stringify(paint);
        var back = getIconPaint(rec);
        assert.equal(getIconShape(rec), shape, msg);
        assert.equal(getIconSize(rec), 16, msg);
        assert.equal(back.fill, paint.fill, msg);
        assert.equal(back.stroke, paint.stroke, msg);
        // the NYT star's outline has the logo's weight
        assert.equal(back.strokeWidth, shape == 'nyt-star' && paint.stroke ? 2 : paint.strokeWidth, msg);
      }
    }
  });

  it('a circle is drawn with r, so that it can take the canvas path', function () {
    assert.deepEqual(getAddIconOptions(Object.assign(getDefaultIconStyle(), {rotation: 30})),
      {type: 'circle', radius: 5, fill: '#333333'});
  });

  it('a ring starts as a stroke with no fill, and takes no rotation', function () {
    var style = Object.assign(getDefaultIconStyle(), {rotation: 30});
    Object.assign(style, getShapeChangeStyle('ring', 'circle', style), {shape: 'ring'});
    assert.deepEqual(getAddIconOptions(style),
      {type: 'ring', radius: 5, stroke: '#333333', 'stroke-width': 1.5});
    // and given a fill as well
    style.fill = '#ffcc00';
    assert.deepEqual(getAddIconOptions(style),
      {type: 'ring', radius: 5, fill: '#ffcc00', stroke: '#333333', 'stroke-width': 1.5});
  });

  it('a color moves to where the new shape carries it', function () {
    var circle = {fill: '#ff0000', stroke: '', strokeWidth: 0};
    var ring = getShapeChangeStyle('ring', 'circle', circle);
    assert.deepEqual(ring, {fill: '', stroke: '#ff0000', strokeWidth: 1.5});
    assert.deepEqual(getShapeChangeStyle('circle', 'ring', ring), circle);
    // shapes that paint alike keep the paint as it is
    var outlined = {fill: '#ff0000', stroke: '#000000', strokeWidth: 2};
    assert.deepEqual(getShapeChangeStyle('star', 'square', outlined), outlined);
  });

  it('the NYT star brings its red and white, and takes them away again', function () {
    var circle = getDefaultIconStyle();
    var star = getShapeChangeStyle('nyt-star', 'circle', circle);
    assert.deepEqual(star, {fill: '#ffffff', stroke: '#cc0000', strokeWidth: 1.25});
    assert.deepEqual(getShapeChangeStyle('circle', 'nyt-star', star),
      {fill: '#333333', stroke: '', strokeWidth: 0});
    // a color chosen by hand stays
    assert.equal(getShapeChangeStyle('nyt-star', 'circle',
      {fill: '#0000ff', stroke: '', strokeWidth: 0}).stroke, '#0000ff');
  });

  it('the NYT star is placed upright, with an outline of its own weight', function () {
    var style = Object.assign(getDefaultIconStyle(), {shape: 'nyt-star', fill: '#ffffff',
      stroke: '#cc0000', strokeWidth: 1.25, rotation: 20});
    assert.deepEqual(getAddIconOptions(style),
      {type: 'nyt-star', radius: 5, fill: '#ffffff', stroke: '#cc0000'});
  });

  it('a stroke needs a color and a width', function () {
    var style = Object.assign(getDefaultIconStyle(), {shape: 'star', stroke: '#000'});
    assert.equal(getAddIconOptions(style).stroke, undefined);
    style.strokeWidth = 1;
    assert.equal(getAddIconOptions(style).stroke, '#000');
    assert.equal(getAddIconOptions(style)['stroke-width'], 1);
  });

  it('no fill is said where the shape would otherwise have one', function () {
    var style = Object.assign(getDefaultIconStyle(), {shape: 'star', fill: '',
      stroke: '#000', strokeWidth: 1});
    assert.equal(getAddIconOptions(style).fill, 'none');
  });

  it('getIconShape() names only the shapes the panel offers', function () {
    assert.equal(getIconShape({r: 3}), 'circle');
    assert.equal(getIconShape({icon: 'polygon', 'icon-sides': 3}), 'triangle');
    assert.equal(getIconShape({icon: 'polygon', 'icon-sides': 6}), null);
    assert.equal(getIconShape({icon: 'ring', 'icon-size': 8}), 'ring');
    assert.equal(getIconShape({icon: 'ring', 'icon-radii': '2,4'}), null);
    assert.equal(getIconShape({icon: 'nyt-star'}), 'nyt-star');
    assert.equal(getIconShape({}), null);
  });

  it('getIconStyle() reads a symbol as the panel shows it', function () {
    assert.deepEqual(getIconStyle({r: 5, fill: 'red'}),
      {shape: 'circle', size: 10, fill: 'red', stroke: '', strokeWidth: 0, rotation: 0});
    assert.deepEqual(getIconStyle({icon: 'star', 'icon-size': 8, 'icon-fill': 'red',
      'icon-stroke': '#000', 'icon-stroke-width': 2, 'icon-rotation': 15}),
      {shape: 'star', size: 8, fill: 'red', stroke: '#000', strokeWidth: 2, rotation: 15});
    assert.equal(getIconStyle({icon: 'pie', 'icon-size': 8}), null);
  });

  it('restyling says no stroke, and keeps what the panel has no control for', function () {
    var style = {shape: 'star', size: 10, fill: 'red', stroke: '', strokeWidth: 0, rotation: 0};
    assert.deepEqual(getRestyleIconOptions({icon: 'star', 'icon-points': 7, 'icon-opacity': 0.5}, style),
      {type: 'star', radius: 5, fill: 'red', stroke: 'none', points: 7, opacity: 0.5});
  });

  // A record goes through -symbols ids= with options from the style the panel
  // reads back from it, after the panel's change, and is read back again
  async function restyle(addOptions, change) {
    var cmd = getAddSymbolCommand([[0, 0]], {options: addOptions});
    var rec = (await getRecords(cmd))[0];
    var style = getIconStyle(rec);
    change(style);
    cmd += ' ' + getRestyleSymbolCommand(getRestyleIconOptions(rec, style), [0], 'symbols');
    return (await getRecords(cmd))[0];
  }

  it('changing shape keeps the drawn size and color', async function () {
    var rec = await restyle({type: 'circle', radius: 6, fill: 'red'}, function(style) {
      style.shape = 'square';
    });
    assert.equal(getIconShape(rec), 'square');
    assert.equal(getIconSize(rec), 12);
    assert.equal(getIconPaint(rec).fill, 'red');
    assert.equal(rec.r, undefined);
  });

  it('a circle that loses its stroke as another shape is drawn with none', async function () {
    var rec = await restyle({type: 'circle', radius: 5, fill: 'red', stroke: '#000',
      'stroke-width': 2}, function(style) {
      Object.assign(style, {shape: 'star', stroke: '', strokeWidth: 0});
    });
    assert.deepEqual(getIconPaint(rec), {fill: 'red', stroke: '', strokeWidth: 0});
  });

  it('a star goes back to a circle', async function () {
    var rec = await restyle({type: 'star', radius: 5, fill: 'red', rotation: 20}, function(style) {
      style.shape = 'circle';
    });
    assert.equal(getIconShape(rec), 'circle');
    assert.equal(getIconSize(rec), 10);
    assert.equal(rec.icon, undefined);
    assert.equal(rec['icon-rotation'], undefined);
  });

  it('curves: arrowheads, and a fill only when closed', async function () {
    var style = getDefaultCurveStyle();
    assert.deepEqual(getAddCurveOptions(style, false),
      {type: 'curve', stroke: '#333333', 'stroke-width': 1.5, 'line-end': 'arrow'});
    style.fill = '#eee';
    style.arrowheads = 'both';
    assert.deepEqual(getAddCurveOptions(style, true),
      {type: 'curve', stroke: '#333333', 'stroke-width': 1.5, fill: '#eee'});
    var cmd = getAddSymbolCommand([[0, 0], [1, 1], [2, 0]],
      {options: getAddCurveOptions(Object.assign(getDefaultCurveStyle(), {arrowheads: 'both'}), false)});
    var rec = (await getRecords(cmd))[0];
    assert.deepEqual(getCurveStyle(rec),
      {stroke: '#333333', strokeWidth: 1.5, arrowheads: 'both', arrowShape: 'arrow',
        arrowSize: '', fade: 0, taper: 0, fill: ''});
  });

  it('curves: a taper, as a line takes it', async function () {
    var style = Object.assign(getDefaultCurveStyle(), {arrowheads: 'none', taper: 0.5});
    var options = getAddCurveOptions(style, false);
    assert.equal(options['line-taper'], 0.5);
    assert.equal(getAddCurveOptions(style, true)['line-taper'], undefined);
    var rec = (await getRecords(getAddSymbolCommand([[0, 0], [1, 1], [2, 0]], {options: options})))[0];
    assert.equal(rec['line-taper'], 0.5);
    assert.equal(getCurveStyle(rec).taper, 0.5);
  });

  it('curves: the heads\' shape and size, and a fade, as a line takes them', async function () {
    var style = Object.assign(getDefaultCurveStyle(), {arrowShape: 'dot', arrowSize: 8, fade: 0.3});
    var options = getAddCurveOptions(style, false);
    assert.deepEqual(options, {type: 'curve', stroke: '#333333', 'stroke-width': 1.5,
      'line-end': 'dot', 'line-end-size': 8, 'line-fade': 0.3});
    var rec = (await getRecords(getAddSymbolCommand([[0, 0], [1, 1], [2, 0]], {options: options})))[0];
    var back = getCurveStyle(rec);
    assert.equal(back.arrowShape, 'dot');
    assert.equal(back.arrowSize, 8);
    assert.equal(back.fade, 0.3);
    // no heads, no size
    style.arrowheads = 'none';
    assert.equal(getAddCurveOptions(style, false)['line-end-size'], undefined);
  });

  it('arrowhead positions', function () {
    assert.equal(getArrowheadPosition({'line-start': 'none', 'line-end': 'dot'}), 'end');
    assert.equal(getArrowheadPosition({}), 'none');
    assert.deepEqual(getArrowheadFields('start'), {'line-start': 'arrow', 'line-end': ''});
    assert.deepEqual(getArrowheadFields('both', 'open-arrow'),
      {'line-start': 'open-arrow', 'line-end': 'open-arrow'});
  });
});
