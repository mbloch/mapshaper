
import api from '../mapshaper.js';
import assert from 'assert';

var geojson = function(out, file) {
  return JSON.parse(out[file || 'out.json']);
};

// runs commands with no input file; -add-label accepts an empty target
function run(cmd) {
  return api.applyCommands(cmd + ' -o out.json');
}

function runWith(input, cmd) {
  return api.applyCommands('-i in.json ' + cmd + ' -o out.json', {'in.json': input});
}

var pointLabelLayer = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: {'label-text': 'Reno'},
    geometry: {type: 'Point', coordinates: [-119.8, 39.5]}
  }]
};

var polygonLayer = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: {n: 'a'},
    geometry: {type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]]}
  }]
};

describe('mapshaper-add-label.mjs', function () {

  describe('geometry', function () {
    it('one coordinate pair makes an anchored label', async function () {
      var out = await run("-add-label coordinates=-119.5,37.8 text=Reno");
      var f = geojson(out).features[0];
      assert.equal(f.geometry.type, 'Point');
      assert.deepEqual(f.geometry.coordinates, [-119.5, 37.8]);
      assert.equal(f.properties['label-text'], 'Reno');
    });

    it('several pairs make a path-aligned label', async function () {
      var out = await run("-add-label coordinates=0,0,10,8,20,0 text=Ridge");
      var f = geojson(out).features[0];
      assert.equal(f.geometry.type, 'MultiPoint');
      assert.deepEqual(f.geometry.coordinates, [[0, 0], [10, 8], [20, 0]]);
    });

    it('two pairs make a straight path label', async function () {
      var out = await run("-add-label coordinates=0,0,10,10 text=x");
      assert.equal(geojson(out).features[0].geometry.type, 'MultiPoint');
    });

    it('accepts a JSON array of pairs', async function () {
      var out = await run("-add-label coordinates='[[0,0],[5,5]]' text=x");
      assert.deepEqual(geojson(out).features[0].geometry.coordinates,
        [[0, 0], [5, 5]]);
    });

    it('accepts a flat JSON array', async function () {
      var out = await run("-add-label coordinates='[0,0,5,5]' text=x");
      assert.deepEqual(geojson(out).features[0].geometry.coordinates,
        [[0, 0], [5, 5]]);
    });
  });

  describe('label text', function () {
    it('defaults to an empty string', async function () {
      var out = await run("-add-label coordinates=0,0");
      assert.equal(geojson(out).features[0].properties['label-text'], '');
    });

    it('an explicit empty string is preserved', async function () {
      var out = await run("-add-label coordinates=0,0 text=''");
      assert.equal(geojson(out).features[0].properties['label-text'], '');
    });

    it('multi-line text is preserved verbatim', async function () {
      var out = await run("-add-label coordinates=0,0 text='North\\nDakota'");
      assert.equal(geojson(out).features[0].properties['label-text'],
        'North\\nDakota');
    });
  });

  describe('style options', function () {
    it('are stored as label properties', async function () {
      var out = await run("-add-label coordinates=0,0 text=x font-size=14 " +
        "font-family=Georgia fill=#333 text-anchor=middle");
      var p = geojson(out).features[0].properties;
      assert.equal(p['font-size'], '14');
      assert.equal(p['font-family'], 'Georgia');
      assert.equal(p.fill, '#333');
      assert.equal(p['text-anchor'], 'middle');
    });

    it('label-pos and offsets are accepted', async function () {
      var out = await run("-add-label coordinates=0,0 text=x label-pos=ne dx=3 dy=-2");
      var p = geojson(out).features[0].properties;
      assert.equal(p['label-pos'], 'ne');
      // given after label-pos, so they override what it expands to
      assert.equal(p.dx, '3');
      assert.equal(p.dy, '-2');
    });

    it('a style value is stored as the type -style would store it in', async function () {
      // The same value given to the two commands has to end up as one type.
      // It did not: -add-label copied the option string through while -style
      // converted it, so a layer holding a label from each had a column with a
      // string and a number in it -- and -add-label's own merge refuses that,
      // making the next label impossible to add.
      var viaAdd = await run("-add-label coordinates=0,0 text=x icon=circle icon-size=20");
      var viaStyle = await run("-add-label coordinates=0,0 text=x icon=circle -style icon-size=20");
      assert.deepStrictEqual(
        geojson(viaAdd).features[0].properties,
        geojson(viaStyle).features[0].properties);
      assert.strictEqual(geojson(viaAdd).features[0].properties['icon-size'], 20);
    });

    it('a label can be added beside one that -style created', async function () {
      var out = await run("-add-label coordinates=0,0 text=A icon=circle " +
        "-style icon-size=20 -add-label coordinates=1,1 text=B icon=circle icon-size=14");
      var features = geojson(out).features;
      assert.equal(features.length, 2);
      assert.deepStrictEqual(features.map(function(f) {
        return f.properties['icon-size'];
      }), [20, 14]);
    });

    it('a new label takes the types the target layer already uses', async function () {
      // Data read from a file can hold a size as a string. Refusing to add a
      // label to a layer like that would name a field the user never mentioned.
      var input = JSON.stringify({
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: {'label-text': 'A', icon: 'circle', 'icon-size': '20'},
          geometry: {type: 'Point', coordinates: [0, 0]}
        }]
      });
      var out = await runWith(input,
        "-add-label coordinates=1,1 text=B icon=circle icon-size=14");
      assert.deepStrictEqual(geojson(out).features.map(function(f) {
        return f.properties['icon-size'];
      }), ['20', '14']);
    });

    it('an unusable style value is rejected rather than stored', async function () {
      await assert.rejects(
        run("-add-label coordinates=0,0 text=x icon=circle icon-size=huge"),
        /Unexpected value for icon-size/);
    });

    it('label-pos is expanded into the properties that draw it', async function () {
      // nothing reads label-pos at render time: -style turns it into a
      // text-anchor and a dx/dy, and a label created with it has to match, or
      // it is stored in one position and drawn in another
      var viaAdd = await run("-add-label coordinates=0,0 text=x label-pos=sw");
      var viaStyle = await run("-add-label coordinates=0,0 text=x -style label-pos=sw");
      assert.deepStrictEqual(
        geojson(viaAdd).features[0].properties,
        geojson(viaStyle).features[0].properties);
      assert.equal(geojson(viaAdd).features[0].properties['text-anchor'], 'end');
    });

    it('an unusable label-pos is rejected', async function () {
      await assert.rejects(run("-add-label coordinates=0,0 text=x label-pos=nope"),
        /Unexpected value for label-pos/);
    });

    it('path alignment properties are accepted', async function () {
      var out = await run("-add-label coordinates=0,0,9,9 text=x " +
        "label-side=right label-start-offset=50%");
      var p = geojson(out).features[0].properties;
      assert.equal(p['label-side'], 'right');
      assert.equal(p['label-start-offset'], '50%');
    });

    it('properties= supplies anything else', async function () {
      var out = await run("-add-label coordinates=0,0 text=x properties='{\"rank\":2}'");
      assert.equal(geojson(out).features[0].properties.rank, 2);
    });

    it('command options do not leak into the record', async function () {
      var out = await run("-add-label coordinates=0,0 text=x name=mylabels");
      var p = geojson(out).features[0].properties;
      assert.ok(!('coordinates' in p), 'coordinates is not a property');
      assert.ok(!('text' in p), 'text is not a property');
      assert.ok(!('name' in p), 'name is not a property');
    });
  });

  describe('corners=', function () {
    it('is stored normalized', async function () {
      var out = await run("-add-label coordinates=0,0,10,8,20,0,30,8 text=x corners=' 1, 2 '");
      assert.equal(geojson(out).features[0].properties['label-corners'], '1,2');
    });

    it('is ignored on a label with fewer than 3 points', async function () {
      var out = await run("-add-label coordinates=0,0,10,8 text=x corners=1");
      assert.ok(!('label-corners' in geojson(out).features[0].properties));
    });

    it('rejects a non-numeric list', async function () {
      await assert.rejects(
        () => run("-add-label coordinates=0,0,1,1,2,2 text=x corners=abc"),
        /Invalid corners/);
    });

    it('out-of-range indexes do not fail the command', async function () {
      var out = await run("-add-label coordinates=0,0,10,8,20,0 text=x corners=99");
      assert.equal(geojson(out).features[0].properties['label-corners'], '99');
    });
  });

  describe('text-width=', function () {
    it('is stored as label-text-width', async function () {
      var out = await run("-add-label coordinates=0,0,9,9 text=x text-width=88.5");
      assert.equal(geojson(out).features[0].properties['label-text-width'], 88.5);
    });

    it('rejects a negative width', async function () {
      await assert.rejects(
        () => run("-add-label coordinates=0,0 text=x text-width=-5"),
        /Invalid text-width/);
    });

    it('is fingerprinted, so a later text change invalidates it', async function () {
      var a = await run("-add-label coordinates=0,0,9,9 text=x text-width=88.5");
      var b = await run("-add-label coordinates=0,0,9,9 text=y text-width=88.5");
      var hashA = geojson(a).features[0].properties['label-text-hash'];
      assert.ok(hashA, 'a hash is written alongside the width');
      assert.notEqual(hashA, geojson(b).features[0].properties['label-text-hash']);
    });

    it('the fingerprint also covers the font properties', async function () {
      var a = await run("-add-label coordinates=0,0,9,9 text=x text-width=88.5");
      var b = await run("-add-label coordinates=0,0,9,9 text=x text-width=88.5 font-size=20");
      assert.notEqual(geojson(a).features[0].properties['label-text-hash'],
        geojson(b).features[0].properties['label-text-hash']);
    });

    it('no width means no fingerprint', async function () {
      var out = await run("-add-label coordinates=0,0,9,9 text=x");
      assert.equal(geojson(out).features[0].properties['label-text-hash'], undefined);
    });
  });

  describe('coordinate validation', function () {
    it('rejects a missing coordinates option', async function () {
      await assert.rejects(() => run("-add-label text=x"),
        /Missing required coordinates/);
    });

    it('rejects an odd number of coordinates', async function () {
      await assert.rejects(() => run("-add-label coordinates=0,0,5 text=x"),
        /even number of coordinates/);
    });

    it('rejects non-numeric coordinates', async function () {
      await assert.rejects(() => run("-add-label coordinates=0,abc text=x"),
        /Unable to parse coordinates/);
    });
  });

  describe('target layer', function () {
    it('merges into an existing point label layer', async function () {
      var out = await runWith(pointLabelLayer,
        "-add-label coordinates=0,0,9,9 text=Sierra");
      var features = geojson(out).features;
      assert.equal(features.length, 2);
      assert.equal(features[0].properties['label-text'], 'Reno');
      assert.equal(features[1].properties['label-text'], 'Sierra');
      assert.equal(features[1].geometry.type, 'MultiPoint');
    });

    it('refuses a polygon target', async function () {
      await assert.rejects(
        () => runWith(polygonLayer, "-add-label coordinates=0.5,0.5 text=x"),
        /can only be added to a point layer/);
    });

    it('no-replace adds a new layer instead', async function () {
      var out = await api.applyCommands(
        '-i in.json -add-label coordinates=0.5,0.5 text=x no-replace ' +
        '-o out.json target=labels', {'in.json': polygonLayer});
      var features = geojson(out).features;
      assert.equal(features.length, 1);
      assert.equal(features[0].geometry.type, 'Point');
    });

    it('name= sets the new layer name', async function () {
      var out = await api.applyCommands(
        '-i in.json -add-label coordinates=0.5,0.5 text=x no-replace name=annotations ' +
        '-o out.json target=annotations', {'in.json': polygonLayer});
      assert.equal(geojson(out).features.length, 1);
    });
  });

  // The reason knots are stored as geometry rather than in an attribute is so
  // that every coordinate transform moves them. These assert that directly.
  describe('knots survive coordinate transforms', function () {
    it('-proj reprojects every knot', async function () {
      var out = await run("-add-label coordinates=-119.5,37.8,-118.9,38.1,-118.2,38 " +
        "text=Sierra -proj merc");
      var coords = geojson(out).features[0].geometry.coordinates;
      assert.equal(coords.length, 3);
      coords.forEach(function(p, i) {
        assert.ok(p[0] < -1e7 && p[0] > -1.4e7, 'knot ' + i + ' x projected: ' + p[0]);
        assert.ok(p[1] > 4e6 && p[1] < 5e6, 'knot ' + i + ' y projected: ' + p[1]);
      });
      // knots stay in order and distinct
      assert.ok(coords[0][0] < coords[1][0] && coords[1][0] < coords[2][0]);
    });

    it('-affine shifts every knot', async function () {
      var out = await run("-add-label coordinates=0,0,10,10 text=x -affine shift=100,200");
      assert.deepEqual(geojson(out).features[0].geometry.coordinates,
        [[100, 200], [110, 210]]);
    });

    it('-simplify leaves knots untouched', async function () {
      var out = await run("-add-label coordinates=0,0,10,10,20,0 text=x -simplify 20%");
      assert.deepEqual(geojson(out).features[0].geometry.coordinates,
        [[0, 0], [10, 10], [20, 0]]);
    });

    it('survives a TopoJSON round trip', async function () {
      var mid = await api.applyCommands(
        '-add-label coordinates=0,0,10,10,20,0 text=x -o mid.topojson');
      // note: a TopoJSON input keeps TopoJSON format unless one is given
      var out = await api.applyCommands('-i mid.topojson -o out.json format=geojson',
        {'mid.topojson': mid['mid.topojson']});
      var f = geojson(out).features[0];
      assert.equal(f.geometry.type, 'MultiPoint');
      assert.deepEqual(f.geometry.coordinates, [[0, 0], [10, 10], [20, 0]]);
      assert.equal(f.properties['label-text'], 'x');
    });
  });

  // the GUI edits labels by emitting -style, so the new properties have to be
  // settable that way too
  describe('-style can set the new properties', function () {
    it('label-corners', async function () {
      var out = await run("-add-label coordinates=0,0,5,5,9,0 text=x " +
        "-style label-corners=0,2");
      assert.equal(geojson(out).features[0].properties['label-corners'], '0,2');
    });

    it('label-corners rejects an invalid literal', async function () {
      await assert.rejects(
        () => run("-add-label coordinates=0,0,5,5 text=x -style label-corners=nope"),
        /Unexpected value for label-corners/);
    });

    it('label-corners accepts an expression, as every style property does', async function () {
      // -style values may be JS expressions, so a value that parses as one
      // bypasses literal validation. This is consistent with the other
      // properties rather than special to label-corners.
      var out = await run("-add-label coordinates=0,0,5,5,9,0 text=x " +
        "-style label-corners='\"0,\" + 2'");
      assert.equal(geojson(out).features[0].properties['label-corners'], '0,2');
    });

    it('label-text-width and label-text-hash', async function () {
      var out = await run("-add-label coordinates=0,0,5,5 text=x " +
        "-style label-text-width=120 label-text-hash=abc123");
      var p = geojson(out).features[0].properties;
      assert.equal(p['label-text-width'], 120);
      assert.equal(p['label-text-hash'], 'abc123');
    });

    it('dominant-baseline, which was previously unsettable', async function () {
      var out = await run("-add-label coordinates=0,0 text=x " +
        "-style dominant-baseline=central");
      assert.equal(geojson(out).features[0].properties['dominant-baseline'],
        'central');
    });
  });
});
