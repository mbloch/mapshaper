import assert from 'assert';
import api from '../mapshaper.js';
import { getAspectRatioArg } from '../src/commands/mapshaper-frame';
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

    // A square extent cannot tell "percent of width" from "percent per axis",
    // which is how the option came to be documented as the former. The sides
    // are inset by a share of the padded width, the top and bottom by a share
    // of the padded height: 10% of 125 and 10% of 62.5, not 10% of 100 twice.
    it('-frame percent offset is measured per axis', async function() {
      var out = await api.applyCommands(
        '-frame bbox=0,0,100,50 width=800 offset=10% -o out.json format=geojson'
      );
      var ring = JSON.parse(out['out.json']).features[0].geometry.coordinates[0];
      var xs = ring.map(p => p[0]);
      var ys = ring.map(p => p[1]);
      assert.deepEqual(
        [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
        [-12.5, -6.25, 112.5, 56.25]
      );
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
