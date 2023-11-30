import assert from 'assert';
import api from '../mapshaper.js';

describe('Features with invalid point coordinates are imported without geometry', function () {
  var target = {
    type: 'Feature',
    geometry: null,
    properties: {"GEO_ID":533064,"X":0,"Y":0,"STRUCTID":"NY148414","ADDRESS":31,"SUFFIX":"","NAME":"KENASTON GDNS","DBH_TRUNK":15,"TREE_POSIT":20,"COMMON_NAM":"WHITE SPRUCE","BOTANICAL_":"Picea glauca"}
  };

  it('.shp with large negative values', function (done) {
    var cmd = '-i test/data/issues/invalid_coords/invalid_coordinates.shp -o gj2008 out.json';
    api.applyCommands(cmd, {}, function(err, out) {
      assert.deepEqual(JSON.parse(out['out.json']).features[0], target);
      done();
    });
  })
  it('GeoJSON with large negative values', function (done) {
    var cmd = '-i test/data/issues/invalid_coords/invalid_coordinates.json -o out.json';
    api.applyCommands(cmd, {}, function(err, out) {
      assert.deepEqual(JSON.parse(out['out.json']).features[0], target);
      done();
    });
  })
})
