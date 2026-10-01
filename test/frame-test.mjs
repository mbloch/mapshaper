import assert from 'assert';
import api from '../mapshaper.js';
import {
  applyFrameOffsets,
  getAspectRatioArg,
  parseFrameOffsets
} from '../src/commands/mapshaper-frame';
import { Bounds } from '../src/geom/mapshaper-bounds';
import { getFrameSize } from '../src/furniture/mapshaper-frame-utils';
import { captureLogCallsAsync } from './helpers';

describe('mapshaper-frame.js', function () {

  describe('-frame command', function() {

    it('-frame bbox=', async function() {
      var cmd = '-frame bbox=0,0,1,1 width=100px -o out.svg';
      var out = await api.applyCommands(cmd);
      var svg = out['out.svg'];
      assert(svg.includes('width="100" height="100" viewBox="0 0 100 100"'));
    });

    it('-frame explains that a data-only layer has nothing to fit', async function() {
      await assert.rejects(
        api.applyCommands('-i data.csv -frame width=600', {'data.csv': 'a,b\n1,2\n'}),
        /Unable to fit a frame to a layer with no geometry/);
    });

    it('-frame fits the layers with shapes among its targets', async function() {
      var cmd = '-i data.csv -rectangle bbox=0,0,2,1 name=box ' +
        '-frame width=200 target=data,box -o target=frame,box out.svg';
      var out = await api.applyCommands(cmd, {'data.csv': 'a,b\n1,2\n'});
      assert(String(out['out.svg']).includes('width="200" height="100"'));
    });

    it('-frame with default width', async function() {
      var cmd = '-rectangle bbox=0,0,2,1 -frame -o out.svg';
      var out = await api.applyCommands(cmd);
      var svg = out['out.svg'];
      assert(svg.includes('width="800" height="400" viewBox="0 0 800 400"'));
    });

    it('-frame with offsets', async function() {
      var cmd = '-rectangle bbox=0,0,1,1 -frame offsets=10,20,40,30 width=1000 -o target=frame,rectangle out.svg';
      var out = await api.applyCommands(cmd);
      var svg = out['out.svg'];
      assert(svg.includes('width="1000" height="1000" viewBox="0 0 1000 1000"'));
      assert(svg.includes('<path d="M 10 980 10 30 960 30 960 980 10 980 Z"'));
    });

    it('-frame with percent offset', async function() {
      var cmd = '-rectangle bbox=0,0,1,1 -frame offset=10% width=1000 -o target=frame,rectangle out.svg';
      var out = await api.applyCommands(cmd);
      var svg = out['out.svg'];
      assert(svg.includes('width="1000" height="1000" viewBox="0 0 1000 1000"'));
      assert(svg.includes('<path d="M 100 900 100 100 900 100 900 900 100 900 Z"'));
    });

    // As in CSS, a percentage is of the frame's width on every side, so that
    // the margin is even: 10% of the 125-wide padded frame, top and bottom too.
    it('-frame percent margin is a share of the frame width on every side', async function() {
      var out = await api.applyCommands(
        '-frame bbox=0,0,100,50 width=800 margin=10% -o out.json format=geojson'
      );
      assert.deepEqual(getOutputBbox(out), [-12.5, -12.5, 112.5, 62.5]);
      assert.equal(JSON.parse(out['out.json']).features[0].properties.height, 480);
    });

    it('-frame margin= takes CSS shorthand (top right bottom left)', async function() {
      // margins in px on an 800px frame: top 80, right 16, bottom 40, left 0
      var out = await api.applyCommands(
        '-frame bbox=0,0,784,100 width=800 margin=10%,2%,5%,0 -o out.json format=geojson'
      );
      assert.deepEqual(getOutputBbox(out), [0, -40, 800, 180]);
    });

    it('-frame margin= with two values is vertical, then horizontal', async function() {
      var out = await api.applyCommands(
        "-frame bbox=0,0,600,100 width=800 margin='10% 50px' -o out.json format=geojson"
      );
      // 700px wide inner area holds 600 units: 1 unit is 7/6 px
      var s = 6 / 7;
      assert.deepEqual(getOutputBbox(out).map(round),
        [-50 * s, -80 * s, 600 + 50 * s, 100 + 80 * s].map(round));
    });

    it('-frame margin= with three values is top, horizontal, bottom', async function() {
      var out = await api.applyCommands(
        '-frame bbox=0,0,600,100 width=800 margin=0,100px,10% -o out.json format=geojson'
      );
      assert.deepEqual(getOutputBbox(out), [-100, -80, 700, 100]);
    });

    it('-frame offset= and offsets= keep l,b,r,t order', async function() {
      for (var name of ['offset', 'offsets']) {
        var out = await api.applyCommands('-frame bbox=0,0,784,100 width=800 ' +
          name + '=0,5%,2%,10% -o out.json format=geojson');
        assert.deepEqual(getOutputBbox(out), [0, -40, 800, 180]);
      }
    });

    it('-frame percent margin with height= only is a share of the derived width', async function() {
      var out = await api.applyCommands(
        '-frame bbox=0,0,300,100 height=200 margin=10% -o out.json format=geojson'
      );
      var json = JSON.parse(out['out.json']);
      var bbox = getOutputBbox(out);
      var w = bbox[2] - bbox[0];
      assert.equal(round(-bbox[0]), round(w * 0.1));
      assert.equal(round(bbox[3] - 100), round(w * 0.1));
      assert.equal(json.features[0].properties.height, 200);
    });

    it('-frame rejects bad offset lists', async function() {
      await assert.rejects(
        api.applyCommands('-frame bbox=0,0,1,1 margin=1,2,3,4,5'),
        /one to four values/);
      await assert.rejects(
        api.applyCommands('-frame bbox=0,0,1,1 offsets=1,2'),
        /one value or four/);
      await assert.rejects(
        api.applyCommands('-frame bbox=0,0,1,1 offset=1,2,3'),
        /one value or four/);
      await assert.rejects(
        api.applyCommands('-frame bbox=0,0,1,1 margin=1 offset=1'),
        /mutually exclusive/);
      await assert.rejects(
        api.applyCommands('-frame bbox=0,0,1,1 margin=0,50%'),
        /100% or more/);
      await assert.rejects(
        api.applyCommands('-frame bbox=0,0,1,1 width=100 margin=60px'),
        /no room/);
    });

    it('-frame with height= and width= property', async function() {
      var cmd = '-rectangle bbox=0,0,1,1 -frame offset=10% width=1000 height=500 -o target=frame,rectangle out.svg';
      var out = await api.applyCommands(cmd);
      var svg = out['out.svg'];
      assert(svg.includes('width="1000" height="500" viewBox="0 0 1000 500"'));
      // assert(svg.includes('<path d="M 100 900 100 100 900 100 900 900 100 900 Z"'));
    });

    it('-frame with height= property, no width= property', async function() {
      var cmd = '-rectangle bbox=0,0,1,1 -frame offset=10% height=500 -o target=frame,rectangle out.svg';
      var out = await api.applyCommands(cmd);
      var svg = out['out.svg'];
      assert(svg.includes('width="500" height="500" viewBox="0 0 500 500"'));
      assert(svg.includes('<path d="M 50 450 50 50 450 50 450 450 50 450 Z"'));
    });

    it('-o width= overrides the nominal frame size', async function() {
      var out = await api.applyCommands('-frame bbox=0,0,2,1 width=800 -o out.svg width=400');
      var svg = String(out['out.svg']);
      assert(svg.includes('width="400" height="200" viewBox="0 0 400 200"'));
    });

    it('-o height= overrides the nominal frame size', async function() {
      var out = await api.applyCommands('-frame bbox=0,0,2,1 width=800 -o out.svg height=100');
      var svg = String(out['out.svg']);
      assert(svg.includes('width="200" height="100" viewBox="0 0 200 100"'));
    });

    it('-o width= overrides frame size in pixel TopoJSON', async function() {
      var out = await api.applyCommands(
        '-frame bbox=0,0,2,1 width=800 -o out.json format=topojson width=400 no-quantization bbox'
      );
      var topology = JSON.parse(out['out.json']);
      assert.deepEqual(topology.bbox, [0, 0, 400, 200]);
    });

    it('warns when output size overrides nominal frame size', async function() {
      var captured = await captureLogCallsAsync(function() {
        return api.applyCommands('-frame bbox=0,0,2,1 width=800 -o out.svg width=400');
      });
      assert(captured.log.some(function(str) {
        return str.includes("overrides the map frame's nominal size") &&
          str.includes('symbol and label sizes are not rescaled');
      }));
    });

    it('does not export unstyled frame geometry', async function() {
      var out = await api.applyCommands('-frame bbox=0,0,2,1 width=800 -o out.svg');
      var svg = String(out['out.svg']);
      assert.equal(svg.includes('<path'), false);
    });

    it('exports explicitly styled frame geometry', async function() {
      var out = await api.applyCommands(
        '-frame bbox=0,0,2,1 width=800 -style stroke=red -o out.svg'
      );
      var svg = String(out['out.svg']);
      assert(svg.includes('<path'));
      assert(svg.includes('stroke="red"'));
    });

    it('exports frame fill below content and neatline above content', async function() {
      var out = await api.applyCommands(
        '-rectangle bbox=0,0,2,1 name=content -style fill=blue ' +
        '-frame bbox=0,0,2,1 width=800 name=frame ' +
        '-style fill=beige stroke=red stroke-width=2 ' +
        '-o target=content,frame out.svg'
      );
      var svg = String(out['out.svg']);
      var background = svg.indexOf('id="frame-background"');
      var content = svg.indexOf('id="content"');
      var neatline = svg.indexOf('id="frame-neatline"');
      assert(background > -1);
      assert(content > background);
      assert(neatline > content);
    });

    it('applies explicit GUI frame context without a frame layer', function() {
      var dataset = api.internal.importGeoJSON({
        type: 'Feature',
        properties: {fill: 'blue'},
        geometry: {
          type: 'Polygon',
          coordinates: [[[0, 0], [2, 0], [2, 1], [0, 1], [0, 0]]]
        }
      });
      dataset.layers[0].name = 'content';
      var files = api.internal.exportSVG(dataset, {
        gui_frame: {
          data: {bbox: [0, 0, 2, 1], width: 800, height: 400, units: 'px'},
          name: 'frame',
          style: {fill: 'beige', stroke: 'red', 'stroke-width': 2}
        }
      });
      var svg = String(files[0].content);
      var background = svg.indexOf('id="frame-background"');
      var content = svg.indexOf('id="content"');
      var neatline = svg.indexOf('id="frame-neatline"');
      assert(svg.includes('width="800" height="400"'));
      assert(background > -1);
      assert(content > background);
      assert(neatline > content);
    });

    it('rejects a second frame', async function() {
      await assert.rejects(
        api.applyCommands('-frame bbox=0,0,2,1 width=800 -frame bbox=0,0,1,1 width=400'),
        /A map frame already exists/
      );
    });

    it('-frame replace demotes the old frame', async function() {
      var out = await api.applyCommands(
        '-frame bbox=0,0,2,1 width=800 -frame bbox=0,0,1,1 width=200 replace -o out.svg'
      );
      assert(String(out['out.svg']).includes('width="200" height="200"'));
    });

    it('rejects duplicating a frame layer', async function() {
      await assert.rejects(
        api.applyCommands('-frame bbox=0,0,2,1 width=800 -filter true +'),
        /Multiple map frames are not supported/
      );
    });

    it('writes canonical frame units and aspect ratio fields', async function() {
      var out = await api.applyCommands(
        '-frame bbox=0,0,2,1 width=5in height=2.5in -o out.json format=geojson'
      );
      var properties = JSON.parse(out['out.json']).features[0].properties;
      assert.equal(properties.frame_units, 'in');
      assert.equal(properties.frame_aspect_ratio, 2);
    });
  });

  describe('applyFrameOffsets()', function() {
    it('centers the content on a fixed page, keeping the margins as a minimum', function() {
      // 10% of 1000px = 100px each side; inner area 800x300 holds a unit square
      // at 300px per unit, so the sides get the extra space
      var bbox = [0, 0, 1, 1];
      applyFrameOffsets(bbox, parseFrameOffsets({margin: ['10%']}), {width: 1000, height: 500});
      var s = 1 / 300;
      assert.deepEqual(bbox.map(round),
        [-(100 + 250) * s, -100 * s, 1 + 350 * s, 1 + 100 * s].map(round));
      assert.equal(round((bbox[2] - bbox[0]) / (bbox[3] - bbox[1])), 2);
    });

    it('pads at a held scale', function() {
      var bbox = [0, 0, 4, 2];
      applyFrameOffsets(bbox, parseFrameOffsets({margin: ['10%']}), {scale: 0.0025});
      assert.deepEqual(bbox, [-0.5, -0.5, 4.5, 2.5]);
    });

    it('fills out to the page shape without offsets', function() {
      var bbox = [0, 0, 1, 1];
      applyFrameOffsets(bbox, null, {width: 200, height: 100});
      assert.deepEqual(bbox, [-0.5, 0, 1.5, 1]);
    });
  });

  describe('getAspectRatioArg()', function() {
    it('works with height range', function() {
      var out = getAspectRatioArg('4', '1,2');
      assert.equal(out, '2,4');
    });
  });

  describe('getFrameSize()', function () {
    it('works with pixels option', function () {
      var bounds = new Bounds(0, 0, 4, 2);
      var opts = {
        pixels: 200
      };
      var out = getFrameSize(bounds, opts);
      assert.deepEqual(out, [20, 10]);
    })
  })
});

function getOutputBbox(out) {
  var ring = JSON.parse(out['out.json']).features[0].geometry.coordinates[0];
  var xs = ring.map(p => p[0]);
  var ys = ring.map(p => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

function round(n) {
  return Math.round(n * 1e9) / 1e9;
}
