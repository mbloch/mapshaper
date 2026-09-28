import api from '../mapshaper.js';
import assert from 'assert';
import { getOptionParser } from '../src/cli/mapshaper-options';

var points = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: {NAME: 'Reno'},
    geometry: {type: 'Point', coordinates: [-119.8, 39.5]}
  }, {
    type: 'Feature',
    properties: {NAME: 'Elko'},
    geometry: {type: 'Point', coordinates: [-115.8, 40.8]}
  }]
};

var polygons = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: {n: 'a'},
    geometry: {type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]]}
  }]
};

// Inputs are passed as strings, because importing a GeoJSON object keeps its
// property objects as records, so a test would restyle the shared fixture.
async function run(cmd, input) {
  var out = await api.applyCommands('-i in.json ' + cmd + ' -o out.json',
    {'in.json': JSON.stringify(input || points)});
  return JSON.parse(out['out.json']);
}

function props(json) {
  return json.features.map(function(f) { return f.properties; });
}

describe('mapshaper-labels.mjs', function () {

  describe('styling a point layer', function () {
    it('text= converts points to labels, reading a field', async function () {
      var json = await run('-labels text=NAME');
      assert.deepEqual(props(json).map(function(p) { return p['label-text']; }),
        ['Reno', 'Elko']);
    });

    it('text= takes an expression', async function () {
      var json = await run("-labels 'text=NAME.toUpperCase()'");
      assert.equal(props(json)[1]['label-text'], 'ELKO');
    });

    it('label-text= is accepted as another name for text=', async function () {
      var json = await run('-labels label-text=NAME');
      assert.equal(props(json)[0]['label-text'], 'Reno');
    });

    it('ids= limits styling to some labels', async function () {
      var json = await run('-labels text=NAME halo-width=2 ids=1');
      assert.equal(props(json)[0]['halo-width'], undefined);
      assert.equal(props(json)[1]['halo-width'], 2);
    });

    it('where= limits styling to some labels', async function () {
      var json = await run("-labels text=NAME font-weight=bold where='NAME == \"Reno\"'");
      assert.equal(props(json)[0]['font-weight'], 'bold');
      assert.equal(props(json)[1]['font-weight'], undefined);
    });

    it('writes the same properties as -style', async function () {
      var opts = 'font-size=14 fill=#c00 label-pos=ne halo-width=2 ' +
        'callout=line icon=star icon-size=6';
      var a = await run('-labels text=NAME ' + opts);
      var b = await run('-style label-text=NAME ' + opts);
      assert.deepEqual(a, b);
    });

    it('+ makes a labeled copy, leaving the points alone', async function () {
      var out = await api.applyCommands(
        '-i in.json -labels text=NAME + name=lbl -o format=geojson target=*',
        {'in.json': JSON.stringify(points)});
      var src = JSON.parse(out['in.json']);
      var copy = JSON.parse(out['lbl.json']);
      assert.ok(!('label-text' in src.features[0].properties));
      assert.equal(copy.features[0].properties['label-text'], 'Reno');
      assert.equal(copy.features.length, 2);
    });

    it('refuses a polygon layer', async function () {
      await assert.rejects(() => run('-labels text=n', polygons),
        /Labels can only be applied to a point layer/);
    });
  });

  describe('adding a label with coordinates=', function () {
    it('adds a label to the target point layer', async function () {
      var json = await run("-labels coordinates=-118,39 text='Carson City' font-size=14");
      var f = json.features[2];
      assert.equal(json.features.length, 3);
      assert.deepEqual(f.geometry.coordinates, [-118, 39]);
      assert.equal(f.properties['label-text'], 'Carson City');
      assert.equal(f.properties['font-size'], '14');
    });

    it('works with nothing loaded', async function () {
      var out = await api.applyCommands('-labels coordinates=0,0 text=Hi -o out.json');
      var f = JSON.parse(out['out.json']).features[0];
      assert.equal(f.properties['label-text'], 'Hi');
    });

    it('text= is literal text', async function () {
      var json = await run('-labels coordinates=0,0 text=NAME');
      assert.equal(json.features[2].properties['label-text'], 'NAME');
    });

    it('several pairs make a path label', async function () {
      var json = await run('-labels coordinates=0,0,10,8,20,0 text=Ridge');
      assert.equal(json.features[2].geometry.type, 'MultiPoint');
    });

    it('matches -add-label', async function () {
      var cmd = " coordinates=1,2 text=x label-pos=n icon=circle properties='{\"rank\":2}'";
      assert.deepEqual(await run('-labels' + cmd), await run('-add-label' + cmd));
    });

    it('refuses ids= and where=', async function () {
      await assert.rejects(() => run('-labels coordinates=0,0 text=x ids=0'),
        /can not be used with coordinates=/);
      await assert.rejects(() => run("-labels coordinates=0,0 text=x where='true'"),
        /can not be used with coordinates=/);
    });

    it('reports a missing value', async function () {
      await assert.rejects(() => run('-labels coordinates= text=x'),
        /Missing required coordinates/);
    });
  });

  describe('options that belong to one mode', function () {
    it('properties= requires coordinates=', async function () {
      await assert.rejects(() => run("-labels text=NAME properties='{}'"),
        /properties= requires coordinates=/);
    });

    it('name= requires coordinates= or +', async function () {
      await assert.rejects(() => run('-labels text=NAME name=x'),
        /name= requires coordinates= or \+/);
    });
  });

  describe('-style', function () {
    function helpOptions(name) {
      return getOptionParser().getHelpMessage(name);
    }

    it('still accepts the label options, for older scripts', async function () {
      var json = await run('-style label-text=NAME halo-width=1 callout=line font-size=10');
      assert.equal(props(json)[0]['label-text'], 'Reno');
      assert.equal(props(json)[0]['halo-width'], 1);
      assert.equal(props(json)[0].callout, 'line');
    });

    it('leaves label options out of its help', function () {
      var help = helpOptions('style');
      ['label-text=', 'halo-width=', 'callout=', 'font-size=', 'dx='].forEach(function(opt) {
        assert.ok(!help.includes(opt), opt);
      });
      ['fill=', 'stroke=', 'r=', 'icon='].forEach(function(opt) {
        assert.ok(help.includes(opt), opt);
      });
    });

    it('-labels documents them instead', function () {
      var help = helpOptions('labels');
      ['text=', 'coordinates=', 'halo-width=', 'callout=', 'font-size=', 'icon='].forEach(function(opt) {
        assert.ok(help.includes(opt), opt);
      });
    });
  });
});
