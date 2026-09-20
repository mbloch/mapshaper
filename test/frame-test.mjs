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
