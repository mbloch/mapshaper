import api from '../mapshaper.js';
import assert from 'assert';

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

describe('mapshaper-symbols.js', function () {

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
