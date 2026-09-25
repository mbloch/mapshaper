import api from '../mapshaper.js';
import assert from 'assert';
import { renderPoint } from '../src/svg/svg-symbols';
import { applyLabelHalo, splitLabelHalos, labelHasHalo } from '../src/svg/svg-label-halo';

async function svg(cmd) {
  var out = await api.applyCommands(cmd + ' -o out.svg width=400');
  return String(out['out.svg']);
}

function textElements(str) {
  return str.match(/<text[^]*?<\/text>/g) || [];
}

describe('svg-label-halo.mjs', function () {

  describe('labelHasHalo()', function () {
    it('is true only for a positive halo-width', function () {
      assert.ok(labelHasHalo({'halo-width': 1}));
      assert.ok(labelHasHalo({'halo-width': 0.5}));
      assert.ok(!labelHasHalo({'halo-width': 0}));
      assert.ok(!labelHasHalo({'halo-color': 'white'}));
      assert.ok(!labelHasHalo(null));
    });
  });

  describe('rendering (GUI and export)', function () {
    it('strokes the text at twice the halo width, beneath the fill', function () {
      var o = renderPoint({'label-text': 'Paris', fill: 'blue', 'halo-width': 1.5});
      assert.equal(o.tag, 'text');
      assert.equal(o.properties.stroke, '#ffffff');
      assert.equal(o.properties['stroke-width'], 3);
      assert.equal(o.properties['stroke-linejoin'], 'round');
      assert.equal(o.properties['paint-order'], 'stroke fill');
      assert.equal(o.properties.fill, 'blue');
      assert.equal('stroke-opacity' in o.properties, false);
    });

    it('applies halo-color and a halo-opacity below 1', function () {
      var o = renderPoint({'label-text': 'Paris', 'halo-width': 1,
        'halo-color': '#eee', 'halo-opacity': 0.6});
      assert.equal(o.properties.stroke, '#eee');
      assert.equal(o.properties['stroke-opacity'], 0.6);
    });

    it('leaves a label with no halo as it was', function () {
      var o = renderPoint({'label-text': 'Paris', stroke: 'red', 'stroke-width': 1,
        'halo-color': 'white'});
      assert.deepEqual(o.properties, {x: 0, y: 0, stroke: 'red', 'stroke-width': 1});
    });

    it('replaces the label\'s own stroke, which the halo now is', function () {
      var o = renderPoint({'label-text': 'Paris', stroke: 'red',
        'stroke-dasharray': '2 2', 'halo-width': 1});
      assert.equal(o.properties.stroke, '#ffffff');
      assert.equal('stroke-dasharray' in o.properties, false);
      assert.equal('stroke-linecap' in o.properties, false);
    });

    it('does not ring the icon', function () {
      var o = renderPoint({'label-text': 'Paris', icon: 'circle', 'icon-size': 8,
        'halo-width': 1});
      assert.equal(o.children[0].tag, 'circle');
      assert.equal('stroke' in o.children[0].properties, false);
      assert.equal(o.children[1].properties['paint-order'], 'stroke fill');
    });

    it('halos a multi-line label once, on the <text>', function () {
      var o = renderPoint({'label-text': 'a\nb', 'halo-width': 1});
      assert.equal(o.properties['stroke-width'], 2);
      assert.equal('stroke' in o.children[0].properties, false);
    });
  });

  describe('splitLabelHalos() (export)', function () {
    it('draws the halo as an unfilled copy underneath the text', function () {
      var text = applyLabelHalo({tag: 'text', value: 'Paris',
        properties: {x: 0, y: 0, fill: 'blue', 'fill-opacity': 0.5,
          transform: 'translate(1 2)', opacity: 0.8}},
        {'halo-width': 1});
      var g = splitLabelHalos(text);
      assert.equal(g.tag, 'g');
      assert.deepEqual(g.properties, {transform: 'translate(1 2)', opacity: 0.8});
      assert.deepEqual(g.children[0], {tag: 'text', value: 'Paris', properties: {
        x: 0, y: 0, fill: 'none', stroke: '#ffffff', 'stroke-width': 2,
        'stroke-linejoin': 'round'}});
      assert.deepEqual(g.children[1], {tag: 'text', value: 'Paris', properties: {
        x: 0, y: 0, fill: 'blue', 'fill-opacity': 0.5}});
    });

    it('fades the halo copy with opacity, and the whole label on the group', function () {
      var g = splitLabelHalos(renderPoint({'label-text': 'Paris', opacity: 0.8,
        'halo-width': 1, 'halo-color': 'yellow', 'halo-opacity': 0.4}));
      var halo = g.children[0].properties;
      assert.equal(g.properties.opacity, 0.8);
      assert.equal(halo.opacity, 0.4);
      assert.equal(halo.stroke, 'yellow');
      assert.equal(halo.fill, 'none');
      assert.equal('stroke-opacity' in halo, false);
      assert.equal('opacity' in g.children[1].properties, false);
    });

    it('copies a multi-line label\'s lines into the halo', function () {
      var g = splitLabelHalos(renderPoint({'label-text': 'a\nb', 'halo-width': 1}));
      assert.equal(g.children[0].children[0].value, 'b');
      assert.notStrictEqual(g.children[0].children[0], g.children[1].children[0]);
    });

    it('leaves a label without a halo alone', function () {
      var o = renderPoint({'label-text': 'Paris'});
      assert.strictEqual(splitLabelHalos(o), o);
    });
  });

  describe('-style and -o svg', function () {
    it('exports a halo as two text elements and no paint-order', async function () {
      var str = await svg('-add-label coordinates=0,0 text=Kentucky ' +
        '-style fill=blue halo-width=1.5 halo-color=#ffe halo-opacity=0.5');
      var texts = textElements(str);
      assert.equal(texts.length, 2);
      assert.ok(/fill="none"/.test(texts[0]));
      assert.ok(/stroke="#ffe"/.test(texts[0]));
      assert.ok(/stroke-width="3"/.test(texts[0]));
      assert.ok(/ opacity="0.5"/.test(texts[0]));
      assert.ok(!/stroke-opacity/.test(str));
      assert.ok(!/stroke/.test(texts[1]));
      assert.ok(/fill="blue"/.test(texts[1]));
      assert.ok(!/paint-order/.test(str));
      assert.ok(!/halo-/.test(str));
    });

    it('unsets a halo with an empty halo-width', async function () {
      var str = await svg('-add-label coordinates=0,0 text=Kentucky ' +
        '-style halo-width=1 -style halo-width=');
      assert.equal(textElements(str).length, 1);
    });

    it('draws both copies of a path label along one shared path', async function () {
      var str = await svg('-add-label coordinates=0,0,50,40,100,0 text=Ridge halo-width=1');
      var refs = str.match(/<textPath[^>]*href="#([^"]+)"/g) || [];
      var defs = str.match(/<path id="label-path-[^"]*"/g) || [];
      assert.equal(textElements(str).length, 2);
      assert.equal(refs.length, 2);
      assert.equal(refs[0], refs[1]);
      assert.equal(defs.length, 1);
    });

    it('-add-label accepts the halo properties', async function () {
      var out = await api.applyCommands(
        '-add-label coordinates=0,0 text=A halo-width=2 halo-color=black halo-opacity=0.4 ' +
        '-o out.json');
      var props = JSON.parse(String(out['out.json'])).features[0].properties;
      assert.strictEqual(props['halo-width'], 2);
      assert.strictEqual(props['halo-color'], 'black');
      assert.strictEqual(props['halo-opacity'], 0.4);
    });
  });
});
