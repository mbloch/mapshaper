import api from '../mapshaper.js';
import assert from 'assert';
import { getIconSymbol } from '../src/symbols/mapshaper-icon-symbols';

function multiPointGeoJSON() {
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: {n: 'a'},
      geometry: {type: 'MultiPoint', coordinates: [[0, 0], [500, 500]]}
    }]
  };
}

function pointGeoJSON(properties) {
  return {
    type: 'FeatureCollection',
    features: properties.map(function(d, i) {
      return {
        type: 'Feature',
        properties: d,
        geometry: {type: 'Point', coordinates: [i * 100, 0]}
      };
    })
  };
}

async function getSymbolRecords(cmd, properties) {
  var out = await api.applyCommands('-i in.json ' + cmd + ' -o out.json',
    {'in.json': pointGeoJSON(properties || [{}])});
  return JSON.parse(out['out.json']).features.map(function(f) {
    return f.properties;
  });
}

async function getSVG(cmd, properties) {
  var out = await api.applyCommands('-i in.json ' + cmd + ' -o out.svg width=600',
    {'in.json': pointGeoJSON(properties || [{}])});
  return String(out['out.svg']);
}

describe('getIconSymbol()', function () {
  it('returns null for icons that renderIcon() draws itself', function () {
    assert.strictEqual(getIconSymbol({icon: 'circle', 'icon-size': 10}), null);
    assert.strictEqual(getIconSymbol({icon: 'square', 'icon-size': 10}), null);
    assert.strictEqual(getIconSymbol({icon: 'star', 'icon-size': 10}), null);
    assert.strictEqual(getIconSymbol({icon: 'ring', 'icon-size': 10}), null);
  });

  it('rotates clockwise on screen', function () {
    var sym = getIconSymbol({icon: 'square', 'icon-size': 10, 'icon-rotation': 45});
    // a corner of the square moves to the top, at y = -5 * sqrt(2)
    var ys = sym.coordinates[0].map(function(p) {return p[1];});
    assert.equal(Math.min.apply(null, ys), -7.07);
  });

  it('an arrow points up, from its point', function () {
    var sym = getIconSymbol({icon: 'arrow', 'icon-size': 20});
    var ys = sym.coordinates[0].map(function(p) {return p[1];});
    assert.equal(Math.min.apply(null, ys), -20);
    assert.equal(Math.max.apply(null, ys), 0);
  });

  it('an arrow pointing right', function () {
    var sym = getIconSymbol({icon: 'arrow', 'icon-size': 20, 'icon-rotation': 90});
    var xs = sym.coordinates[0].map(function(p) {return p[0];});
    assert.equal(Math.max.apply(null, xs), 20);
  });

  it('an impossible arrow draws nothing, rather than failing', function () {
    var sym = getIconSymbol({icon: 'arrow', 'icon-size': 20, 'arrow-stem-width': 10, 'arrow-head-width': 4});
    assert.deepEqual(sym, {type: 'group', parts: []});
  });

  it('takes the record\'s stroke, and icon-color over fill', function () {
    var sym = getIconSymbol({icon: 'polygon', 'icon-sides': 3, 'icon-size': 20,
      fill: 'blue', 'icon-color': 'red', stroke: 'black', 'stroke-width': 1});
    assert.equal(sym.fill, 'red');
    assert.equal(sym.stroke, 'black');
    assert.equal(sym['stroke-width'], 1);
  });
});

describe('mapshaper-symbols.js', function () {

  describe('symbol fields', function () {
    it('a circle is written as r=, like -style r=', async function () {
      var recs = await getSymbolRecords('-symbols type=circle radius=8 stroke=black stroke-width=2');
      assert.deepEqual(recs[0], {r: 8, fill: 'magenta', stroke: 'black', 'stroke-width': 2});
    });

    it('a circle on a label is an icon, so fill= keeps coloring the text', async function () {
      var recs = await getSymbolRecords('-symbols type=circle radius=8 fill=red',
        [{'label-text': 'A'}]);
      assert.deepEqual(recs[0], {'label-text': 'A', icon: 'circle', 'icon-size': 16, 'icon-fill': 'red'});
    });

    it('square', async function () {
      var recs = await getSymbolRecords('-symbols type=square radius=10 fill=blue');
      assert.deepEqual(recs[0], {icon: 'square', 'icon-size': 14.14, 'icon-fill': 'blue'});
      recs = await getSymbolRecords('-symbols type=square radius=10 rotated');
      assert.equal(recs[0]['icon-rotation'], 45);
    });

    it('named polygon types', async function () {
      var recs = await getSymbolRecords('-symbols type=triangle radius=10 opacity=0.5');
      assert.deepEqual(recs[0], {icon: 'polygon', 'icon-sides': 3, 'icon-size': 20,
        'icon-fill': 'magenta', 'icon-opacity': 0.5});
      recs = await getSymbolRecords('-symbols type=polygon sides=6 radius=10 rotated rotation=10');
      assert.equal(recs[0]['icon-sides'], 6);
      assert.equal(recs[0]['icon-rotation'], 40);
    });

    it('star', async function () {
      var recs = await getSymbolRecords('-symbols type=star radius=10');
      assert.deepEqual(recs[0], {icon: 'star', 'icon-size': 20, 'icon-fill': 'magenta'});
      recs = await getSymbolRecords('-symbols type=star points=6 radius=10 rotated');
      assert.equal(recs[0]['icon-points'], 6);
      assert.equal(recs[0]['icon-rotation'], 30);
    });

    it('ring', async function () {
      var recs = await getSymbolRecords('-symbols type=ring radii=8,2,4,4 fill=red scale=2');
      assert.deepEqual(recs[0], {icon: 'ring', 'icon-radii': '4,8,16', 'icon-color': 'red'});
    });

    it('nyt-star, which is not advertised', async function () {
      var recs = await getSymbolRecords('-symbols type=nyt-star radius=7');
      assert.deepEqual(recs[0], {icon: 'nyt-star', 'icon-size': 14, 'icon-stroke': '#cc0000'});
      recs = await getSymbolRecords('-symbols type=nyt-star radius=7 stroke=blue fill=yellow');
      assert.deepEqual(recs[0], {icon: 'nyt-star', 'icon-size': 14, 'icon-stroke': 'blue',
        'icon-fill': 'yellow'});
    });

    it('ring without radii= is one ring, the kind a label icon draws', async function () {
      var recs = await getSymbolRecords('-symbols type=ring radius=5 fill=red stroke-width=2');
      assert.deepEqual(recs[0], {icon: 'ring', 'icon-size': 10, 'icon-stroke': 'red',
        'icon-stroke-width': 2});
    });

    it('a ring given stroke= can also take a fill', async function () {
      var recs = await getSymbolRecords('-symbols type=ring radius=5 stroke=red fill=yellow');
      assert.deepEqual(recs[0], {icon: 'ring', 'icon-size': 10, 'icon-stroke': 'red',
        'icon-fill': 'yellow'});
    });

    it('a filled symbol\'s outline is icon-stroke=, apart from a label\'s text', async function () {
      var recs = await getSymbolRecords('-symbols type=star radius=5 fill=red stroke=black stroke-width=1.5');
      assert.deepEqual(recs[0], {icon: 'star', 'icon-size': 10, 'icon-fill': 'red',
        'icon-stroke': 'black', 'icon-stroke-width': 1.5});
    });

    it('arrow', async function () {
      var recs = await getSymbolRecords(
        '-symbols type=arrow length=30 direction=45 rotation=10 head-angle=60 anchor=end fill=red');
      assert.deepEqual(recs[0], {icon: 'arrow', 'icon-size': 30, 'icon-rotation': 55,
        'icon-fill': 'red', 'arrow-head-angle': 60, 'arrow-anchor': 'end'});
    });

    it('scale= multiplies an arrow\'s lengths, including the default stem width', async function () {
      var recs = await getSymbolRecords('-symbols type=arrow length=30 head-width=8 stem-taper=0.5 scale=2');
      assert.equal(recs[0]['icon-size'], 60);
      assert.equal(recs[0]['arrow-head-width'], 16);
      assert.equal(recs[0]['arrow-stem-width'], 4);
      assert.equal(recs[0]['arrow-stem-taper'], 0.5);
    });

    it('stick arrow', async function () {
      var recs = await getSymbolRecords('-symbols type=arrow arrow-style=stick length=30 stroke=blue');
      assert.deepEqual(recs[0], {icon: 'arrow', 'icon-size': 30, 'arrow-style': 'stick',
        'icon-color': 'blue', 'stroke-width': 2});
    });

    it('data-driven values are resolved for each feature', async function () {
      var recs = await getSymbolRecords('-symbols type=arrow length=len direction=dir',
        [{len: 10, dir: 90}, {len: 20, dir: -90}]);
      assert.equal(recs[0]['icon-size'], 10);
      assert.equal(recs[0]['icon-rotation'], 90);
      assert.equal(recs[1]['icon-size'], 20);
      assert.equal(recs[1]['icon-rotation'], -90);
    });

    it('rejects an impossible arrow', async function () {
      await assert.rejects(function() {
        return getSymbolRecords('-symbols type=arrow length=30 stem-width=10 head-width=4');
      }, /at least as wide as the stem/);
    });

    it('rejects an unknown symbol type', async function () {
      await assert.rejects(function() {
        return getSymbolRecords('-symbols type=blob');
      }, /Unsupported symbol type/);
    });

    it('records with different symbol types share one set of fields', async function () {
      // the table's fields are read from its first record
      var out = await api.applyCommands('-i in.json -symbols type=kind radius=10 -o out.csv',
        {'in.json': pointGeoJSON([{kind: 'circle'}, {kind: 'star'}])});
      assert.equal(String(out['out.csv']),
        'kind,r,fill,icon,icon-size,icon-fill\ncircle,10,magenta,,,\nstar,,,star,20,magenta');
    });

    it('a style field that a symbol doesn\'t use keeps the record\'s value', async function () {
      var recs = await getSymbolRecords('-symbols type=kind radius=10',
        [{kind: 'circle'}, {kind: 'star', fill: 'green'}]);
      assert.equal(recs[1].fill, 'green');
    });

    it('a new symbol replaces the fields of the old one', async function () {
      var recs = await getSymbolRecords(
        '-symbols type=pie values=1,1 fills=red,blue -symbols type=star radius=5');
      assert.deepEqual(recs[0], {icon: 'star', 'icon-size': 10, 'icon-fill': 'magenta'});
    });

    it('replaces a legacy svg-symbol', async function () {
      var recs = await getSymbolRecords('-symbols type=circle radius=4',
        [{'svg-symbol': {type: 'circle', r: 10}}]);
      assert.deepEqual(recs[0], {r: 4, fill: 'magenta'});
    });
  });

  describe('SVG output', function () {
    it('polygons, arrows and stars are drawn as paths', async function () {
      var svg = await getSVG('-symbols type=kind radius=10',
        [{kind: 'hexagon'}, {kind: 'arrow'}, {kind: 'star'}]);
      assert.equal((svg.match(/<path/g) || []).length, 3);
    });

    it('a ring is drawn as concentric circles', async function () {
      var svg = await getSVG('-symbols type=ring radii=2,4,6');
      assert.equal((svg.match(/<circle/g) || []).length, 2);
    });

    it('the fields can be edited with -style', async function () {
      var svg = await getSVG('-symbols type=triangle radius=10 -style icon-sides=6 icon-fill=red');
      assert.ok(svg.includes('fill="red"'));
      var d = svg.match(/ d="([^"]+)"/)[1];
      assert.equal(d.match(/-?[\d.]+/g).length, 14); // closed hexagon
    });

    it('legacy svg-symbol values are still drawn', async function () {
      var svg = await getSVG('',
        [{'svg-symbol': {type: 'circle', r: 5, fill: 'red'}}]);
      assert.ok(/<circle[^>]+fill="red"/.test(svg));
    });
  });

  describe('coordinates= option', function () {
    async function run(cmd, files) {
      var out = await api.applyCommands(cmd, files || {});
      return out;
    }

    it('adds a symbol to a new layer named "symbols"', async function () {
      var out = await run('-symbols coordinates=10,20 type=star radius=5 fill=red -o out.json');
      var json = JSON.parse(out['out.json']);
      assert.deepEqual(json.features, [{type: 'Feature',
        geometry: {type: 'Point', coordinates: [10, 20]},
        properties: {icon: 'star', 'icon-size': 10, 'icon-fill': 'red'}}]);
      out = await run('-symbols coordinates=10,20 type=star -info save-to=info.json');
      assert.equal(JSON.parse(out['info.json'])[0].layer_name, 'symbols');
    });

    it('adds symbols to the target layer', async function () {
      var out = await run('-i in.json -symbols coordinates=0,0,10,0 type=curve ' +
        'line-end=arrow stroke-width=2 -o out.json', {'in.json': pointGeoJSON([{name: 'a'}])});
      var features = JSON.parse(out['out.json']).features;
      assert.equal(features.length, 2);
      assert.deepEqual(features[1].geometry, {type: 'MultiPoint', coordinates: [[0, 0], [10, 0]]});
      assert.deepEqual(features[1].properties, {icon: 'curve', stroke: 'magenta',
        'stroke-width': 2, 'line-end': 'arrow'});
    });

    it('a closed curve keeps its repeated first point', async function () {
      var out = await run('-symbols coordinates=0,0,10,0,5,8,0,0 type=curve fill=pink -o out.json');
      var feat = JSON.parse(out['out.json']).features[0];
      assert.equal(feat.geometry.coordinates.length, 4);
      assert.deepEqual(feat.properties, {icon: 'curve', fill: 'pink'});
    });

    it('takes properties=', async function () {
      var out = await run('-symbols coordinates=0,0 type=circle radius=3 properties=\'{"name":"x"}\' -o out.json');
      assert.deepEqual(JSON.parse(out['out.json']).features[0].properties,
        {name: 'x', r: 3, fill: 'magenta'});
    });

    it('other types draw a symbol at each point', async function () {
      var out = await run('-symbols coordinates=0,0,100,100 type=square radius=5 -o out.svg');
      assert.equal((String(out['out.svg']).match(/<rect/g) || []).length, 2);
    });

    it('a curve needs two points', async function () {
      await assert.rejects(function() {
        return run('-symbols coordinates=0,0 type=curve -o out.json');
      }, /at least two points/);
    });

    it('refuses a target that is not a point layer', async function () {
      await assert.rejects(function() {
        return run('-rectangle bbox=0,0,10,10 -symbols coordinates=0,0 type=star -o out.json');
      }, /can only be added to a point layer/);
    });

    it('no-replace makes a new layer', async function () {
      var out = await run('-rectangle bbox=0,0,10,10 name=box -symbols coordinates=5,5 ' +
        'type=star no-replace -info save-to=info.json target=*');
      assert.deepEqual(JSON.parse(out['info.json']).map(function(o) {return o.layer_name;}),
        ['box', 'symbols']);
    });
  });

  describe('curves', function () {
    function multiPoint(coords, properties) {
      return {type: 'Feature', properties: properties,
        geometry: {type: 'MultiPoint', coordinates: coords}};
    }

    it('type=curve makes curves of a layer\'s multipoint features', async function () {
      var out = await api.applyCommands('-i in.json -symbols type=curve stroke=blue -o out.svg',
        {'in.json': multiPoint([[0, 0], [50, 40], [100, 0]], {})});
      var svg = String(out['out.svg']);
      assert.ok(/<path d="M [^"]+ C [^"]+" stroke="blue" fill="none"/.test(svg), svg);
    });

    it('a closed curve is filled and closed', async function () {
      var out = await api.applyCommands('-i in.json -o out.svg',
        {'in.json': multiPoint([[0, 0], [100, 0], [50, 80], [0, 0]], {icon: 'curve', fill: 'pink'})});
      var svg = String(out['out.svg']);
      assert.ok(/<path d="M [^"]+ Z" fill="pink" stroke="none"/.test(svg) ||
        /<path d="M [^"]+ Z" stroke="none" fill="pink"/.test(svg), svg);
      assert.equal((svg.match(/ C /g) || []).length, 3);
    });

    it('an open curve takes line-end markers', async function () {
      var out = await api.applyCommands('-i in.json -o out.svg',
        {'in.json': multiPoint([[0, 0], [50, 40], [100, 0]],
          {icon: 'curve', stroke: 'red', 'line-end': 'arrow', 'line-start': 'dot'})});
      var svg = String(out['out.svg']);
      assert.ok(svg.includes('fill="red" stroke="none"')); // the arrowhead
      assert.equal((svg.match(/<circle/g) || []).length, 1);
    });

    it('a curve at a single point draws nothing', async function () {
      var out = await api.applyCommands('-i in.json -o out.svg',
        {'in.json': pointGeoJSON([{icon: 'curve'}])});
      var svg = String(out['out.svg']);
      assert.ok(!/<(path|circle|rect)/.test(svg), svg);
    });

    it('a curve with label text is a path label', async function () {
      var out = await api.applyCommands('-i in.json -o out.svg',
        {'in.json': multiPoint([[0, 0], [500, 0]], {icon: 'curve', 'label-text': 'Hi'})});
      assert.ok(String(out['out.svg']).includes('<textPath'));
    });

    it('a curve in a layer of labels is not a label', async function () {
      var out = await api.applyCommands(
        '-labels coordinates=0,0 text=A -symbols coordinates=0,0,100,0,50,50 type=curve -o out.svg',
        {});
      var svg = String(out['out.svg']);
      assert.ok(!svg.includes('<textPath'), svg);
      assert.ok(/<path d="M [^"]+ C /.test(svg), svg);
    });

    it('-clean keeps the repeated knot of a closed curve', async function () {
      var out = await api.applyCommands('-i in.json -clean -o out.json',
        {'in.json': {type: 'FeatureCollection', features: [
          multiPoint([[0, 0], [100, 0], [50, 80], [0, 0]], {icon: 'curve'}),
          multiPoint([[0, 0], [1, 1], [0, 0]], {})
        ]}});
      var features = JSON.parse(out['out.json']).features;
      assert.equal(features[0].geometry.coordinates.length, 4);
      assert.equal(features[1].geometry.coordinates.length, 2);
    });

    it('-repel can not size a curve', async function () {
      await assert.rejects(function() {
        return api.applyCommands('-i in.json -proj +proj=merc -repel width=1000 -o out.json',
          {'in.json': pointGeoJSON([{icon: 'curve'}, {icon: 'curve'}])});
      }, /unable to size a curve symbol/);
    });
  });

  describe('geographic option', function () {
    it('replaces points with polygons', async function () {
      var out = await api.applyCommands(
        '-i in.json -proj +proj=merc -symbols type=star radius=10 fill=red geographic -o out.json',
        {'in.json': pointGeoJSON([{}, {}])});
      var features = JSON.parse(out['out.json']).features;
      assert.equal(features[0].geometry.type, 'Polygon');
      assert.deepEqual(features[0].properties, {fill: 'red'});
    });
  });

  describe('multi-point features', function () {

    // SVG mode leaves geometry alone and writes a symbol to the feature's
    // record, so each point of a multi-point feature is drawn.
    it('are symbolized at every point in SVG mode', async function () {
      var out = await api.applyCommands(
        '-i in.json -symbols type=circle radius=10 -o out.svg width=600',
        {'in.json': multiPointGeoJSON()});
      var svg = String(out['out.svg']);
      assert.equal((svg.match(/<circle/g) || []).length, 2);
    });

    // Geographic mode replaces the geometry with a shape placed at the
    // feature's first point, which would silently drop the others.
    it('are rejected in geographic mode', async function () {
      await assert.rejects(function() {
        return api.applyCommands(
          '-i in.json -symbols type=circle radius=10 geographic -o out.json',
          {'in.json': multiPointGeoJSON()});
      }, /requires single points/);
    });
  });
});
