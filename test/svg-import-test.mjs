import api from '../mapshaper.js';
import assert from 'assert';
import { fixPath } from './helpers';

async function importFixture(name) {
  var path = fixPath('data/svg/' + name);
  return api.internal.importFileAsync(path);
}

describe('svg import', function () {
  it('imports fixture layers and geometry types', async function () {
    var dataset = await importFixture('two_states.svg');
    var states = dataset.layers.find(lyr => lyr.name == 'states');
    var lines = dataset.layers.find(lyr => lyr.name == 'lines');
    var bubbles = dataset.layers.find(lyr => lyr.name == 'bubbles');

    assert.equal(dataset.info.input_formats[0], 'svg');
    assert(states, 'states layer exists');
    assert(lines, 'lines layer exists');
    assert(bubbles, 'bubbles layer exists');

    assert.equal(states.geometry_type, 'polygon');
    assert.equal(lines.geometry_type, 'polyline');
    assert.equal(bubbles.geometry_type, 'point');

    assert(states.shapes.length > 0);
    assert(lines.shapes.length > 0);
    assert(bubbles.shapes.length > 0);
  });

  it('preserves representative style attributes', async function () {
    var dataset = await importFixture('two_states.svg');
    var states = dataset.layers.find(lyr => lyr.name == 'states');
    var lines = dataset.layers.find(lyr => lyr.name == 'lines');
    var bubbles = dataset.layers.find(lyr => lyr.name == 'bubbles');
    var stateRec = states.data.getRecords()[0];
    var lineRec = lines.data.getRecords()[0];
    var bubbleRec = bubbles.data.getRecords()[0];

    assert.equal(stateRec.fill, '#eee');
    assert.equal('fill-rule' in stateRec, false);
    assert.equal(lineRec.fill, 'none');
    assert.equal(lineRec['stroke-width'], '1');
    assert.equal(bubbleRec.fill, 'magenta');
    assert.equal(bubbleRec['fill-opacity'], '0.5');
    assert.equal(bubbleRec.stroke, 'magenta');
    assert.equal(bubbleRec['stroke-width'], '1.2');
  });

  it('imports text labels as point layer records', function () {
    var svg = [
      '<?xml version="1.0"?>',
      '<svg xmlns="http://www.w3.org/2000/svg" version="1.2" baseProfile="tiny">',
      '<g id="labels" fill="black" font-size="12">',
      '<text transform="translate(10 20)" x="3" y="-4" text-anchor="end">Hello</text>',
      '</g>',
      '</svg>'
    ].join('\n');
    var dataset = api.internal.importContent({
      svg: {
        filename: 'labels.svg',
        content: svg
      }
    }, {});
    var labels = dataset.layers.find(lyr => lyr.name == 'labels');
    var rec = labels.data.getRecords()[0];
    var point = labels.shapes[0][0];

    assert.equal(labels.geometry_type, 'point');
    assert.equal(labels.shapes.length, 1);
    assert.equal(rec['label-text'], 'Hello');
    assert.equal(rec.fill, 'black');
    assert.equal(rec['font-size'], '12');
    assert.equal(rec['text-anchor'], 'end');
    assert.equal(rec.dx, 3);
    assert.equal(rec.dy, -4);
    assert.equal(point[0], 10);
    assert.equal(point[1], 20);
  });

  it('imports all layer paths as polylines when one path is open', function () {
    var svg = [
      '<?xml version="1.0"?>',
      '<svg xmlns="http://www.w3.org/2000/svg" version="1.2" baseProfile="tiny">',
      '<g id="mixed">',
      '<path d="M 0 0 10 0 10 10 0 10 Z M 20 0 30 0"/>',
      '</g>',
      '</svg>'
    ].join('\n');
    var dataset = api.internal.importContent({
      svg: {
        filename: 'mixed.svg',
        content: svg
      }
    }, {});
    var line = dataset.layers.find(lyr => lyr.name == 'mixed');
    var poly = dataset.layers.find(lyr => lyr.name == 'mixed_polygons');

    assert(line, 'line layer exists');
    assert(!poly, 'polygon layer is not created');
    assert.equal(line.geometry_type, 'polyline');
  });

  it('flips y coordinates within input y-range', function () {
    var svg = [
      '<?xml version="1.0"?>',
      '<svg xmlns="http://www.w3.org/2000/svg" version="1.2" baseProfile="tiny">',
      '<g id="pts">',
      '<circle cx="0" cy="10" r="1"/>',
      '<circle cx="0" cy="30" r="1"/>',
      '</g>',
      '</svg>'
    ].join('\n');
    var dataset = api.internal.importContent({
      svg: {
        filename: 'flip.svg',
        content: svg
      }
    }, {});
    var pts = dataset.layers.find(lyr => lyr.name == 'pts');
    var p1 = pts.shapes[0][0];
    var p2 = pts.shapes[1][0];

    assert.equal(p1[1], 30);
    assert.equal(p2[1], 10);
  });

  it('supports a basic style round trip', function () {
    var svg = [
      '<?xml version="1.0"?>',
      '<svg xmlns="http://www.w3.org/2000/svg" version="1.2" baseProfile="tiny">',
      '<g id="dots">',
      '<circle cx="10" cy="20" r="5" fill="magenta" fill-opacity="0.5" stroke="black" stroke-width="2"/>',
      '</g>',
      '</svg>'
    ].join('\n');
    var dataset = api.internal.importContent({
      svg: {
        filename: 'roundtrip.svg',
        content: svg
      }
    }, {});
    var exported = api.internal.exportSVG(dataset, {
      file: 'roundtrip.svg'
    })[0].content;

    assert(exported.includes('<g id="dots">'));
    assert(exported.includes('fill="magenta"'));
    assert(exported.includes('fill-opacity="0.5"'));
    assert(exported.includes('stroke="black"'));
    assert(exported.includes('stroke-width="2"'));
  });
});
