import assert from 'assert';
import {
  getIconShapes, getIconShapeName, getIconShapeValues, getIconShapeGlyph, ICON_FIELDS,
  findIconShape, getShownIconPaint, getIconPaintChange
} from '../src/gui/gui-icon-shapes.mjs';
import { getIconPaint } from '../src/symbols/mapshaper-icon-symbols.mjs';

function names(list) {
  return list.map(function(o) { return o.name; });
}

describe('gui-icon-shapes.mjs', function () {
  it('labels and symbols are offered the same shapes', function () {
    assert.deepEqual(names(getIconShapes('label')), ['circle', 'square', 'triangle', 'star', 'ring']);
    assert.deepEqual(names(getIconShapes('symbol')), names(getIconShapes('label')));
  });

  it('the NYT icons are offered to both, but only when asked for', function () {
    var nyt = ['nyt-star', 'nyt-target', 'nyt-target2'];
    assert.deepEqual(names(getIconShapes('label', {nyt: true})).slice(5), nyt);
    assert.deepEqual(names(getIconShapes('symbol', {nyt: true})).slice(5), nyt);
    assert.deepEqual(names(getIconShapes('symbol')).filter(function(name) {
      return nyt.includes(name);
    }), []);
    assert.equal(getIconShapeName({icon: 'nyt-target2'}), 'nyt-target2');
  });

  it('getIconShapeName() reads the shape from the fields', function () {
    assert.equal(getIconShapeName({icon: 'circle'}), 'circle');
    assert.equal(getIconShapeName({r: 4}), 'circle');
    assert.equal(getIconShapeName({icon: 'polygon', 'icon-sides': 3}), 'triangle');
    assert.equal(getIconShapeName({icon: 'polygon', 'icon-sides': '3'}), 'triangle');
    assert.equal(getIconShapeName({icon: 'ring'}), 'ring');
  });

  it('getIconShapeName() has nothing for the icons no panel offers', function () {
    assert.equal(getIconShapeName({icon: 'polygon', 'icon-sides': 6}), null);
    assert.equal(getIconShapeName({icon: 'arrow'}), null);
    assert.equal(getIconShapeName({icon: 'pie'}), null);
    assert.equal(getIconShapeName({icon: 'curve'}), null);
    assert.equal(getIconShapeName({icon: 'ring', 'icon-radii': '2,4'}), null);
    assert.equal(getIconShapeName({}), null);
    assert.equal(getIconShapeName(null), null);
  });

  it('getIconShapeValues() writes a shape and clears the old one\'s parameters', function () {
    assert.deepEqual(getIconShapeValues('triangle'), [['icon', 'polygon'], ['icon-sides', 3]]);
    assert.deepEqual(getIconShapeValues('star'), [['icon', 'star']]);
    assert.deepEqual(getIconShapeValues('star', {icon: 'polygon', 'icon-sides': 3}),
      [['icon', 'star'], ['icon-sides', '']]);
    // cleared if any of several records has it
    assert.deepEqual(getIconShapeValues('square', [{icon: 'circle'}, {icon: 'polygon', 'icon-sides': 3}]),
      [['icon', 'square'], ['icon-sides', '']]);
    assert.deepEqual(getIconShapeValues('nope'), []);
  });

  it('removing an icon removes its parameters and paint too', function () {
    ['icon', 'icon-sides', 'icon-fill', 'icon-stroke', 'icon-stroke-width', 'icon-color'].forEach(function(f) {
      assert.ok(ICON_FIELDS.indexOf(f) > -1, f);
    });
  });

  it('getShownIconPaint() shows what the renderer draws', function () {
    var recs = [
      {}, {fill: 'blue'}, {'icon-color': 'red', fill: 'blue'},
      {stroke: 'green', 'stroke-width': 2}, {stroke: 'green'},
      {'icon-fill': 'none', 'icon-stroke': 'red'},
      {'icon-fill': 'yellow', 'icon-stroke': 'red', 'icon-stroke-width': 3},
      {'icon-color': 'red', 'stroke-width': 4}, {'icon-stroke': 'none', 'icon-color': 'red'},
      {'icon-stroke-width': 2}, {'icon-size': 16, 'icon-fill': 'none'}
    ];
    getIconShapes('label', {nyt: true}).forEach(function(shape) {
      recs.forEach(function(rec) {
        var msg = shape.name + ' ' + JSON.stringify(rec);
        var drawn = getIconPaint(rec, shape.icon);
        var shown = getShownIconPaint(rec, shape.name, 'black');
        assert.equal(shown.fill, drawn.fill == 'none' ? '' : drawn.fill, msg);
        assert.equal(shown.stroke, drawn.stroke == 'none' ? '' : drawn.stroke, msg);
        assert.equal(shown.strokeWidth, drawn.strokeWidth, msg);
      });
    });
    assert.equal(findIconShape('ring').paint, 'stroke');
  });

  describe('getIconPaintChange()', function () {
    var none = {'icon-fill': '', 'icon-stroke': '', 'icon-stroke-width': '', 'icon-color': ''};
    function vals(o) { return Object.assign({}, none, o); }

    it('changes nothing between shapes that paint alike', function () {
      assert.deepEqual(getIconPaintChange('square', 'circle', vals({'icon-fill': 'red'}), ''), {});
    });

    it('moves a fill to a ring\'s stroke, and back', function () {
      assert.deepEqual(getIconPaintChange('ring', 'circle', vals({'icon-fill': 'red'}), ''),
        {'icon-fill': '', 'icon-stroke': 'red'});
      assert.deepEqual(getIconPaintChange('circle', 'ring',
        vals({'icon-stroke': 'red', 'icon-stroke-width': 3}), ''),
        {'icon-fill': 'red', 'icon-stroke': '', 'icon-stroke-width': ''});
      // icon-color, the field these replace, moves the same way, and goes
      assert.deepEqual(getIconPaintChange('circle', 'ring', vals({'icon-color': 'red'}), ''),
        {'icon-fill': 'red', 'icon-color': ''});
    });

    it('adds nothing to a label whose symbol takes its text color', function () {
      assert.deepEqual(getIconPaintChange('ring', '', vals({}), ''), {});
    });

    it('puts the NYT red on and takes it off again, unless the color was chosen', function () {
      assert.deepEqual(getIconPaintChange('nyt-star', 'circle', vals({}), ''),
        {'icon-stroke': '#cc0000'});
      assert.deepEqual(getIconPaintChange('circle', 'nyt-star', vals({'icon-stroke': '#CC0000'}), ''),
        {'icon-stroke': ''});
      // a label from before icon-stroke, its red in icon-color
      assert.deepEqual(getIconPaintChange('circle', 'nyt-star', vals({'icon-color': '#cc0000'}), ''),
        {'icon-color': ''});
      assert.deepEqual(getIconPaintChange('nyt-star', 'circle', vals({'icon-fill': '#0000ff'}), ''),
        {'icon-fill': '', 'icon-stroke': '#0000ff'});
      // a symbol tool symbol, whose default color is explicit
      assert.deepEqual(getIconPaintChange('circle', 'nyt-star',
        vals({'icon-stroke': '#cc0000', 'icon-fill': '#ffffff'}), '#333333'),
        {'icon-fill': '#333333', 'icon-stroke': ''});
    });

    it('swaps one NYT icon\'s color for another\'s, unless the color was chosen', function () {
      assert.deepEqual(getIconPaintChange('nyt-target', 'nyt-star', vals({'icon-stroke': '#cc0000'}), ''),
        {'icon-stroke': '#e0553b'});
      assert.deepEqual(getIconPaintChange('nyt-target', 'nyt-star', vals({'icon-stroke': '#0000ff'}), ''),
        {'icon-stroke': '#0000ff'});
      // the targets share a color, and paint alike
      assert.deepEqual(getIconPaintChange('nyt-target2', 'nyt-target', vals({'icon-stroke': '#e0553b'}), ''), {});
      assert.deepEqual(getIconPaintChange('nyt-target', 'circle', vals({}), ''),
        {'icon-stroke': '#e0553b'});
    });

    it('leaves a color the icons disagree on alone', function () {
      assert.deepEqual(getIconPaintChange('ring', 'circle', vals({'icon-fill': null}), ''),
        {'icon-fill': ''});
    });
  });

  it('every offered shape has a button glyph', function () {
    getIconShapes('label', {nyt: true}).forEach(function(o) {
      assert.ok(/<svg[^>]*>.+<\/svg>/.test(getIconShapeGlyph(o.name)), o.name);
    });
  });
});
