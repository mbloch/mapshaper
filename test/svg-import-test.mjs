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

  it('imports SVG geometadata from <metadata> to set CRS and coordinate scale', function() {
    var svg = [
      '<?xml version="1.0"?>',
      '<svg xmlns="http://www.w3.org/2000/svg" version="1.2" baseProfile="tiny" viewBox="0 0 100 100">',
      '<metadata>{"crs":"epsg:4326","bbox":[10,20,30,60]}</metadata>',
      '<g id="pts">',
      '<circle cx="0" cy="0" r="1"/>',
      '<circle cx="100" cy="100" r="1"/>',
      '</g>',
      '</svg>'
    ].join('\n');
    var dataset = api.internal.importContent({
      svg: {filename: 'meta.svg', content: svg}
    }, {});
    var pts = dataset.layers.find(lyr => lyr.name == 'pts');
    var p1 = pts.shapes[0][0];
    var p2 = pts.shapes[1][0];
    var crs = api.internal.getDatasetCRS(dataset);

    assert(crs && crs.is_latlong, 'CRS is set from metadata');
    assert.deepEqual(p1, [10, 60]);
    assert.deepEqual(p2, [30, 20]);
  });

  it('imports Illustrator-split hidden metadata text with &quot; entities', function() {
    var svg = [
      '<?xml version="1.0"?>',
      '<svg xmlns="http://www.w3.org/2000/svg" version="1.2" baseProfile="tiny" viewBox="0 0 100 100">',
      '<g id="mapshaper-metadata"><text opacity="0" font-size="0.1"><tspan>{&quot;crs&quot;:&quot;epsg:4326&quot;,&quot;bbox&quot;:[10,20,30,60]}</tspan></text></g>',
      '<g id="pts">',
      '<circle cx="0" cy="0" r="1"/>',
      '</g>',
      '</svg>'
    ].join('\n');
    var dataset = api.internal.importContent({
      svg: {filename: 'ai-meta.svg', content: svg}
    }, {});
    var pts = dataset.layers.find(lyr => lyr.name == 'pts');
    var p = pts.shapes[0][0];
    var crs = api.internal.getDatasetCRS(dataset);

    assert(crs && crs.is_latlong, 'CRS is recovered from hidden metadata text');
    assert.deepEqual(p, [10, 60]);
  });

  it('imports hidden metadata text with numeric quote entities', function() {
    var svg = [
      '<?xml version="1.0"?>',
      '<svg xmlns="http://www.w3.org/2000/svg" version="1.2" baseProfile="tiny" viewBox="0 0 100 100">',
      '<g id="mapshaper-metadata"><text opacity="0" font-size="0.1"><tspan>{&#34;crs&#34;:&#34;epsg:4326&#34;,&#34;bbox&#34;:[10,20,30,60]}</tspan></text></g>',
      '<g id="pts">',
      '<circle cx="0" cy="0" r="1"/>',
      '</g>',
      '</svg>'
    ].join('\n');
    var dataset = api.internal.importContent({
      svg: {filename: 'figma-meta.svg', content: svg}
    }, {});
    var pts = dataset.layers.find(lyr => lyr.name == 'pts');
    var p = pts.shapes[0][0];
    var crs = api.internal.getDatasetCRS(dataset);

    assert(crs && crs.is_latlong, 'CRS is recovered from numeric entity metadata text');
    assert.deepEqual(p, [10, 60]);
  });

  it('uses hidden metadata rectangle coordinates after artwork is moved and scaled', function() {
    var svg = [
      '<?xml version="1.0"?>',
      '<svg xmlns="http://www.w3.org/2000/svg" version="1.2" baseProfile="tiny" viewBox="0 0 100 100">',
      '<g id="mapshaper-metadata">',
      '<rect x="50" y="100" width="200" height="200" opacity="0"/>',
      '<text opacity="0" font-size="0.1"><tspan>{&quot;crs&quot;:&quot;epsg:4326&quot;,&quot;bbox&quot;:[10,20,30,60]}</tspan></text>',
      '</g>',
      '<g id="pts">',
      '<circle cx="50" cy="100" r="1"/>',
      '<circle cx="250" cy="300" r="1"/>',
      '</g>',
      '</svg>'
    ].join('\n');
    var dataset = api.internal.importContent({
      svg: {filename: 'ai-shifted.svg', content: svg}
    }, {});
    var pts = dataset.layers.find(lyr => lyr.name == 'pts');
    var p1 = pts.shapes[0][0];
    var p2 = pts.shapes[1][0];
    var metaLayer = dataset.layers.find(lyr => lyr.name == 'mapshaper-metadata');

    assert.equal(metaLayer, undefined, 'internal metadata layer is not imported');
    assert.deepEqual(p1, [10, 60]);
    assert.deepEqual(p2, [30, 20]);
  });

  describe('pattern fills', function() {
    function importSvg(body) {
      var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' + body + '</svg>';
      var dataset = api.internal.importContent({
        svg: {filename: 'patterns.svg', content: svg}
      }, {});
      return dataset.layers[0].data.getRecords();
    }

    it('recover fill-pattern and fill after an export and an import', async function() {
      var geojson = {type: 'FeatureCollection', features: [
        {type: 'Feature', properties: {name: 'a'}, geometry: {type: 'Polygon', coordinates: [[[0, 0], [0, 1], [1, 1], [0, 0]]]}},
        {type: 'Feature', properties: {name: 'b'}, geometry: {type: 'Polygon', coordinates: [[[2, 0], [2, 1], [3, 1], [2, 0]]]}},
        {type: 'Feature', properties: {name: 'c'}, geometry: {type: 'Polygon', coordinates: [[[4, 0], [4, 1], [5, 1], [4, 0]]]}}
      ]};
      var cmd = '-i in.json -style fill="#aaaaaa" fill-pattern="hatches 3px #aaaaaa 1px #000000" where="name==\'a\'"' +
        ' -style fill-pattern="dots 2px rgb(0,0,255) 3px white" where="name==\'b\'" -o out.svg';
      var out = await api.applyCommands(cmd, {'in.json': geojson});
      var out2 = await api.applyCommands('-i out.svg -o out.json', {'out.svg': out['out.svg']});
      var props = JSON.parse(out2['out.json']).features.map(f => f.properties);
      assert.match(String(out['out.svg']), /fill="url\(#hash_hatches_3px_aaaaaa_1px_000000\) #aaaaaa"/);
      assert.deepEqual(props, [
        {fill: '#aaaaaa', 'fill-pattern': 'hatches 3px #aaaaaa 1px #000000'},
        {'fill-pattern': 'dots 2px rgb(0,0,255) 3px white'},
        {}
      ]);
    });

    it('decode the ids of patterns exported with no fallback colour', function() {
      var recs = importSvg('<path d="M0 0L1 1L1 0Z" fill="url(#hash_squares_2px_000_1px_fff)"/>');
      assert.deepEqual(recs[0], {'fill-pattern': 'squares 2px #000 1px #fff'});
    });

    it('apply to the features of a group with a pattern fill', function() {
      var recs = importSvg('<g fill="url(#hash_hatches_2px_red_2px_grey) #ccc"><path d="M0 0L1 1L1 0Z"/></g>');
      assert.equal(recs[0]['fill-pattern'], 'hatches 2px red 2px grey');
      assert.equal(recs[0].fill, '#ccc');
    });

    it('drop a reference to some other paint server but keep its fallback', function() {
      var recs = importSvg('<path d="M0 0L1 1L1 0Z" fill="url(#gradient1) blue"/>' +
        '<path d="M2 0L3 1L3 0Z" style="fill: url(\'#gradient2\')"/>');
      assert.equal(recs[0].fill, 'blue');
      assert.equal(recs[1].fill, undefined);
      assert.equal('fill-pattern' in recs[0], false);
    });
  });
});
